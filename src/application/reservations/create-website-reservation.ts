import type { BranchRepository } from "@/application/branches";
import type { PublicListing, PublicListingReader } from "@/application/content";
import type { CouponRedemptionStore } from "@/application/coupons";
import type {
  PhoneVerificationRepository,
  VerificationRecord,
} from "@/application/guests";
import {
  InventoryGuard,
  type InventoryGuardOperation,
} from "@/application/inventory";
import type {
  QueueReservationMessages,
  WhatsAppSetupReader,
} from "@/application/notifications";
import type { QuoteBooking, QuoteView } from "@/application/quotes";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  inventoryUnavailable,
  invalid,
  priceChanged,
  success,
  type Result,
} from "@/application/shared/result";
import { normalizeCouponCode } from "@/domain/coupons";
import { auditEvent } from "@/domain/audit";
import {
  PhoneNumber,
  checkPhoneBookingLimit,
  checkPhoneVerificationToken,
  type PhoneBooking,
} from "@/domain/guests";
import { AvailabilityCalculator } from "@/domain/inventory";
import type { QuoteCouponValue } from "@/domain/pricing";
import {
  ReservationReference,
  validateReservationCreation,
} from "@/domain/reservations";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { localDateAt } from "@/domain/shared/zoned-time";
import type { ReservationStatus } from "@/domain/shared/types";

import {
  bookingFingerprintSource,
  parseWebsiteBooking,
  type WebsiteBookingInput,
} from "./create-website-reservation-input";
import type {
  BookingCrypto,
  ReservationInsert,
  ReservationRepository,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import type { ReservationStorageContext } from "./storage-context";

/** Ports bound to the booking transaction by composition. */
export type CreateWebsiteReservationContext = ReservationStorageContext &
  Readonly<{
    verifications: PhoneVerificationRepository;
    redemptions: CouponRedemptionStore;
    /** `QuoteBooking` built on this transaction's readers, so it reads after the locks. */
    quote: Pick<QuoteBooking, "execute">;
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

export type WebsiteReservationResult = Readonly<{
  reservationId: string;
  branchId: string;
  reference: string;
  status: ReservationStatus;
  totalMinor: number | null;
  /** The plain manage token, once. Null on a replay: it is never stored or repeated. */
  manageToken: string | null;
  replayed: boolean;
}>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<CreateWebsiteReservationContext>;
  branches: Pick<BranchRepository, "findActiveRowBySlug">;
  listings: PublicListingReader;
  /** Read only lookups on the pool, before any write transaction opens. */
  replays: Pick<ReservationRepository, "findByIdempotencyKey">;
  tokens: Pick<PhoneVerificationRepository, "findByTokenHash">;
  setup: Pick<WhatsAppSetupReader, "isConfigured">;
  crypto: BookingCrypto;
  clock: Clock;
  ids: IdGenerator;
}>;

type Prepared = Readonly<{
  guestId: string;
  phone: PhoneNumber;
  keyHash: string;
  fingerprint: string;
}>;
type State = Readonly<{
  prepared: Prepared;
  quote: QuoteView;
  couponId: string | null;
}>;

const MANAGE_TOKEN_DAYS_AFTER_CHECKOUT = 30;
const REFERENCE_ATTEMPTS = 3;
const NOT_VERIFIED = () =>
  failure("PHONE_NOT_VERIFIED", "Verify your phone number to continue.");

/**
 * M8-T7. A pay at hotel website booking: `CONFIRMED` in the transaction that
 * takes its inventory (spec 0005 Decision 1). Public: authorization is the
 * verified phone token, and the branch comes from the slug, never the client.
 *
 * Lock order: guest row, listings by id, coupon row, then the new reservation.
 * Network calls never happen here; messages are outbox rows written in the
 * same transaction and sent only after commit.
 */
export class CreateWebsiteReservation {
  private readonly guard: InventoryGuard<CreateWebsiteReservationContext>;

  constructor(private readonly deps: Dependencies) {
    this.guard = new InventoryGuard(deps.unitOfWork);
  }

  async execute(
    input: unknown,
    idempotencyKey: unknown,
  ): Promise<Result<WebsiteReservationResult>> {
    const parsed = parseWebsiteBooking(input, idempotencyKey);
    if (!parsed.ok) return parsed;
    const booking = parsed.value;
    const phone = booking.contact.phone!;

    const { crypto, clock } = this.deps;
    const keyHash = crypto.sha256(booking.idempotencyKey);
    const tokenHash = crypto.sha256(booking.token);
    const fingerprint = crypto.sha256(
      bookingFingerprintSource(booking, tokenHash),
    );

    // A lost response must still get its reference, even if the branch or a
    // listing changed since (Decision 1 step 1). The same lookup runs again
    // under the guest lock for a parallel retry.
    const earlier = await this.deps.replays.findByIdempotencyKey(
      "WEBSITE",
      null,
      keyHash,
    );
    if (earlier) {
      const replayed = this.replay(earlier, fingerprint);
      return replayed.ok ? success(replayed.value.value) : replayed;
    }
    // Cheap read only check, so a made up token never writes or locks a guest
    // row. The full check runs again under the locks.
    const known = await this.deps.tokens.findByTokenHash(tokenHash);
    const now = clock.now();
    if (
      !known ||
      known.purpose !== "BOOKING" ||
      known.phone !== phone.value ||
      known.consumedAt !== null ||
      known.verifiedAt === null ||
      known.tokenExpiresAt === null ||
      known.tokenExpiresAt.getTime() <= now.getTime()
    )
      return NOT_VERIFIED();

    const branch = await this.deps.branches.findActiveRowBySlug(
      booking.quote.branchSlug,
    );
    if (!branch) return failure("NOT_FOUND", "This branch was not found.");
    if (
      !branch.onlineBookingEnabled ||
      !branch.checkInTime ||
      !(await this.deps.setup.isConfigured())
    )
      return failure(
        "BRANCH_NOT_BOOKABLE",
        "This branch cannot take online bookings right now.",
      );

    const listings = await this.deps.listings.listPublished(branch.id);
    const published = new Map(listings.map((room) => [room.slug, room]));
    const byId = new Map(listings.map((room) => [room.id, room]));
    const roomIds: string[] = [];
    const missing = booking.quote.lines.flatMap((line, index) => {
      const room = published.get(line.roomSlug);
      if (!room)
        return [
          {
            path: `lines.${index}.roomSlug`,
            message: "Choose a listing of this branch.",
          },
        ];
      roomIds.push(room.id);
      return [];
    });
    if (missing.length > 0) return invalid("Check the units.", missing);

    const operation: InventoryGuardOperation<
      CreateWebsiteReservationContext,
      State,
      State,
      WebsiteReservationResult,
      Prepared
    > = {
      branchId: branch.id,
      roomTypeIds: [...new Set(roomIds)],
      prepare: (context) =>
        this.prepare(context, booking, phone, keyHash, tokenHash, fingerprint),
      load: (context, prepared) =>
        this.load(context, booking, branch.id, prepared, [...roomIds]),
      validate: (state) =>
        state.quote.totalMinor === booking.expectedTotalMinor
          ? success(state)
          : priceChanged(state.quote),
      mutate: (context, state) =>
        this.insert(context, booking, state, branch.id, byId),
      audit: async (context, state, value) => {
        await context.audit.append(
          auditEvent({
            occurredAt: clock.now(),
            actorType: "GUEST",
            actorId: state.prepared.guestId,
            action: "reservation.created",
            entityType: "Reservation",
            entityId: value.reservationId,
            branchId: branch.id,
            reason: null,
            changes: {
              reference: value.reference,
              source: "WEBSITE",
              status: "CONFIRMED",
              paymentMethod: "PAY_AT_HOTEL",
              checkIn: booking.quote.stay.checkIn.value,
              checkOut: booking.quote.stay.checkOut.value,
              units: booking.quote.lines.length,
              totalMinor: state.quote.totalMinor,
              couponCode: state.quote.appliedCoupon?.code ?? null,
              marketingOptIn: booking.consent.marketingConsentVersion !== null,
            },
          }),
        );
      },
    };
    return this.guard.execute(operation);
  }

  private replay(
    found: StoredReservation,
    fingerprint: string,
  ): Result<{ done: true; value: WebsiteReservationResult }> {
    // A different body, phone or token under the same key never sees this row.
    if (found.requestFingerprint !== fingerprint)
      return failure(
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was used for a different request.",
      );
    return success({
      done: true,
      value: {
        reservationId: found.id,
        branchId: found.branchId,
        reference: found.reference.value,
        status: found.status,
        totalMinor: found.snapshot?.totalMinor ?? null,
        manageToken: null,
        replayed: true,
      },
    });
  }

  /** Runs before any listing lock: replay, guest lock, token, per phone cap. */
  private async prepare(
    context: CreateWebsiteReservationContext,
    booking: WebsiteBookingInput,
    phone: PhoneNumber,
    keyHash: string,
    tokenHash: string,
    fingerprint: string,
  ) {
    const { clock, ids } = this.deps;
    const now = clock.now();

    const early = await context.reservations.findByIdempotencyKey(
      "WEBSITE",
      null,
      keyHash,
    );
    if (early) return this.replay(early, fingerprint);

    const ensured = await context.guests.ensureExists({
      id: ids.next(),
      phone,
      name: booking.contact.fullName,
      email: booking.contact.email,
      at: now,
    });
    const locked = await context.guests.lockByPhone(phone);
    if (!locked.ok) return locked;
    const guest = locked.value ?? ensured;

    // A parallel retry waited on the guest lock; the winner is committed now.
    const late = await context.reservations.findByIdempotencyKey(
      "WEBSITE",
      null,
      keyHash,
    );
    if (late) return this.replay(late, fingerprint);

    // The guest row is held, so this follows the T5 order: guest, then verification.
    const unlocked = await context.verifications.findByTokenHash(tokenHash);
    let record: VerificationRecord | null = null;
    if (unlocked) {
      const lockedRecord = await context.verifications.lock(unlocked.id);
      if (!lockedRecord.ok) return lockedRecord;
      record = lockedRecord.value;
    }
    const checked = checkPhoneVerificationToken(
      record
        ? {
            purpose: record.purpose,
            phone: PhoneNumber.parse(record.phone),
            verifiedAt: record.verifiedAt,
            tokenExpiresAt: record.tokenExpiresAt,
            consumedAt: record.consumedAt,
          }
        : null,
      "BOOKING",
      phone,
      now,
      guest.blockedAt !== null,
    );
    if (!checked.valid)
      return checked.code === "PHONE_BLOCKED"
        ? failure("PHONE_BLOCKED", "Please contact the hotel to continue.")
        : NOT_VERIFIED();
    await context.verifications.consume(record!.id, now);

    const bookings = (await context.reservations.listPhoneBookings(phone)).map(
      (row): PhoneBooking => ({
        id: row.id,
        phone,
        source: row.source,
        status: row.status,
        paymentMethod: row.paymentMethod,
        checkIn: row.checkIn,
        branchToday: localDateAt(now, row.branchTimeZone),
        holdExpiresAt: row.holdExpiresAt,
      }),
    );
    const cap = checkPhoneBookingLimit(phone, bookings, "PAY_AT_HOTEL", now);
    if (!cap.allowed)
      return failure(
        "BOOKING_LIMIT_REACHED",
        "Please contact the hotel to book more stays.",
      );

    return success({
      done: false,
      prepared: { guestId: guest.id, phone, keyHash, fingerprint },
    } as const);
  }

  /** Runs after the listing lock: coupon lock, then the one server side quote. */
  private async load(
    context: CreateWebsiteReservationContext,
    booking: WebsiteBookingInput,
    branchId: string,
    prepared: Prepared,
    roomIds: readonly string[],
  ): Promise<Result<State>> {
    let couponId: string | null = null;
    if (booking.quote.couponCode !== undefined) {
      const code = normalizeCouponCode(booking.quote.couponCode);
      if (code.ok) {
        const locked = await context.redemptions.lockByCode(code.code);
        if (!locked.ok) return locked;
        couponId = locked.value;
      }
    }
    const quoted = await context.quote.execute(booking.quoteBody);
    if (!quoted.ok) return quoted;
    const result = quoted.value;
    if (!result.bookable)
      return result.available
        ? failure(
            "BRANCH_NOT_BOOKABLE",
            "This branch cannot take online bookings right now.",
          )
        : this.unavailable(
            context,
            booking,
            branchId,
            roomIds,
            result.unavailableLines,
          );
    if (!result.available || !result.quote)
      return this.unavailable(
        context,
        booking,
        branchId,
        roomIds,
        result.unavailableLines,
      );
    // The ids locked before the quote came from a read outside this
    // transaction. If a slug moved to another listing in between, the quote
    // priced a listing whose lock is not held, so refuse rather than store it.
    if (
      result.quote.lines.some(
        (line, index) => line.roomTypeId !== roomIds[index],
      )
    )
      return failure(
        "TRY_AGAIN",
        "A listing changed while booking. Please try again.",
      );
    return success({ prepared, quote: result.quote, couponId });
  }

  private async unavailable(
    context: CreateWebsiteReservationContext,
    booking: WebsiteBookingInput,
    branchId: string,
    roomIds: readonly string[],
    unavailableLines: readonly number[],
  ): Promise<Result<never>> {
    const roomTypeId = roomIds[unavailableLines[0] ?? 0]!;
    const quantity = roomIds.filter((id) => id === roomTypeId).length;
    const nights = await context.inventoryReader.readNights({
      branchId,
      roomTypeIds: [roomTypeId],
      nights: [...booking.quote.stay.nights()],
    });
    let night = booking.quote.stay.checkIn.value;
    if (nights.ok) {
      const check = AvailabilityCalculator.check({
        stay: booking.quote.stay,
        quantity,
        nights: nights.value,
      });
      if (!check.available) night = check.firstUnavailableNight.value;
    }
    return inventoryUnavailable(roomTypeId, night);
  }

  private async insert(
    context: CreateWebsiteReservationContext,
    booking: WebsiteBookingInput,
    state: State,
    branchId: string,
    listings: ReadonlyMap<string, PublicListing>,
  ): Promise<Result<WebsiteReservationResult>> {
    const { crypto, clock, ids } = this.deps;
    const now = clock.now();
    const { quote, prepared } = state;
    const stay = booking.quote.stay;
    const phone = prepared.phone;

    const manageToken = crypto.generateToken();
    const manageTokenExpiresAt = new Date(
      Date.parse(`${stay.checkOut.value}T00:00:00Z`) +
        MANAGE_TOKEN_DAYS_AFTER_CHECKOUT * 86_400_000,
    );
    const couponValue: QuoteCouponValue | null = quote.appliedCoupon
      ? quote.appliedCoupon.kind === "PERCENT"
        ? {
            kind: "PERCENT",
            percentBasisPoints: quote.appliedCoupon.percentBasisPoints!,
          }
        : {
            kind: "FIXED",
            amount: Money.create({
              amountMinor: quote.appliedCoupon.amountMinor!,
              currency: "USD",
            }),
          }
      : null;
    // Free text the guest gave for a service (a flight number); the quote does not carry it.
    const details = new Map<string, string | null>(
      booking.quote.services.map((service) =>
        typeof service === "string"
          ? ([service, null] as const)
          : ([service.kind, service.details ?? null] as const),
      ),
    );
    const snapshot = {
      accommodationMinor: quote.accommodationMinor,
      servicesMinor: quote.servicesMinor,
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      taxableMinor: quote.taxableMinor,
      vatRateBasisPoints: quote.vatRateBasisPoints,
      vatMinor: quote.vatMinor,
      totalMinor: quote.totalMinor,
      couponValue,
      serviceLines: quote.serviceLines.map((line) => ({
        ...line,
        details: details.get(line.kind) ?? null,
      })),
    };
    const lines = quote.lines.map((line) => ({
      id: ids.next(),
      roomTypeId: line.roomTypeId,
      physicalRoomId: null,
      occupancy: Occupancy.create(line.occupancy),
      subtotal: Money.create({
        amountMinor: line.accommodationMinor,
        currency: "USD",
      }),
      nights: line.nights.map((night) => ({
        night: night.night,
        amount: night.amount,
        source: night.source,
        periodId: night.periodId,
        label: night.label,
      })),
    }));

    // Domain checks R-1 to R-10 with the facts this transaction established.
    validateReservationCreation(
      {
        branchId,
        source: "WEBSITE",
        status: "CONFIRMED",
        stay,
        paymentMethod: "PAY_AT_HOTEL",
        paymentStatus: "NOT_REQUIRED",
        guestId: prepared.guestId,
        contact: booking.contact,
        externalReference: null,
        lines: lines.map((line) => ({
          branchId,
          roomTypeId: line.roomTypeId,
          stay,
          occupancy: line.occupancy,
          consumesInventory: true,
          listing: (() => {
            const listing = listings.get(line.roomTypeId);
            if (!listing)
              throw new Error("A booked listing was not published.");
            return {
              id: listing.id,
              branchId: listing.branchId,
              maxAdults: listing.maxAdults,
              maxChildren: listing.maxChildren,
            };
          })(),
          physicalUnit: null,
          nights: line.nights,
          subtotal: line.subtotal,
        })),
        snapshot,
      },
      {
        verifiedBookingPhone: phone,
        phoneBlocked: false,
        inventoryReserved: true,
      },
    );

    const reservationId = ids.next();
    let stored: StoredReservation | null = null;
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS && !stored; attempt++) {
      const insert: ReservationInsert = {
        id: reservationId,
        reference: ReservationReference.fromRandomBytes(crypto.randomBytes(8)),
        branchId,
        source: "WEBSITE",
        status: "CONFIRMED",
        stay,
        guestId: prepared.guestId,
        contact: booking.contact,
        internalNotes: null,
        externalReference: null,
        snapshot,
        couponId: state.couponId,
        couponCode: quote.appliedCoupon?.code ?? null,
        paymentMethod: "PAY_AT_HOTEL",
        paymentStatus: "NOT_REQUIRED",
        privacyNoticeVersion: booking.consent.privacyNoticeVersion,
        manageTokenHash: crypto.sha256(manageToken),
        manageTokenExpiresAt,
        idempotencyKeyHash: prepared.keyHash,
        requestFingerprint: prepared.fingerprint,
        createdById: null,
        at: now,
        lines,
      };
      const inserted = await context.reservations.insert(insert);
      if (!inserted.ok)
        // Only the idempotency key can collide here: the guest lock and the
        // token already serialize everything else for this phone. A parallel
        // request from another phone with the same key is a reused key.
        return inserted.error.code === "CONFLICT"
          ? failure(
              "IDEMPOTENCY_KEY_REUSED",
              "This idempotency key was used for a different request.",
            )
          : inserted;
      stored = inserted.value;
    }
    if (!stored)
      return failure("TRY_AGAIN", "Could not allocate a reference. Try again.");

    if (quote.appliedCoupon) {
      if (!state.couponId)
        throw new Error("An applied coupon must have been locked.");
      await context.redemptions.record({
        couponId: state.couponId,
        reservationId,
        phone: phone.value,
        at: now,
      });
    }
    await context.guests.recordWebsiteBooking({
      id: prepared.guestId,
      name: booking.contact.fullName,
      email: booking.contact.email,
      verifiedAt: now,
      marketingConsentVersion: booking.consent.marketingConsentVersion,
    });
    await context.messages.enqueue(branchId, reservationId, {
      kind: "reservation.confirmed",
      notifyGuest: true,
      manageToken,
    });

    return success({
      reservationId,
      branchId,
      reference: stored.reference.value,
      status: stored.status,
      totalMinor: quote.totalMinor,
      manageToken,
      replayed: false,
    });
  }
}
