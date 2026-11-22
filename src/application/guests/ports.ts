import type { PhoneNumber } from "@/domain/guests";
import type { VerificationPurpose } from "@/domain/shared/types";
import type { BranchScope } from "@/application/auth/authorize-branch";
import type { PagedResult, PageRequest } from "@/application/shared/pagination";
import type { Result } from "@/application/shared/result";
import type {
  ReservationSource,
  ReservationStatus,
} from "@/domain/shared/types";

export type GuestProfile = Readonly<{
  id: string;
  phone: string;
  name: string;
  email: string | null;
  phoneVerifiedAt: Date | null;
  marketingOptInAt: Date | null;
  marketingConsentVersion: string | null;
  marketingOptOutAt: Date | null;
  blockedAt: Date | null;
  blockedById: string | null;
  blockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;
export type GuestIdentity = Readonly<{
  id: string;
  phone: PhoneNumber;
  name: string;
  email: string | null;
  at: Date;
}>;
/** Global phone identity, used only after authorization by the owning use case. */
export interface GuestRepository {
  findByPhone(phone: PhoneNumber): Promise<GuestProfile | null>;
  /** Creates an unverified profile if absent. Existing profile fields are untouched. */
  ensureExists(input: GuestIdentity): Promise<GuestProfile>;
  /** Transaction only. Lock before inspecting blocking or counting per phone bookings. */
  lockByPhone(phone: PhoneNumber): Promise<Result<GuestProfile | null>>;
  /**
   * Transaction only, after lock. A website booking proves the phone, so it
   * sets the verification time once, refreshes the latest name and email, and
   * records a marketing opt in with its wording version. Block and earlier
   * consent are never cleared by anything but an explicit opt in.
   */
  recordWebsiteBooking(
    input: Readonly<{
      id: string;
      name: string;
      email: string | null;
      verifiedAt: Date;
      marketingConsentVersion: string | null;
    }>,
  ): Promise<GuestProfile>;
  findById(id: string): Promise<GuestProfile | null>;
  /** Transaction only. Locks the guest row by id (the row `lockByPhone` locks). */
  lockById(id: string): Promise<Result<GuestProfile | null>>;
  /** Transaction only, after lock. Blocks the phone for every branch (Q-29). */
  setBlocked(
    input: Readonly<{ id: string; by: string; reason: string; at: Date }>,
  ): Promise<GuestProfile>;
  /** Transaction only, after lock. Clears the block; history stays in the audit log. */
  clearBlocked(
    input: Readonly<{ id: string; at: Date }>,
  ): Promise<GuestProfile>;
  /** Transaction only, after lock. Updates contact only, preserving verification, block and consent. */
  updateContact(
    input: Readonly<{
      id: string;
      name: string;
      email: string | null;
      at: Date;
    }>,
  ): Promise<GuestProfile>;
}

export type VerificationRecord = Readonly<{
  id: string;
  phone: string;
  purpose: VerificationPurpose;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  tokenHash: string | null;
  tokenExpiresAt: Date | null;
  consumedAt: Date | null;
  clientKey: string;
  createdAt: Date;
}>;

export interface PhoneVerificationRepository {
  /** Transaction scoped, including phones without a guest or verification row. */
  lockPhone(phone: PhoneNumber): Promise<Result<void>>;
  findById(id: string): Promise<VerificationRecord | null>;
  /** Lookup by the SHA-256 of a presented token. Lock the row before trusting it. */
  findByTokenHash(tokenHash: string): Promise<VerificationRecord | null>;
  /** Marks a BOOKING token used, in the booking transaction. */
  consume(id: string, at: Date): Promise<void>;
  /** Lock after the guest row, then reload the verification. */
  lock(id: string): Promise<Result<VerificationRecord | null>>;
  requestHistory(phone: PhoneNumber, since: Date): Promise<readonly Date[]>;
  insert(record: VerificationRecord): Promise<void>;
  saveConfirmation(
    id: string,
    values: Readonly<{
      attempts: number;
      verifiedAt: Date | null;
      tokenHash: string | null;
      tokenExpiresAt: Date | null;
    }>,
  ): Promise<void>;
  /** Retain the request for rolling limits, but make its code unusable. */
  invalidate(id: string): Promise<void>;
  /**
   * Transaction only, after the phone and guest locks. Makes every unexpired
   * code and every live token of the phone unusable (S52) and reports how
   * many rows changed. Rows stay for the rolling limits.
   */
  invalidateOpenForPhone(phone: PhoneNumber, at: Date): Promise<number>;
}

/** One reservation of a guest, limited to the caller's branches (S51). */
export type GuestReservationItem = Readonly<{
  id: string;
  branchId: string;
  reference: string;
  source: ReservationSource;
  status: ReservationStatus;
  stay: Readonly<{ checkIn: string; checkOut: string }>;
  totalMinor: number | null;
}>;
export type GuestListItem = Readonly<{
  id: string;
  phone: string;
  name: string;
  verified: boolean;
  blocked: boolean;
  /** Reservations in the caller's branches only. */
  reservationCount: number;
}>;
export type GuestDirectoryQuery = PageRequest &
  Readonly<{ q?: string | undefined; blocked?: boolean | undefined }>;
export type GuestDetail = Readonly<{
  guest: GuestProfile;
  reservations: readonly GuestReservationItem[];
}>;
/** Unlocked staff reads. Callers authorize first and pass the branch scope. */
export interface GuestDirectoryReader {
  list(
    scope: BranchScope,
    query: GuestDirectoryQuery,
  ): Promise<PagedResult<GuestListItem>>;
  find(id: string, scope: BranchScope): Promise<GuestDetail | null>;
}

export interface PhoneVerificationCrypto {
  generateCode(): string;
  codeHash(id: string, phone: string, purpose: string, code: string): string;
  codeMatches(
    id: string,
    phone: string,
    purpose: string,
    code: string,
    hash: string,
  ): boolean;
  generateToken(): string;
  tokenHash(token: string): string;
}
