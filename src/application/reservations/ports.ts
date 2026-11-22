import type { Result } from "@/application/shared/result";

import type { GuestContact, PhoneNumber } from "@/domain/guests";
import type {
  ChangeSummary,
  ReservationReference,
  ReservationSnapshot,
  ReservationNightSnapshot,
} from "@/domain/reservations";
import type { LocalDate } from "@/domain/shared/local-date";
import type { Occupancy } from "@/domain/shared/occupancy";
import type { Money } from "@/domain/shared/money";
import type { StayRange } from "@/domain/shared/stay-range";
import type {
  ReservationSource,
  ReservationStatus,
  PaymentMethod,
  ReservationPaymentStatus,
} from "@/domain/shared/types";

/**
 * Transaction boundary shared by reservation era workflows. The context is
 * assembled from ports bound to one database transaction.
 */
export interface ReservationUnitOfWork<Context> {
  run<T>(
    operation: (context: Context) => Promise<Result<T>>,
  ): Promise<Result<T>>;
}

export type StoredReservationSnapshot = Omit<
  ReservationSnapshot,
  "serviceLines"
> &
  Readonly<{
    serviceLines: readonly (ReservationSnapshot["serviceLines"][number] &
      Readonly<{
        details: string | null;
        occupancyEffectiveFrom?: LocalDate | null;
      }>)[];
  }>;

export type StoredReservationNight = ReservationNightSnapshot &
  Readonly<{
    periodId: string | null;
    label: string | null;
  }>;
export type StoredReservationLine = Readonly<{
  id: string;
  roomTypeId: string;
  physicalRoomId: string | null;
  stay: StayRange;
  occupancy: Occupancy;
  consumesInventory: boolean;
  subtotal: Money | null;
  nights: readonly StoredReservationNight[];
}>;
export type ReservationInsert = Readonly<{
  id: string;
  reference: ReservationReference;
  branchId: string;
  source: ReservationSource;
  status: ReservationStatus;
  stay: StayRange;
  guestId: string | null;
  contact: GuestContact;
  internalNotes: string | null;
  externalReference: string | null;
  externalChannel?: string | null;
  snapshot: StoredReservationSnapshot | null;
  couponId: string | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: ReservationPaymentStatus;
  privacyNoticeVersion: string | null;
  manageTokenHash: string | null;
  manageTokenExpiresAt: Date | null;
  idempotencyKeyHash: string | null;
  requestFingerprint: string | null;
  createdById: string | null;
  at: Date;
  lines: readonly Omit<StoredReservationLine, "stay" | "consumesInventory">[];
}>;
/** Internal persistence view. Never return this directly from an endpoint. */
export type StoredReservation = Readonly<
  Omit<ReservationInsert, "contact" | "at" | "lines" | "externalChannel"> & {
    externalChannel: string | null;
    branchTimeZone: string;
    contact: Omit<GuestContact, "phone"> & { readonly phone: string | null };
    lines: readonly StoredReservationLine[];
    version: number;
    holdExpiresAt: Date | null;
    pmsEnteredAt: Date | null;
    pmsEnteredById: string | null;
    /** Sequence of the latest `ReservationChange`, 0 when none (M8-T9). */
    changeSeq: number;
    /** Set by a change after hotel-system entry until S55 acknowledges it (Q-84). */
    pmsUpdatePendingSince: Date | null;
    statusChangedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }
>;
/** One of a phone's reservations, with the branch zone needed for "today" (Q-78). */
export type PhoneBookingRow = Readonly<{
  id: string;
  source: ReservationSource;
  status: ReservationStatus;
  paymentMethod: PaymentMethod;
  checkIn: LocalDate;
  branchTimeZone: string;
  holdExpiresAt: Date | null;
}>;

/** The new shape of a stay change. Lines keep their id when they continue an existing unit. */
export type StayReplacement = Readonly<{
  branchId: string;
  reservationId: string;
  stay: StayRange;
  lines:
    | readonly Omit<StoredReservationLine, "stay" | "consumesInventory">[]
    | null;
  snapshot: StoredReservationSnapshot;
  /** True when the booking was already entered in the hotel system (Q-84). */
  flagPmsUpdate: boolean;
  at: Date;
}>;
export type ReservationChangeInsert = Readonly<{
  id: string;
  branchId: string;
  reservationId: string;
  kind: "STAY" | "CANCEL";
  actorType: "STAFF";
  actorId: string;
  before: ChangeSummary;
  after: ChangeSummary;
  oldTotalMinor: number | null;
  newTotalMinor: number | null;
  override: Readonly<{
    fromMinor: number;
    toMinor: number;
    reason: string;
  }> | null;
  at: Date;
}>;

export type ReservationContactPatch = Partial<
  StoredReservation["contact"] & { internalNotes: string | null }
>;
export type ReservationContactChange = Readonly<{
  patch: ReservationContactPatch;
  newGuestId: string | null;
  revokeManageToken: boolean;
}>;

export type RoomAssignmentRequest = Readonly<{
  branchId: string;
  roomTypeId: string;
  lineId: string;
  physicalRoomId: string;
  stay: StayRange;
}>;

export interface ReservationRepository {
  /** Every lookup has an explicit authorized branch. Missing or foreign means null. */
  findById(branchId: string, id: string): Promise<StoredReservation | null>;
  findByReference(
    branchId: string,
    reference: ReservationReference,
  ): Promise<StoredReservation | null>;
  /** Atomic aggregate insert. Null means reference collision, safe to retry in the same transaction.
   * Other constraint failures abort the operation; callers must return the failed Result.
   * Authorization, pricing, inventory locking and audit belong to the calling use case.
   */
  insert(input: ReservationInsert): Promise<Result<StoredReservation | null>>;
  /**
   * The one lookup that is not branch scoped: idempotency keys are unique per
   * source and actor (DB-7). Callers must compare the stored fingerprint and
   * never return the row to a caller whose fingerprint differs.
   */
  findByIdempotencyKey(
    source: ReservationSource,
    createdById: string | null,
    keyHash: string,
  ): Promise<StoredReservation | null>;
  /**
   * Transaction only. Locks the reservation row (`FOR UPDATE`, five second
   * timeout, `TRY_AGAIN`) and returns the committed state seen after the lock.
   */
  lockById(
    branchId: string,
    id: string,
  ): Promise<Result<StoredReservation | null>>;
  /**
   * Transaction only, after `lockById`. Writes the price snapshot, bumps
   * `version` and `changeSeq`, and sets the hotel system flag when asked.
   * A null lines value keeps rooms and nights as stored. Otherwise continuing
   * units keep their ids. Services are reconciled by kind and retained rows
   * keep their stored pricing terms.
   */
  replaceStay(input: StayReplacement): Promise<StoredReservation>;
  /** Transaction only. Appends the history row; `seq` is the reservation's new `changeSeq`. */
  appendChange(input: ReservationChangeInsert): Promise<void>;
  /**
   * Transaction only, after `lockById`. Sets `CANCELLED`, clears
   * `consumesInventory` on every unit, and bumps `version` (R-6).
   */
  markCancelled(
    branchId: string,
    id: string,
    at: Date,
    /**
     * True when the booking was already entered in the hotel system: the
     * cancellation then bumps `changeSeq` and sets the pending flag (Q-84).
     */
    flagPmsUpdate: boolean,
  ): Promise<StoredReservation>;
  /**
   * Whether a physical unit can keep an assignment for a new stay: the unit
   * belongs to that listing (checked here, not left to the caller), is active, no other reservation holds it on those nights and no active block
   * covers them. Transaction only; the listing lock is held.
   */
  unitFree(
    branchId: string,
    physicalRoomId: string,
    roomTypeId: string,
    stay: StayRange,
    exceptReservationId: string,
  ): Promise<boolean>;
  /** Transaction only, after `lockById`. Clears the hotel system flag and bumps `version`. */
  clearPmsUpdate(
    branchId: string,
    id: string,
    at: Date,
  ): Promise<StoredReservation>;
  /** Operational writes run in the caller's transaction after locking the reservation. */
  updateContact(
    current: StoredReservation,
    change: ReservationContactChange,
    at: Date,
  ): Promise<StoredReservation>;
  /** Check under the listing lock. Exclude only the line being assigned. */
  checkAssignment(input: RoomAssignmentRequest): Promise<Result<void>>;
  assignRoom(
    current: StoredReservation,
    lineId: string,
    physicalRoomId: string | null,
    at: Date,
  ): Promise<Result<StoredReservation>>;
  recordTransition(
    current: StoredReservation,
    next: Readonly<{
      status: ReservationStatus;
      stay: StayRange;
      consumesInventory: boolean;
      manageTokenExpiresAt?: Date;
    }>,
    at: Date,
  ): Promise<StoredReservation>;
  markPmsEntered(
    current: StoredReservation,
    actorId: string,
    at: Date,
  ): Promise<StoredReservation>;
  rotateManageToken(
    current: StoredReservation,
    hash: string,
    expiresAt: Date,
    at: Date,
  ): Promise<void>;
  /** Website reservations that can count toward the per phone cap, in every branch. */
  listPhoneBookings(phone: PhoneNumber): Promise<readonly PhoneBookingRow[]>;
}

/** Randomness and hashing the booking needs. The domain never touches crypto. */
export interface BookingCrypto {
  /** 256 bit URL safe token, returned to the guest once. */
  generateToken(): string;
  /** Lower case hex SHA-256, for tokens, idempotency keys and fingerprints. */
  sha256(value: string): string;
  randomBytes(length: number): Uint8Array;
}
