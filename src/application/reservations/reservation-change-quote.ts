import type {
  AvailabilityCatalog,
  InventoryReader,
} from "@/application/inventory";
import type { RateBatchReader } from "@/application/pricing";
import type { ServiceOfferingRepository } from "@/application/services";
import type { IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  success,
  type Result,
  type InventoryUnavailableError,
} from "@/application/shared/result";
import { AvailabilityCalculator } from "@/domain/inventory";
import {
  NightlyPriceResolver,
  QuoteCalculator,
  type ResolvedNightPrice,
} from "@/domain/pricing";
import {
  planReservationChange,
  type PlannedChangeLine,
  type ReservationChangePlan,
} from "@/domain/reservations";
import type { NormalizedService } from "@/domain/services";
import { Money } from "@/domain/shared/money";
import type { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import { localDateAt } from "@/domain/shared/zoned-time";
import type {
  ReservationRepository,
  StoredReservation,
  StoredReservationNight,
  StoredReservationSnapshot,
} from "./ports";
import { priceChangedServices } from "./reservation-change-services";

const MAX_AMOUNT = 2_147_483_647;

export type ChangeQuoteReaders = Readonly<{
  catalog: AvailabilityCatalog;
  inventoryReader: InventoryReader;
  rates: RateBatchReader;
  services: Pick<ServiceOfferingRepository, "listByBranch">;
}>;

export type RequestedChange = Readonly<{
  stay: StayRange;
  lines: readonly { roomTypeId: string; occupancy: Occupancy }[];
  services?: readonly NormalizedService[] | undefined;
}>;

export type ChangePriceOverride = Readonly<{
  nights: readonly (readonly ResolvedNightPrice<"MANUAL">[])[];
  reason: string;
}>;

export type AvailableReservationChange = Readonly<{
  available: true;
  plan: ReservationChangePlan;
  snapshot: StoredReservationSnapshot;
  originalTotalMinor: number;
  pricedLines: readonly (readonly StoredReservationNight[])[];
  subtotals: readonly number[];
}>;

type ChangeQuote =
  | AvailableReservationChange
  | Readonly<{
      available: false;
      unavailableLines: readonly number[];
      error: InventoryUnavailableError;
    }>;

/** Shared PR-11 pricing. Preview calls it unlocked and apply calls it under the listing locks. */
export async function quoteReservationChange(
  context: ChangeQuoteReaders,
  current: StoredReservation,
  requested: RequestedChange,
  at: Date,
  options: Readonly<{
    override: ChangePriceOverride | null;
    publicListings?: boolean;
    contactChanged?: boolean;
  }>,
): Promise<Result<ChangeQuote>> {
  const { branchId } = current;
  const { override } = options;
  if (!current.snapshot)
    return invalid("Check the change.", [
      {
        path: "stay",
        message: "A reservation without recorded prices cannot be changed.",
      },
    ]);
  if (current.source === "EXTERNAL" && requested.services?.length)
    return invalid("Check the services.", [
      {
        path: "services",
        message: "External reservations cannot include services.",
      },
    ]);
  const snapshot = current.snapshot;
  const today = localDateAt(at, current.branchTimeZone);
  const plan = planReservationChange(current, requested, {
    today,
    allowPriceOnly: override !== null || options.contactChanged === true,
  });
  const started = current.stay.checkIn.compare(today) < 0;
  if (started && override)
    return invalid("Check the price override.", [
      {
        path: "priceOverride",
        message:
          "Nights before today keep their price: a started stay cannot be overridden.",
      },
    ]);
  const unavailable = new Map<string, InventoryUnavailableError>();
  if (plan.structureChanged || override) {
    const listings = new Map(
      (await context.catalog.listRoomTypes(branchId, "ALL")).map((listing) => [
        listing.id,
        listing,
      ]),
    );
    const published =
      options.publicListings &&
      plan.lines.some((line) => line.continuesLineId === null)
        ? new Set(
            (await context.catalog.listRoomTypes(branchId, "PUBLISHED")).map(
              (listing) => listing.id,
            ),
          )
        : null;
    const quantities = new Map<string, number>();
    for (const [index, line] of requested.lines.entries()) {
      const listing = listings.get(line.roomTypeId);
      if (
        !listing ||
        (published &&
          plan.lines[index]!.continuesLineId === null &&
          !published.has(line.roomTypeId))
      )
        return failure("NOT_FOUND", "This listing was not found.");
      if (!line.occupancy.fits(listing))
        return invalid("Check the units.", [
          {
            path: `lines.${index}.occupancy`,
            message: "The occupancy exceeds this listing's limits.",
          },
        ]);
      quantities.set(
        line.roomTypeId,
        (quantities.get(line.roomTypeId) ?? 0) + 1,
      );
    }

    // Availability, with this reservation's own units taken out of what is sold.
    // A stay that has started only needs capacity for the nights it gains: its
    // nights before today are history and are not checked again.
    const checkedStay = started
      ? requested.stay.checkOut.compare(current.stay.checkOut) > 0
        ? StayRange.create(current.stay.checkOut, requested.stay.checkOut)
        : null
      : requested.stay;
    const inventory = checkedStay
      ? await context.inventoryReader.readNights({
          branchId,
          roomTypeIds: [...quantities.keys()],
          nights: [...checkedStay.nights()],
        })
      : success([]);
    if (!inventory.ok) return inventory;
    const own = new Map<string, number>();
    for (const line of current.lines) {
      if (!line.consumesInventory) continue;
      for (const night of line.stay.nights()) {
        const key = `${line.roomTypeId}\u0000${night.value}`;
        own.set(key, (own.get(key) ?? 0) + 1);
      }
    }
    for (const [roomTypeId, quantity] of checkedStay ? quantities : []) {
      const free = AvailabilityCalculator.check({
        stay: checkedStay!,
        quantity,
        nights: inventory.value
          .filter((record) => record.roomTypeId === roomTypeId)
          .map((record) => ({
            ...record,
            sold: Math.max(
              0,
              record.sold -
                (own.get(`${roomTypeId}\u0000${record.night.value}`) ?? 0),
            ),
          })),
      });
      if (!free.available) {
        const error = {
          code: "INVENTORY_UNAVAILABLE",
          message: "The requested inventory is no longer available.",
          context: {
            roomTypeId,
            firstUnavailableNight: free.firstUnavailableNight.value,
          },
        } as const;
        unavailable.set(roomTypeId, error);
        if (!options.publicListings) return { ok: false, error };
      }
    }
  }

  const currentRatesResult = await currentRates(
    context,
    plan,
    requested,
    options.publicListings === true,
  );
  if (!currentRatesResult.ok) return currentRatesResult;
  const { rates: rateByType, missing } = currentRatesResult.value;
  const conflict =
    unavailable.values().next().value ?? missing.values().next().value;
  if (conflict) {
    return success({
      available: false,
      unavailableLines: plan.lines.flatMap((line, index) =>
        unavailable.has(line.roomTypeId) ||
        line.needsCurrentPrice.some(
          (night) =>
            rateByType.get(line.roomTypeId)?.get(night.value)?.amount == null,
        )
          ? [index]
          : [],
      ),
      error: conflict,
    });
  }
  const nightsFor = (
    planned: PlannedChangeLine,
  ): readonly StoredReservationNight[] => {
    const retained = new Map(
      (planned.retained as readonly StoredReservationNight[]).map((night) => [
        night.night.value,
        night,
      ]),
    );
    const priced = rateByType.get(planned.roomTypeId);
    return [...requested.stay.nights()].map((night) => {
      const kept = retained.get(night.value);
      if (kept) return kept;
      const fresh = priced?.get(night.value);
      if (!fresh) throw new Error("A new night was not priced.");
      return {
        night,
        amount: fresh.amount,
        source: fresh.source,
        periodId: fresh.periodId,
        label: fresh.label,
      };
    });
  };
  const repriced = plan.lines.map(nightsFor);
  const guests = {
    adults: requested.lines.reduce(
      (sum, line) => sum + line.occupancy.adults,
      0,
    ),
    children: requested.lines.reduce(
      (sum, line) => sum + line.occupancy.children,
      0,
    ),
  };
  const needsOfferings = plan.services.some(
    (service) => service.added || service.changedVehiclesAt !== null,
  );
  const offerings = needsOfferings
    ? await context.services.listByBranch(branchId)
    : [];
  const pricedServices = priceChangedServices(
    current.stay,
    snapshot.serviceLines,
    plan,
    offerings,
    today,
    guests,
  );
  if (!pricedServices.ok) return pricedServices;
  const services = pricedServices.value;
  const priceFrom = (
    nights: readonly (readonly ResolvedNightPrice<string>[])[],
  ) =>
    QuoteCalculator.compute({
      lines: nights.map((line) => ({ nights: line })),
      guests,
      services: services.map((service) => service.pricing),
      ...(snapshot.couponValue ? { coupon: snapshot.couponValue } : {}),
      vatRateBasisPoints: snapshot.vatRateBasisPoints,
    });
  const original = priceFrom(repriced);
  const quote = override ? priceFrom(override.nights) : original;
  if (
    [quote.totalMinor, original.totalMinor, quote.subtotalMinor].some(
      (amount) => amount > MAX_AMOUNT,
    ) ||
    quote.serviceLines.some((line) => line.amountMinor > MAX_AMOUNT)
  )
    return invalid("The reservation amount is too large.", [
      { path: "lines", message: "Use smaller amounts." },
    ]);
  if (
    override &&
    !plan.structureChanged &&
    repriced.every((nights, line) =>
      nights.every(
        (night, index) =>
          night.amount?.amountMinor ===
          override.nights[line]![index]!.amount?.amountMinor,
      ),
    )
  )
    return invalid("Check the price override.", [
      {
        path: "priceOverride",
        message: "These are already the prices of this stay.",
      },
    ]);
  const { serviceLines, lines: priceLines, ...totals } = quote;
  const nextSnapshot: StoredReservationSnapshot = {
    ...totals,
    couponValue: snapshot.couponValue,
    serviceLines: serviceLines.map((line, index) => ({
      ...line,
      details: services[index]!.details,
      occupancyEffectiveFrom: services[index]!.occupancyEffectiveFrom,
    })),
  };
  return success({
    available: true,
    plan,
    snapshot: nextSnapshot,
    originalTotalMinor: original.totalMinor,
    pricedLines: override
      ? override.nights.map((nights) =>
          nights.map((night) => ({ ...night, periodId: null, label: null })),
        )
      : repriced,
    subtotals: priceLines.map((line) => line.accommodationMinor),
  });
}

export async function materializeChangedLines(
  context: { reservations: Pick<ReservationRepository, "unitFree"> },
  current: StoredReservation,
  stay: StayRange,
  change: AvailableReservationChange,
  ids: IdGenerator,
) {
  const { branchId, id } = current;
  const { plan, pricedLines, subtotals } = change;
  // A unit keeps its physical room while that room is still free for the new
  // stay (no other assignment, no block, still active); otherwise the room is
  // released and assigned again at the desk. An unchanged stay always keeps it.
  const assignments: (string | null)[] = [];
  for (const planned of plan.lines) {
    const unit = planned.assignedPhysicalRoomId;
    assignments.push(
      unit === null ||
        !plan.stayChanged ||
        (await context.reservations.unitFree(
          branchId,
          unit,
          planned.roomTypeId,
          stay,
          id,
        ))
        ? unit
        : null,
    );
  }
  const lines = plan.lines.map((planned, index) => ({
    id: planned.continuesLineId ?? ids.next(),
    roomTypeId: planned.roomTypeId,
    physicalRoomId: assignments[index]!,
    occupancy: planned.occupancy,
    subtotal: Money.create({
      amountMinor: subtotals[index]!,
      currency: "USD",
    }),
    nights: pricedLines[index]!,
  }));
  return lines;
}

/** Today's nightly amounts, only for listings that have a night to price. */
async function currentRates(
  context: ChangeQuoteReaders,
  plan: ReservationChangePlan,
  requested: RequestedChange,
  collectMissing: boolean,
): Promise<
  Result<{
    rates: ReadonlyMap<string, ReadonlyMap<string, ResolvedNightPrice>>;
    missing: ReadonlyMap<string, InventoryUnavailableError>;
  }>
> {
  const needed = new Map<string, Set<string>>();
  for (const line of plan.lines)
    for (const night of line.needsCurrentPrice) {
      const set = needed.get(line.roomTypeId) ?? new Set<string>();
      set.add(night.value);
      needed.set(line.roomTypeId, set);
    }
  const result = new Map<string, ReadonlyMap<string, ResolvedNightPrice>>();
  const missing = new Map<string, InventoryUnavailableError>();
  if (needed.size === 0) return success({ rates: result, missing });
  const rates = await context.rates.readMany(
    [...needed.keys()],
    requested.stay,
  );
  for (const [roomTypeId, nights] of needed) {
    const rate = rates.get(roomTypeId);
    const price = NightlyPriceResolver.resolve({
      stay: requested.stay,
      baseRate: rate?.baseRate?.amount ?? null,
      // The resolver is strict: pass its five fields, never the stored row.
      periods: (rate?.periods ?? []).map(
        ({ id, range, amount, active, label }) => ({
          id,
          range,
          amount,
          active,
          label,
        }),
      ),
    });
    const byNight = new Map(
      price.nights.map((night) => [night.night.value, night]),
    );
    for (const night of [...nights].sort()) {
      if (byNight.get(night)?.amount == null) {
        const error = {
          code: "INVENTORY_UNAVAILABLE",
          message: "A requested listing has a night without a rate.",
          context: { roomTypeId, firstUnavailableNight: night },
        } as const;
        if (!collectMissing) return { ok: false, error };
        missing.set(roomTypeId, error);
        break;
      }
    }
    result.set(roomTypeId, byNight);
  }
  return success({ rates: result, missing });
}
