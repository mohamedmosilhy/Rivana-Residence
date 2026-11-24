import {
  type StaffPrincipal,
  authorize,
  authorizeBranch,
} from "@/application/auth";
import type { CouponRedemptionStore } from "@/application/coupons";
import {
  InventoryGuard,
  type AvailabilityCatalog,
} from "@/application/inventory";
import type { QueueReservationMessages } from "@/application/notifications";
import type { BookingPaymentStore } from "@/application/payments";
import type { RateBatchReader } from "@/application/pricing";
import type { QuoteBooking } from "@/application/quotes";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  type Result,
  success,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { normalizeCouponCode } from "@/domain/coupons";
import { AvailabilityCalculator } from "@/domain/inventory";
import { NightlyPriceResolver } from "@/domain/pricing";
import {
  ReservationReference,
  validateReservationCreation,
} from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";
import { localDateAt } from "@/domain/shared/zoned-time";

import { expireListingPaymentHolds } from "./booking-payment-holds";
import { canonicalBookingBody } from "./create-website-reservation-input";
import { manageTokenExpiry } from "./manage-token";
import type {
  BookingCrypto,
  ReservationRepository,
  ReservationUnitOfWork,
  StoredReservation,
  StoredReservationNight,
} from "./ports";
import {
  parseStaffBooking,
  type ExternalReservationInput,
  type StaffBooking,
  type StaffBookingRequest,
  type StaffReservationInput,
} from "./staff-reservation-input";
import {
  staffReservationView,
  type StaffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

export type StaffBookingContext = ReservationStorageContext &
  Readonly<{
    catalog: AvailabilityCatalog;
    rates: RateBatchReader;
    quote: Pick<QuoteBooking, "priceResolved">;
    redemptions: CouponRedemptionStore;
    messages: Pick<QueueReservationMessages, "enqueue" | "discardHeld">;
    payments: BookingPaymentStore;
    externalReferences: ExternalReferenceReader;
  }>;

export interface ExternalReferenceReader {
  exists(branchId: string, reference: string): Promise<boolean>;
}

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<StaffBookingContext>;
  replays: Pick<ReservationRepository, "findByIdempotencyKey">;
  externalReferences: ExternalReferenceReader;
  crypto: BookingCrypto;
  ids: IdGenerator;
  clock: Clock;
}>;

type Created = Readonly<{ reservation: StoredReservation; replayed: boolean }>;
type Prepared = Readonly<{ guestId: string; blocked: boolean }>;
const duplicateReference = () =>
  failure(
    "EXTERNAL_REFERENCE_EXISTS",
    "That external reference is already recorded in this branch.",
  );

export class CreateStaffReservation {
  constructor(private readonly deps: Dependencies) {}

  execute(
    staff: StaffPrincipal | null,
    body: StaffReservationInput,
    key: string | null,
  ) {
    return create(this.deps, staff, { source: "STAFF", body }, key);
  }
}

export class RecordExternalReservation {
  constructor(private readonly deps: Dependencies) {}

  execute(
    staff: StaffPrincipal | null,
    body: ExternalReservationInput,
    key: string | null,
  ) {
    return create(this.deps, staff, { source: "EXTERNAL", body }, key);
  }
}

async function create(
  deps: Dependencies,
  staff: StaffPrincipal | null,
  request: StaffBookingRequest,
  key: string | null,
): Promise<Result<{ reservation: StaffReservationView; replayed: boolean }>> {
  const capability =
    request.source === "STAFF"
      ? "reservations:create"
      : "reservations:record-external";
  const actor = authorizeBranch(staff, capability, request.body.branchId);
  if (!actor.ok) return actor;
  if (request.source === "STAFF" && request.body.priceOverride) {
    const override = authorize(actor.value, "pricing:override");
    if (!override.ok) return override;
  }
  if (key === null)
    return failure(
      "MISSING_IDEMPOTENCY_KEY",
      "Send an Idempotency-Key header.",
    );
  if (!/^[\x21-\x7E]{8,128}$/.test(key))
    return invalid("Check the request header.", [
      {
        path: "idempotencyKey",
        message: "Send a key of 8 to 128 printable characters.",
      },
    ]);
  try {
    const result = await createBooking(deps, actor.value.id, key, request);
    if (!result.ok) return result;
    const { reservation: row, replayed } = result.value;
    return success({
      reservation: staffReservationView(row, actor.value, deps.clock.now()),
      replayed,
    });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    return invalid("Check the reservation details.", error.issues);
  }
}

async function createBooking(
  deps: Dependencies,
  actorId: string,
  key: string,
  request: StaffBookingRequest,
): Promise<Result<Created>> {
  const booking = parseStaffBooking(request);
  const { branchId, source, contact, stay, externalReference } = booking;
  const keyHash = deps.crypto.sha256(key);
  const fingerprint = deps.crypto.sha256(canonicalBookingBody(request.body));
  const replay = async (
    repository: Dependencies["replays"],
  ): Promise<Result<Created | null>> => {
    const row = await repository.findByIdempotencyKey(source, actorId, keyHash);
    if (!row) return success(null);
    if (row.branchId !== branchId || row.requestFingerprint !== fingerprint)
      return failure(
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was used for a different request.",
      );
    return success({ reservation: row, replayed: true });
  };
  const first = await replay(deps.replays);
  if (!first.ok) return first;
  if (first.value) return success(first.value);

  const now = deps.clock.now();
  const group = new InventoryGuard(deps.unitOfWork);
  const result = await group.execute({
    branchId,
    roomTypeIds: booking.lines.map((line) => line.roomTypeId),
    prepare: async (
      context,
    ): Promise<
      Result<
        { done: true; value: Created } | { done: false; prepared: Prepared }
      >
    > => {
      await context.guests.ensureExists({
        id: deps.ids.next(),
        phone: contact.phone,
        name: contact.fullName,
        email: contact.email,
        at: now,
      });
      const guest = await context.guests.lockByPhone(contact.phone);
      if (!guest.ok) return guest;
      if (!guest.value)
        return failure("TRY_AGAIN", "The guest profile changed. Try again.");
      const current = await replay(context.reservations);
      if (!current.ok) return current;
      if (current.value) return success({ done: true, value: current.value });
      return success({
        done: false,
        prepared: {
          guestId: guest.value.id,
          blocked: guest.value.blockedAt !== null,
        },
      });
    },
    load: (context, prepared: Prepared) =>
      load(context, booking, prepared, deps.ids, deps.clock),
    validate: success,
    mutate: async (context, state): Promise<Result<Created>> => {
      const { snapshot, lines, couponId, couponCode, prepared } = state;
      const reservationId = deps.ids.next();
      const manageToken = booking.sendConfirmation
        ? deps.crypto.generateToken()
        : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const stored = await context.reservations.insert({
          id: reservationId,
          reference: ReservationReference.fromRandomBytes(
            deps.crypto.randomBytes(8),
          ),
          branchId,
          source,
          status: "CONFIRMED",
          stay,
          lines,
          contact,
          guestId: prepared.guestId,
          snapshot,
          couponId,
          couponCode,
          internalNotes: booking.notes,
          externalReference,
          externalChannel: booking.externalChannel,
          paymentMethod: "PAY_AT_HOTEL",
          paymentStatus: "NOT_REQUIRED",
          privacyNoticeVersion: null,
          manageTokenHash: manageToken ? deps.crypto.sha256(manageToken) : null,
          manageTokenExpiresAt: manageToken
            ? manageTokenExpiry(stay.checkOut)
            : null,
          idempotencyKeyHash: keyHash,
          requestFingerprint: fingerprint,
          createdById: actorId,
          at: now,
        });
        if (!stored.ok) return stored;
        if (!stored.value) continue;
        if (couponId)
          await context.redemptions.record({
            couponId,
            reservationId,
            phone: contact.phone.value,
            at: now,
          });
        if (manageToken)
          await context.messages.enqueue(branchId, reservationId, {
            kind: "reservation.confirmed",
            notifyGuest: true,
            manageToken,
          });
        return success({ reservation: stored.value, replayed: false });
      }
      return failure("TRY_AGAIN", "Could not allocate a reference. Try again.");
    },
    audit: async (context, state, { reservation }) => {
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId,
          action: "reservation.staff-created",
          entityType: "Reservation",
          entityId: reservation.id,
          branchId,
          reason: booking.overrideReason,
          changes: {
            reference: reservation.reference.value,
            source,
            checkIn: stay.checkIn.value,
            checkOut: stay.checkOut.value,
            units: state.lines.length,
            totalMinor: state.snapshot?.totalMinor ?? null,
            priceOverridden: booking.overrideReason !== null,
            confirmationRequested: booking.sendConfirmation,
          },
        }),
      );
    },
  });
  if (result.ok) return result;
  // A unique violation aborts the transaction. Resolve the committed winner
  // on the outer client before distinguishing a replay from a duplicate reference.
  const winner = await replay(deps.replays);
  if (!winner.ok) return winner;
  if (winner.value) return success(winner.value);
  if (
    result.error.code === "CONFLICT" &&
    externalReference &&
    (await deps.externalReferences.exists(branchId, externalReference))
  )
    return duplicateReference();
  return result.error.code === "CONFLICT"
    ? failure("TRY_AGAIN", "Could not create the reservation. Try again.")
    : result;
}

async function load(
  context: StaffBookingContext,
  booking: StaffBooking,
  prepared: Prepared,
  ids: IdGenerator,
  clock: Clock,
) {
  const now = clock.now();
  const { branchId, source, stay, externalReference } = booking;
  const branch = await context.catalog.findBranch(branchId);
  if (!branch?.active)
    return failure("NOT_FOUND", "This branch was not found.");
  if (
    source === "STAFF" &&
    stay.checkIn.compare(localDateAt(now, branch.timeZone)) < 0
  )
    return invalid("Check the stay dates.", [
      {
        path: "stay.checkIn",
        message: "Choose a check-in date from the branch's today onwards.",
      },
    ]);
  if (
    externalReference &&
    (await context.externalReferences.exists(branchId, externalReference))
  )
    return duplicateReference();

  const listings = new Map(
    (await context.catalog.listRoomTypes(branchId, "ALL")).map((listing) => [
      listing.id,
      listing,
    ]),
  );
  const quantities = new Map<string, number>();
  for (const [index, line] of booking.lines.entries()) {
    const listing = listings.get(line.roomTypeId);
    if (!listing) return failure("NOT_FOUND", "This listing was not found.");
    if (!line.occupancy.fits(listing))
      return invalid("Check the units.", [
        {
          path: `lines.${index}.occupancy`,
          message: "The occupancy exceeds this listing's limits.",
        },
      ]);
    quantities.set(line.roomTypeId, (quantities.get(line.roomTypeId) ?? 0) + 1);
  }
  const roomTypeIds = [...quantities.keys()];
  let couponId: string | null = null;
  const normalized = normalizeCouponCode(booking.couponCode);
  if (booking.couponCode !== undefined && normalized.ok) {
    const locked = await context.redemptions.lockByCode(normalized.code);
    if (!locked.ok) return locked;
    couponId = locked.value;
  }
  const expired = await expireListingPaymentHolds(
    context,
    branchId,
    roomTypeIds,
    clock.now(),
  );
  if (!expired.ok) return expired;
  const nights = [...stay.nights()];
  const inventory = await context.inventoryReader.readNights({
    branchId,
    roomTypeIds,
    nights,
  });
  if (!inventory.ok) return inventory;
  for (const [roomTypeId, quantity] of quantities) {
    const free = AvailabilityCalculator.check({
      stay,
      quantity,
      nights: inventory.value.filter((row) => row.roomTypeId === roomTypeId),
    });
    if (!free.available)
      return {
        ok: false,
        error: {
          code: "INVENTORY_UNAVAILABLE",
          message:
            source === "EXTERNAL"
              ? "This booking conflicts with Rivana inventory. Reconcile it with the hotel system."
              : "The requested inventory is no longer available.",
          context: {
            roomTypeId,
            firstUnavailableNight: free.firstUnavailableNight.value,
          },
        },
      } as const;
  }
  const amounts = await resolveAmounts(context, booking, roomTypeIds);
  if (!amounts.ok) return amounts;

  const priced =
    amounts.value === null
      ? null
      : await context.quote.priceResolved(
          branchId,
          {
            stay,
            lines: booking.lines.map((line, index) => ({
              occupancy: line.occupancy,
              nights: amounts.value![index]!,
            })),
            services: booking.services,
            ...(booking.couponCode === undefined
              ? {}
              : { couponCode: booking.couponCode }),
            phone: booking.contact.phone.value,
          },
          now,
        );
  if (priced && !priced.ok) return priced;
  const quote = priced?.value.quote;
  const couponView = priced?.value.couponView ?? null;
  if (couponView && !couponId)
    throw new Error("An applied coupon must have been locked.");
  const { serviceLines = [], lines: priceLines, ...totals } = quote ?? {};
  if (
    quote &&
    [
      quote.totalMinor,
      quote.subtotalMinor,
      ...serviceLines.flatMap((line) => [
        line.amountMinor,
        line.adultQuantity,
        line.childQuantity,
      ]),
    ].some((amount) => amount > 2_147_483_647)
  )
    return invalid("The reservation amount is too large.", [
      { path: "lines", message: "Use smaller amounts." },
    ]);
  const details = new Map<string, string | null>(
    booking.services.map((item) =>
      typeof item === "string"
        ? [item, null]
        : [item.kind, item.details ?? null],
    ),
  );
  const snapshot = quote
    ? {
        ...(totals as Omit<typeof quote, "lines" | "serviceLines">),
        couponValue:
          couponView === null
            ? null
            : couponView.kind === "PERCENT"
              ? {
                  kind: "PERCENT" as const,
                  percentBasisPoints: couponView.percentBasisPoints!,
                }
              : {
                  kind: "FIXED" as const,
                  amount: Money.create({
                    amountMinor: couponView.amountMinor!,
                    currency: "USD",
                  }),
                },
        serviceLines: serviceLines.map((line) => ({
          ...line,
          details: details.get(line.kind) ?? null,
        })),
      }
    : null;
  const lines = booking.lines.map((line, index) => ({
    ...line,
    id: ids.next(),
    physicalRoomId: null,
    subtotal: priceLines
      ? Money.create({
          amountMinor: priceLines[index]!.accommodationMinor,
          currency: "USD",
        })
      : null,
    nights:
      amounts.value?.[index] ??
      nights.map((night) => ({
        night,
        amount: null,
        source: null,
        periodId: null,
        label: null,
      })),
  }));
  validateReservationCreation(
    {
      branchId,
      source,
      status: "CONFIRMED",
      stay,
      guestId: prepared.guestId,
      contact: booking.contact,
      externalReference,
      snapshot,
      paymentMethod: "PAY_AT_HOTEL",
      paymentStatus: "NOT_REQUIRED",
      lines: lines.map((line) => ({
        ...line,
        branchId,
        stay,
        listing: { ...listings.get(line.roomTypeId)!, branchId },
        consumesInventory: true,
        physicalUnit: null,
      })),
    },
    {
      inventoryReserved: true,
      verifiedBookingPhone: null,
      phoneBlocked: prepared.blocked,
    },
  );
  return success({
    lines,
    snapshot,
    couponId,
    couponCode: couponView?.code ?? null,
    prepared,
  });
}

async function resolveAmounts(
  context: StaffBookingContext,
  booking: StaffBooking,
  roomTypeIds: readonly string[],
): Promise<Result<readonly (readonly StoredReservationNight[])[] | null>> {
  if (booking.source === "EXTERNAL" || booking.manualAmounts)
    return success(booking.manualAmounts);
  const rates = await context.rates.readMany(roomTypeIds, booking.stay);
  const amounts = roomTypeIds.map((id) => {
    const rate = rates.get(id);
    return [
      id,
      NightlyPriceResolver.resolve({
        stay: booking.stay,
        baseRate: rate?.baseRate?.amount ?? null,
        periods: rate?.periods ?? [],
      }),
    ] as const;
  });
  for (const [roomTypeId, price] of amounts) {
    if (!price.priced)
      return {
        ok: false,
        error: {
          code: "INVENTORY_UNAVAILABLE",
          message: "A requested listing has a night without a rate.",
          context: {
            roomTypeId,
            firstUnavailableNight: price.firstUnpricedNight.value,
          },
        },
      } as const;
  }
  const byListing = new Map(amounts);
  return success(
    booking.lines.map((line) => byListing.get(line.roomTypeId)!.nights),
  );
}
