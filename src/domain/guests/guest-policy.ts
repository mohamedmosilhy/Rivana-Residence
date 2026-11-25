import type {
  ReservationSource,
  VerificationChannel,
} from "@/domain/shared/types";
import {
  RESERVATION_SOURCES,
  VERIFICATION_CHANNELS,
} from "@/domain/shared/types";
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

/**
 * Whether guest messages may go to a booking's phone by WhatsApp. A booking
 * verified by email has no proven phone, so it never does: not its details
 * and never a manage link (spec 0006 Decision 9). Null is a staff, external,
 * or WhatsApp verified booking.
 */
export function guestWhatsAppAllowed(
  phone: string | null,
  verificationChannel: VerificationChannel | null,
): boolean {
  return Boolean(phone) && verificationChannel !== "EMAIL";
}

/** What a guest profile already proves. */
export type GuestProfileProof = Readonly<{
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
}>;
export type WebsiteBookingProfileInput = Readonly<{
  name: string;
  /** Normalized (lowercase). */
  email: string | null;
  channel: VerificationChannel;
  at: Date;
  marketingConsentVersion: string | null;
}>;
export type WebsiteBookingProfileUpdate = Readonly<{
  /** Undefined keeps the profile's name and email. */
  contact?: Readonly<{ name: string; email: string | null }>;
  phoneVerifiedAt: Date | null;
  emailVerifiedAt: Date | null;
  /** Null records no opt in; earlier consent is never cleared here. */
  marketingConsentVersion: string | null;
}>;

/**
 * How a website booking updates the one guest profile of its phone
 * (ADR 031, spec 0006 Decision 9). A WhatsApp code proves the phone; an email
 * code proves only the email, so it never verifies the phone, never records
 * marketing consent for it, and never overwrites the contact of an existing
 * profile (owner decision, 2026-11-26).
 */
export function websiteBookingProfile(
  current: GuestProfileProof,
  booking: WebsiteBookingProfileInput,
): WebsiteBookingProfileUpdate {
  const at = instant(booking.at, "at");
  if (!VERIFICATION_CHANNELS.includes(booking.channel))
    policyInputError("channel");
  if (current.phoneVerifiedAt !== null)
    instant(current.phoneVerifiedAt, "phoneVerifiedAt");
  if (current.emailVerifiedAt !== null)
    instant(current.emailVerifiedAt, "emailVerifiedAt");
  const now = () => new Date(at);
  const copy = (value: Date | null) =>
    value === null ? null : new Date(value.getTime());
  const sameEmail = booking.email !== null && booking.email === current.email;
  if (booking.channel === "WHATSAPP")
    return {
      contact: { name: booking.name, email: booking.email },
      phoneVerifiedAt: copy(current.phoneVerifiedAt) ?? now(),
      emailVerifiedAt: sameEmail ? copy(current.emailVerifiedAt) : null,
      marketingConsentVersion: booking.marketingConsentVersion,
    };
  if (booking.email === null) policyInputError("email");
  // An email code proves nothing about the phone, so it never rewrites the
  // contact of an existing profile, proven or not (for example one staff
  // created at the desk). A new profile already holds the typed details, and
  // only the profile's own email, when it is the proven one, becomes verified.
  return {
    phoneVerifiedAt: copy(current.phoneVerifiedAt),
    emailVerifiedAt: sameEmail ? now() : copy(current.emailVerifiedAt),
    marketingConsentVersion: null,
  };
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
