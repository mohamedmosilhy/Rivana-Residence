import type { ReservationSource } from "@/domain/shared/types";
import { RESERVATION_SOURCES } from "@/domain/shared/types";
import type { PhoneNumber } from "./phone-number";
import { instant, policyInputError } from "./policy-values";

/** Only proved website possession can verify a new profile; staff entry preserves existing verification. */
export function guestPhoneVerifiedAt(
  source: ReservationSource,
  existingVerifiedAt: Date | null,
  bookingVerifiedAt: Date | null,
): Date | null {
  if (!RESERVATION_SOURCES.includes(source)) policyInputError("source");
  if (existingVerifiedAt !== null)
    instant(existingVerifiedAt, "existingVerifiedAt");
  if (bookingVerifiedAt !== null)
    instant(bookingVerifiedAt, "bookingVerifiedAt");
  if (source === "WEBSITE") {
    if (bookingVerifiedAt === null) policyInputError("bookingVerifiedAt");
    return new Date(bookingVerifiedAt.getTime());
  }
  return existingVerifiedAt === null
    ? null
    : new Date(existingVerifiedAt.getTime());
}

/** These grants are created only after application-level token lookup/expiry validation, never from request JSON. */
export type GuestContactGrant =
  | Readonly<{ kind: "NONE" }>
  | Readonly<{ kind: "MANAGE_TOKEN"; reservationId: string }>
  | Readonly<{ kind: "GUEST_SESSION"; phone: PhoneNumber }>;
export function canReadReservationContact(
  grant: GuestContactGrant,
  reservationId: string,
  phone: PhoneNumber | null,
  blocked: boolean,
): boolean {
  if (!reservationId || typeof blocked !== "boolean")
    policyInputError("access");
  switch (grant.kind) {
    case "NONE":
      return false;
    case "MANAGE_TOKEN":
      return grant.reservationId === reservationId;
    case "GUEST_SESSION":
      return !blocked && phone !== null && grant.phone.equals(phone);
    default:
      return false;
  }
}
