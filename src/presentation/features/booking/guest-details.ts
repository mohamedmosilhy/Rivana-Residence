// The details a guest types, and the checks the browser makes before a code is
// sent. The server stays the authority (P9, and P7 at submit). The limits and
// the email shape repeat `src/domain/guests` so the validation library stays
// out of the browser; a unit test keeps the two in step.

export type GuestDetails = Readonly<{
  fullName: string;
  email: string;
  /** ISO country code of the phone selector. */
  country: string;
  /** As typed: a national number, or a full number starting with +. */
  phone: string;
  specialRequests: string;
}>;
export type GuestDetailsField = keyof GuestDetails;
export type GuestDetailsErrors = Partial<Record<GuestDetailsField, string>>;

export const GUEST_INPUT_LIMITS = Object.freeze({
  fullName: 120,
  // P7 takes at most 254 characters.
  email: 254,
  phone: 40,
  specialRequests: 1000,
});

export const DEFAULT_PHONE_COUNTRY = "EG";

export const emptyGuestDetails: GuestDetails = Object.freeze({
  fullName: "",
  email: "",
  country: DEFAULT_PHONE_COUNTRY,
  phone: "",
  specialRequests: "",
});

const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
/** What the server refuses in every free text field of a booking. */
export const CONTROL = /[\p{Cc}\p{Cf}]/u;
export const HIDDEN = "Remove hidden or special control characters.";

/**
 * Trimmed values in the form the server accepts. The server refuses line
 * breaks in special requests, so they become spaces.
 */
export function normalizeGuestDetails(details: GuestDetails): GuestDetails {
  return {
    fullName: details.fullName.trim(),
    email: details.email.trim(),
    country: details.country,
    phone: details.phone.trim(),
    specialRequests: details.specialRequests
      .replace(/\s*[\r\n\t]+\s*/g, " ")
      .trim(),
  };
}

/** Checks normalized details. The phone number itself is checked separately. */
export function checkGuestDetails(details: GuestDetails): GuestDetailsErrors {
  const errors: GuestDetailsErrors = {};
  const { fullName, email, phone, specialRequests } = details;
  const tooLong = (limit: number) => `Use ${limit} characters or fewer.`;

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (CONTROL.test(fullName)) errors.fullName = HIDDEN;
  else if (fullName.length > GUEST_INPUT_LIMITS.fullName)
    errors.fullName = tooLong(GUEST_INPUT_LIMITS.fullName);

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > GUEST_INPUT_LIMITS.email || !EMAIL.test(email))
    errors.email = "Enter a valid email address, such as name@example.com.";

  if (!phone) errors.phone = "Enter your phone number.";

  if (CONTROL.test(specialRequests)) errors.specialRequests = HIDDEN;
  else if (specialRequests.length > GUEST_INPUT_LIMITS.specialRequests)
    errors.specialRequests = tooLong(GUEST_INPUT_LIMITS.specialRequests);

  return errors;
}
