import type { PhoneNumber } from "@/domain/guests";
import type { Result } from "@/application/shared/result";

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
