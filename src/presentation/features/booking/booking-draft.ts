import {
  emptyGuestDetails,
  GUEST_INPUT_LIMITS,
  type GuestDetails,
} from "./guest-details";

// What the guest typed, kept for this tab only so a reload loses nothing
// (spec 0007). Only these five fields are ever written: no code, verification
// id, or token. Storage can throw in some privacy modes; the page then works
// without a draft.

export const draftKey = (branchSlug: string) =>
  `rivana.booking.draft.${branchSlug}`;

export function readDraft(
  branchSlug: string,
  countries: readonly string[],
): GuestDetails {
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(draftKey(branchSlug)) ?? "null",
    );
    if (typeof stored !== "object" || stored === null) return emptyGuestDetails;
    const values = stored as Record<string, unknown>;
    const text = (field: keyof typeof GUEST_INPUT_LIMITS) => {
      const value = values[field];
      return typeof value === "string"
        ? value.slice(0, GUEST_INPUT_LIMITS[field])
        : "";
    };
    return {
      fullName: text("fullName"),
      email: text("email"),
      country:
        typeof values.country === "string" && countries.includes(values.country)
          ? values.country
          : emptyGuestDetails.country,
      phone: text("phone"),
      specialRequests: text("specialRequests"),
    };
  } catch {
    return emptyGuestDetails;
  }
}

export function saveDraft(branchSlug: string, details: GuestDetails) {
  const { fullName, email, country, phone, specialRequests } = details;
  try {
    window.sessionStorage.setItem(
      draftKey(branchSlug),
      JSON.stringify({ fullName, email, country, phone, specialRequests }),
    );
  } catch {
    // A draft is a convenience only.
  }
}

export function clearDraft(branchSlug: string) {
  try {
    window.sessionStorage.removeItem(draftKey(branchSlug));
  } catch {
    // Nothing was stored if storage is blocked.
  }
}
