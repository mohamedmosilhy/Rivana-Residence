import type { Result } from "@/application/shared/result";

import type { GuestContact } from "@/domain/guests";
import type {
  ReservationReference,
  ReservationSnapshot,
  ReservationNightSnapshot,
} from "@/domain/reservations";
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
      Readonly<{ details: string | null }>)[];
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
  Omit<ReservationInsert, "contact" | "at" | "lines"> & {
    contact: Omit<GuestContact, "phone"> & { readonly phone: string | null };
    lines: readonly StoredReservationLine[];
    version: number;
    holdExpiresAt: Date | null;
    pmsEnteredAt: Date | null;
    pmsEnteredById: string | null;
    statusChangedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }
>;
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
}
