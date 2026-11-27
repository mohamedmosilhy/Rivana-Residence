import type { BookingCreated } from "@/presentation/api-client/reservations";

const resultKey = "rivana.booking.result";
type Created = Extract<BookingCreated, { status: 201 }>["data"];

export type SavedBooking = Readonly<{
  branchSlug: string;
  reference: string;
  status: Created["status"];
  token: string;
}>;

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Only the one-time manage credential travels to the next screen. */
export function saveBookingResult(branchSlug: string, result: Created) {
  try {
    sessionStorage.removeItem(resultKey);
    const token = /^\/reservations\/manage#t=([A-Za-z0-9_-]{43})$/.exec(
      result.manageUrl,
    )?.[1];
    if (!token) return false;
    const saved: SavedBooking = {
      branchSlug,
      reference: result.reference,
      status: result.status,
      token,
    };
    sessionStorage.setItem(resultKey, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function readBookingResult(branchSlug: string): SavedBooking | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(resultKey) ?? "null");
    if (
      value?.branchSlug === branchSlug &&
      typeof value.reference === "string" &&
      (value.status === "CONFIRMED" || value.status === "AWAITING_PAYMENT") &&
      typeof value.token === "string" &&
      tokenPattern.test(value.token)
    )
      return value;
  } catch {
    // Missing or blocked tab storage uses the booking message instead.
  }
  return null;
}

/** A replay supplies no new token. Never carry another booking into checkout. */
export function keepMatchingResult(branchSlug: string, reference: string) {
  if (readBookingResult(branchSlug)?.reference === reference) return;
  try {
    sessionStorage.removeItem(resultKey);
  } catch {
    /* Storage can be unavailable. */
  }
}
