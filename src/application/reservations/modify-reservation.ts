import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  InventoryGuard,
  type AvailabilityCatalog,
} from "@/application/inventory";
import type { QueueReservationMessages } from "@/application/notifications";
import type { RateBatchReader } from "@/application/pricing";
import type { ServiceOfferingRepository } from "@/application/services";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  priceChanged,
  type Result,
  staleVersion,
  success,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { AvailabilityCalculator } from "@/domain/inventory";
import {
  NightlyPriceResolver,
  QuoteCalculator,
  type ResolvedNightPrice,
} from "@/domain/pricing";
import {
  canModifyReservationStay,
  planReservationChange,
  summarizeReservation,
  type PlannedChangeLine,
  type ReservationChangePlan,
} from "@/domain/reservations";
import {
  parseRequestedServices,
  type NormalizedService,
} from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import { localDateAt } from "@/domain/shared/zoned-time";

import type {
  ReservationUnitOfWork,
  StoredReservation,
  StoredReservationLine,
  StoredReservationNight,
  StoredReservationSnapshot,
} from "./ports";
import { priceChangedServices } from "./reservation-change-services";
import { manualNights, type Amounts } from "./staff-reservation-input";
import {
  findStaffReservation,
  staffReservationView,
  type StaffReservationReader,
  type StaffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

// Operational limit, as for S3: the public stay policy does not apply to staff.
const MAX_STAFF_STAY_NIGHTS = 366;
const MAX_AMOUNT = 2_147_483_647;

export type ModifyReservationContext = ReservationStorageContext &
  Readonly<{
    catalog: AvailabilityCatalog;
    rates: RateBatchReader;
    services: Pick<ServiceOfferingRepository, "listByBranch">;
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

export type ModifyReservationInput = Readonly<{
  stay: { checkIn: string; checkOut: string };
  lines: readonly {
    roomTypeId: string;
    occupancy: { adults: number; children: number };
  }[];
  services?: readonly unknown[] | undefined;
  acceptedTotal: { amountMinor: number; currency: "USD" };
  priceOverride?: { lines: readonly Amounts[]; reason: string } | undefined;
  notifyGuest?: boolean | undefined;
}>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<ModifyReservationContext>;
  reads: Pick<StaffReservationReader, "findVisible">;
  ids: IdGenerator;
  clock: Clock;
}>;

type Requested = Readonly<{
  stay: StayRange;
  lines: readonly { roomTypeId: string; occupancy: Occupancy }[];
  services?: readonly NormalizedService[] | undefined;
}>;
type Override = Readonly<{
  nights: readonly (readonly ResolvedNightPrice<"MANUAL">[])[];
  reason: string;
}>;
type Loaded = Readonly<{
  at: Date;
  locked: StoredReservation;
  plan: ReservationChangePlan;
  lines: readonly Omit<StoredReservationLine, "stay" | "consumesInventory">[];
  snapshot: StoredReservationSnapshot;
  originalTotalMinor: number;
}>;

const notFound = () => failure("NOT_FOUND", "This reservation was not found.");

function parseRequest(input: ModifyReservationInput): {
  requested: Requested;
  override: Override | null;
} {
  const stay = StayRange.create(
    LocalDate.parse(input.stay.checkIn),
    LocalDate.parse(input.stay.checkOut),
  );
  if (stay.nightCount > MAX_STAFF_STAY_NIGHTS)
    throw new DomainValidationError("Check the stay dates.", [
      {
        path: "stay.checkOut",
        message: `Use a stay of at most ${MAX_STAFF_STAY_NIGHTS} nights.`,
      },
    ]);
  if (input.lines.length < 1 || input.lines.length > 5)
    throw new DomainValidationError("Check the units.", [
      { path: "lines", message: "Choose one to five units." },
    ]);
  const lines = input.lines.map((line) => ({
    roomTypeId: line.roomTypeId,
    occupancy: Occupancy.create(line.occupancy),
  }));
  let override: Override | null = null;
  if (input.priceOverride) {
    const reason = input.priceOverride.reason.trim();
    if (
      reason.length < 1 ||
      reason.length > 500 ||
      /[\p{Cc}\p{Cf}]/u.test(reason) ||
      input.priceOverride.lines.length !== lines.length
    )
      throw new DomainValidationError("Check the price override.", [
        {
          path: "priceOverride",
          message: "Supply a reason and nightly prices for every unit.",
        },
      ]);
    override = {
      nights: manualNights(
        stay,
        input.priceOverride.lines,
        "priceOverride.lines",
      ),
      reason,
    };
  }
  if (input.services === undefined)
    return { requested: { stay, lines }, override };
  const services = parseRequestedServices(input.services);
  if (!services.ok)
    throw new DomainValidationError("Check the services.", services.issues);
  return { requested: { stay, lines, services: services.value }, override };
}

function changedServiceDetails(plan: ReservationChangePlan) {
  return plan.services.flatMap((service) =>
    !service.added && service.detailsChanged ? [service.kind] : [],
  );
}

/**
 * Staff entry point of the shared change engine (Q-83). Every write happens
 * inside one `InventoryGuard` transaction. Lock order: listings by id
 * (old and new), then the reservation row. Availability and prices are read
 * only after those locks are held.
 */
export class ModifyReservation {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    input: ModifyReservationInput | Result<ModifyReservationInput>,
  ): Promise<Result<{ reservation: StaffReservationView }>> {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:modify",
    );
    if (!found.ok) return found;
    const { row, principal } = found.value;
    if (expectedVersion === null)
      return failure("PRECONDITION_REQUIRED", "Send an If-Match header.");
    const submitted = "ok" in input ? input : success(input);
    if (submitted.ok && submitted.value.priceOverride) {
      const allowed = authorize(principal, "pricing:override");
      if (!allowed.ok) return allowed;
    }
    // The version is checked before anything is planned, so a stale caller
    // always gets 412 and never a 422 about a request built on old state.
    if (row.version !== expectedVersion) return staleVersion(row.version);
    if (!submitted.ok) return submitted;
    const change = submitted.value;
    if (!canModifyReservationStay(row.status))
      return invalidTransition(
        row.status,
        "Only a confirmed reservation can be changed.",
      );
    try {
      const { requested, override } = parseRequest(change);
      // The unlocked read only decides which listings to lock. Everything
      // that matters is read again under the locks.
      const lockSet = [
        ...new Set([
          ...row.lines.map((line) => line.roomTypeId),
          ...requested.lines.map((line) => line.roomTypeId),
        ]),
      ];
      const result = await new InventoryGuard(this.deps.unitOfWork).execute({
        branchId: row.branchId,
        roomTypeIds: lockSet,
        load: (context) =>
          this.load(
            context,
            row.branchId,
            id,
            expectedVersion,
            lockSet,
            requested,
            override,
            change.acceptedTotal.amountMinor,
          ),
        validate: success,
        mutate: async (context, state) => {
          const stored = await context.reservations.replaceStay({
            branchId: row.branchId,
            reservationId: id,
            stay: requested.stay,
            lines: state.plan.structureChanged || override ? state.lines : null,
            snapshot: state.snapshot,
            flagPmsUpdate: state.locked.pmsEnteredAt !== null,
            at: state.at,
          });
          await context.reservations.appendChange({
            id: this.deps.ids.next(),
            branchId: row.branchId,
            reservationId: id,
            kind: "STAY",
            actorType: "STAFF",
            actorId: principal.id,
            before: summarizeReservation(state.locked),
            after: summarizeReservation(
              stored,
              changedServiceDetails(state.plan),
            ),
            oldTotalMinor: state.locked.snapshot?.totalMinor ?? null,
            newTotalMinor: state.snapshot.totalMinor,
            override: override
              ? {
                  fromMinor: state.originalTotalMinor,
                  toMinor: state.snapshot.totalMinor,
                  reason: override.reason,
                }
              : null,
            at: state.at,
          });
          if (change.notifyGuest)
            await context.messages.enqueue(row.branchId, id, {
              kind: "reservation.modified",
              notifyGuest: true,
            });
          return success(stored);
        },
        audit: async (context, state, stored) => {
          await context.audit.append(
            auditEvent({
              occurredAt: state.at,
              actorType: "STAFF",
              actorId: principal.id,
              action: "reservation.stay-modified",
              entityType: "Reservation",
              entityId: id,
              branchId: row.branchId,
              reason: override?.reason ?? null,
              changes: {
                reference: stored.reference.value,
                changeSeq: stored.changeSeq,
                before: summarizeReservation(state.locked),
                after: summarizeReservation(
                  stored,
                  changedServiceDetails(state.plan),
                ),
                oldTotalMinor: state.locked.snapshot?.totalMinor ?? null,
                newTotalMinor: state.snapshot.totalMinor,
                priceOverridden: override !== null,
                overrideFromMinor: override ? state.originalTotalMinor : null,
                overrideToMinor: override ? state.snapshot.totalMinor : null,
                flagPmsUpdate: state.locked.pmsEnteredAt !== null,
                guestNotified: change.notifyGuest === true,
              },
            }),
          );
        },
      });
      if (!result.ok) return result;
      return success({
        reservation: staffReservationView(
          result.value,
          principal,
          result.value.updatedAt,
        ),
      });
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return invalid("Check the change.", error.issues);
    }
  }

  private async load(
    context: ModifyReservationContext,
    branchId: string,
    id: string,
    expectedVersion: number,
    lockedListings: readonly string[],
    requested: Requested,
    override: Override | null,
    acceptedTotalMinor: number,
  ): Promise<Result<Loaded>> {
    const locked = await context.reservations.lockById(branchId, id);
    if (!locked.ok) return locked;
    const current = locked.value;
    if (!current) return notFound();
    if (current.version !== expectedVersion)
      return staleVersion(current.version);
    if (!canModifyReservationStay(current.status))
      return invalidTransition(
        current.status,
        "Only a confirmed reservation can be changed.",
      );
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
    const at = this.deps.clock.now();
    const today = localDateAt(at, current.branchTimeZone);
    const plan = planReservationChange(current, requested, {
      today,
      allowPriceOnly: override !== null,
    });
    if (
      !plan.roomTypeIds.every((roomTypeId) =>
        lockedListings.includes(roomTypeId),
      )
    )
      return failure("TRY_AGAIN", "The reservation changed. Try again.");
    const started = current.stay.checkIn.compare(today) < 0;
    if (started && override)
      return invalid("Check the price override.", [
        {
          path: "priceOverride",
          message:
            "Nights before today keep their price: a started stay cannot be overridden.",
        },
      ]);
    if (plan.structureChanged || override) {
      const listings = new Map(
        (await context.catalog.listRoomTypes(branchId, "ALL")).map(
          (listing) => [listing.id, listing],
        ),
      );
      const quantities = new Map<string, number>();
      for (const [index, line] of requested.lines.entries()) {
        const listing = listings.get(line.roomTypeId);
        if (!listing)
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
        if (!free.available)
          return {
            ok: false,
            error: {
              code: "INVENTORY_UNAVAILABLE",
              message: "The requested inventory is no longer available.",
              context: {
                roomTypeId,
                firstUnavailableNight: free.firstUnavailableNight.value,
              },
            },
          } as const;
      }
    }

    // Prices: kept nights keep their stored amount; only new nights are read.
    const current_ = await this.currentRates(context, plan, requested);
    if (!current_.ok) return current_;
    const rateByType = current_.value;
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
    if (acceptedTotalMinor !== quote.totalMinor)
      return priceChanged({
        totalMinor: quote.totalMinor,
        accommodationMinor: quote.accommodationMinor,
        servicesMinor: quote.servicesMinor,
        discountMinor: quote.discountMinor,
        vatMinor: quote.vatMinor,
      });

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
            requested.stay,
            id,
          ))
          ? unit
          : null,
      );
    }
    const lines = plan.lines.map((planned, index) => ({
      id: planned.continuesLineId ?? this.deps.ids.next(),
      roomTypeId: planned.roomTypeId,
      physicalRoomId: assignments[index]!,
      occupancy: planned.occupancy,
      subtotal: Money.create({
        amountMinor: priceLines[index]!.accommodationMinor,
        currency: "USD",
      }),
      nights: override
        ? override.nights[index]!.map((night) => ({
            ...night,
            periodId: null,
            label: null,
          }))
        : repriced[index]!,
    }));
    return success({
      at,
      locked: current,
      plan,
      lines,
      snapshot: nextSnapshot,
      originalTotalMinor: original.totalMinor,
    });
  }

  /** Today's nightly amounts, only for listings that have a night to price. */
  private async currentRates(
    context: ModifyReservationContext,
    plan: ReservationChangePlan,
    requested: Requested,
  ): Promise<
    Result<ReadonlyMap<string, ReadonlyMap<string, ResolvedNightPrice>>>
  > {
    const needed = new Map<string, Set<string>>();
    for (const line of plan.lines)
      for (const night of line.needsCurrentPrice) {
        const set = needed.get(line.roomTypeId) ?? new Set<string>();
        set.add(night.value);
        needed.set(line.roomTypeId, set);
      }
    const result = new Map<string, ReadonlyMap<string, ResolvedNightPrice>>();
    if (needed.size === 0) return success(result);
    const rates = await context.rates.readMany(
      [...needed.keys()],
      requested.stay,
    );
    for (const [roomTypeId, nights] of needed) {
      const rate = rates.get(roomTypeId);
      const price = NightlyPriceResolver.resolve({
        stay: requested.stay,
        baseRate: rate?.baseRate?.amount ?? null,
        periods: rate?.periods ?? [],
      });
      const byNight = new Map(
        price.nights.map((night) => [night.night.value, night]),
      );
      for (const night of [...nights].sort()) {
        if (byNight.get(night)?.amount == null)
          return {
            ok: false,
            error: {
              code: "INVENTORY_UNAVAILABLE",
              message: "A requested listing has a night without a rate.",
              context: { roomTypeId, firstUnavailableNight: night },
            },
          } as const;
      }
      result.set(roomTypeId, byNight);
    }
    return success(result);
  }
}
