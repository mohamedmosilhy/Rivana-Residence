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
  CancellationClosedReason,
  CancellationRequestStatus,
  ReservationSource,
  ReservationStatus,
  PaymentMethod,
  ReservationPaymentStatus,
  SyncCheckpointKind,
  VerificationChannel,
} from "@/domain/shared/types";

/** The guest can see the request status and the reason for a decision. */
export type GuestCancellationRequest = Readonly<{
  id: string;
  status: CancellationRequestStatus;
  createdAt: Date;
  /** Guest facing text. Keep staff notes and closure codes out of this field. */
  decisionReason: string | null;
}>;

/** A request as the staff decision and refund steps see it. */
export type CancellationRequestRecord = Readonly<{
  id: string;
  reservationId: string;
  branchId: string;
  requestedBy: "GUEST" | "STAFF";
  status: CancellationRequestStatus;
  decisionReason: string | null;
  cancelReason: string | null;
  notifyGuest: boolean | null;
  decidedById: string | null;
  createdAt: Date;
}>;

export type CancellationRequestListItem = Readonly<{
  id: string;
  branchId: string;
  reservationId: string;
  reference: string;
  checkIn: string;
  requestedBy: "GUEST" | "STAFF";
  status: CancellationRequestStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: ReservationPaymentStatus;
  totalMinor: number | null;
  guestReason: string | null;
  decisionReason: string | null;
  createdAt: string;
}>;

export interface CancellationRequestReader {
  list(
    scope: "ALL" | readonly string[],
    query: Readonly<{
      branchId?: string | undefined;
      status?: CancellationRequestStatus | undefined;
      page: number;
      pageSize: number;
    }>,
  ): Promise<{
    items: readonly CancellationRequestListItem[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  /** Unlocked read that picks the reservation to lock. */
  findById(id: string): Promise<CancellationRequestRecord | null>;
}

export interface CancellationRequestStore {
  /** Read under the reservation lock. */
  findById(id: string): Promise<CancellationRequestRecord | null>;
  /** The request still in play for a reservation (`OPEN`, `APPROVED`, `REFUND_PENDING`, `REFUND_FAILED`). */
  findActive(reservationId: string): Promise<CancellationRequestRecord | null>;
  /** The old S9 stored its reason code in the approval audit. */
  findLegacyCancelReason(id: string): Promise<string | null>;
  /**
   * Moves a request from `from` to `to`. False when it was not in `from`.
   * `decidedById` and `decisionReason` are written when given (a decision).
   */
  transition(
    input: Readonly<{
      id: string;
      from: CancellationRequestStatus;
      to: CancellationRequestStatus;
      at: Date;
      decidedById?: string;
      decisionReason?: string | null;
    }>,
  ): Promise<boolean>;
  /** A staff cancellation of a paid booking: already `APPROVED` (spec 0006 D-E). */
  createApproved(
    input: Readonly<{
      id: string;
      reservationId: string;
      staffId: string;
      cancelReason: string;
      notifyGuest: boolean;
      legacyDecisionReason: string | null;
      at: Date;
    }>,
  ): Promise<CancellationRequestRecord>;
  /** Prefer an active request, otherwise return the latest finished request. */
  findCurrent(reservationId: string): Promise<GuestCancellationRequest | null>;
  /** Writers hold the reservation row lock. */
  create(
    input: Readonly<{
      id: string;
      reservationId: string;
      guestReason: string | null;
      at: Date;
    }>,
  ): Promise<GuestCancellationRequest>;
  closeOpen(
    input: Readonly<{
      reservationId: string;
      staffId: string;
      closedReason: CancellationClosedReason;
      at: Date;
    }>,
  ): Promise<string | null>;
}

/**
 * Transaction boundary shared by reservation era workflows. The context is
 * assembled from ports bound to one database transaction.
 */
export interface ReservationUnitOfWork<Context> {
  run<T>(
    operation: (context: Context) => Promise<Result<T>>,
  ): Promise<Result<T>>;
}

/** Branch settings, checkpoint history and backlog from one database snapshot. */
export type SyncStatusSnapshot = Readonly<{
  intervalMinutes: number;
  followUpMinutes: number;
  lastCompletedAt: Date | null;
  lastCompletedBy: string | null;
  lastStartedAt: Date | null;
  notEnteredInHotelSystem: number;
  oldestNotEnteredAt: Date | null;
}>;

export interface SyncStatusReader {
  readStatus(branchId: string): Promise<SyncStatusSnapshot | null>;
}

export interface SyncCheckpointWriter {
  append(
    checkpoint: Readonly<{
      id: string;
      branchId: string;
      recordedById: string;
      recordedAt: Date;
      kind: SyncCheckpointKind;
      note: string | null;
    }>,
  ): Promise<void>;
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
  holdExpiresAt?: Date | null;
  privacyNoticeVersion: string | null;
  /** WEBSITE only: what the guest's code proved (ADR 031). Staff and external bookings omit it. */
  verificationChannel?: VerificationChannel | null;
  /** EMAIL bookings only: the normalized email the code proved. Contact edits never change it. */
  verifiedEmail?: string | null;
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
  Omit<
    ReservationInsert,
    | "contact"
    | "at"
    | "lines"
    | "externalChannel"
    | "verificationChannel"
    | "verifiedEmail"
  > & {
    externalChannel: string | null;
    /** Null on staff and external bookings, and on website bookings written before ADR 031 (read as WHATSAPP). */
    verificationChannel: VerificationChannel | null;
    /** EMAIL bookings only: the email the code proved (read only). */
    verifiedEmail: string | null;
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
  guestContact?: Pick<
    ReservationContactPatch,
    "fullName" | "email" | "specialRequests"
  >;
  manageAccess?: Readonly<{ hash: string | null; expiresAt: Date | null }>;
  /** True when the booking was already entered in the hotel system (Q-84). */
  flagPmsUpdate: boolean;
  at: Date;
}>;
export type ReservationChangeInsert = Readonly<{
  id: string;
  branchId: string;
  reservationId: string;
  kind: "STAY" | "CANCEL";
  actorType: "STAFF" | "GUEST";
  actorId: string;
  changeRequestId?: string;
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
  findOverdueHoldIds(
    branchId: string,
    roomTypeIds: readonly string[],
    at: Date,
  ): Promise<readonly string[]>;
  /** Transaction only, after locking and checking the awaiting reservation. */
  markPaymentFailed(branchId: string, id: string, at: Date): Promise<void>;
  /**
   * Transaction only, after `lockById`. Sets `CONFIRMED` and `paymentStatus
   * PAID`, clears the hold, and makes every unit consume inventory again (a
   * late success has re-checked capacity under the listing locks).
   */
  confirmPaid(branchId: string, id: string, at: Date): Promise<void>;
  /** Transaction only, after `lockById`. Mirrors the payment onto the reservation row. */
  setPaymentStatus(
    branchId: string,
    id: string,
    status: ReservationPaymentStatus,
    at: Date,
  ): Promise<void>;
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
  /** Newest guest changes strictly after the cutoff. Call with the reservation row locked. */
  recentGuestChanges(
    reservationId: string,
    cutoff: Date,
    limit: number,
  ): Promise<readonly Date[]>;
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
  /**
   * Website reservations whose code proved this normalized email (the stored
   * `verifiedEmail`, not the editable contact email) that can count toward the
   * per email cap, in every branch (ADR 031).
   */
  listEmailBookings(email: string): Promise<readonly PhoneBookingRow[]>;
}

/** Randomness and hashing the booking needs. The domain never touches crypto. */
export interface BookingCrypto {
  /** 256 bit URL safe token, returned to the guest once. */
  generateToken(): string;
  /** Lower case hex SHA-256, for tokens, idempotency keys and fingerprints. */
  sha256(value: string): string;
  randomBytes(length: number): Uint8Array;
}
