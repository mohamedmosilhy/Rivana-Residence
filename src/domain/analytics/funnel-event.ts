import type { SiteEventName } from "./site-event";

// Which server side events each booking outcome produces (ADR 029, spec 0007).

export type FunnelStepName = Exclude<SiteEventName, "PAGE_VIEW" | "STEP_VIEW">;

export type FunnelOutcome =
  | "NO_AVAILABILITY"
  | "INVENTORY_UNAVAILABLE"
  | "PRICE_CHANGED";

export type FunnelStep = Readonly<{
  name: FunnelStepName;
  /** The server's branch id, or the slug the request named. Neither for the code steps. */
  branchId?: string;
  branchSlug?: string;
  /** One listing per step, so listing quotes and bookings can be counted. */
  roomId?: string;
  outcome?: FunnelOutcome;
  /** Set only on a search that found nothing, for unmet demand. */
  stay?: Readonly<{ checkIn: string; checkOut: string }>;
}>;

/** A repeat of one of these inside the window adds no row (spec 0007, M10-T0b). */
export const REPEAT_SKIPPED_STEPS: ReadonlySet<FunnelStepName> = new Set([
  "QUOTE",
  "CODE_REQUESTED",
  "PHONE_VERIFIED",
]);
export const REPEAT_WINDOW_MS = 30 * 60_000;

const SESSION_ID = /^[0-9a-f]{32}$/;

/** Anything other than 32 lowercase hex characters is no session id. */
export function parseSessionId(value: unknown): string | null {
  return typeof value === "string" && SESSION_ID.test(value) ? value : null;
}

/** Only a step with a session is stored, except unmet demand. */
export function storedWithoutSession(step: FunnelStep) {
  return step.name === "SEARCH" && step.outcome === "NO_AVAILABILITY";
}

const perListing = (
  step: Omit<FunnelStep, "roomId">,
  roomIds: readonly string[],
): FunnelStep[] => [...new Set(roomIds)].map((roomId) => ({ ...step, roomId }));

export function searchSteps(
  search: Readonly<{
    branchId: string;
    stay: Readonly<{ checkIn: string; checkOut: string }>;
    results: readonly Readonly<{ available: boolean }>[];
  }>,
): FunnelStep[] {
  const found = search.results.some((result) => result.available);
  return [
    found
      ? { name: "SEARCH", branchId: search.branchId }
      : {
          name: "SEARCH",
          branchId: search.branchId,
          outcome: "NO_AVAILABILITY",
          stay: search.stay,
        },
  ];
}

/** A quote counts only when a price came back. */
export function quoteSteps(
  branchId: string,
  lines: readonly Readonly<{ roomTypeId: string }>[],
) {
  return perListing(
    { name: "QUOTE", branchId },
    lines.map((line) => line.roomTypeId),
  );
}

/** Sign in codes for "My reservations" are not booking steps. */
export function verificationSteps(
  name: "CODE_REQUESTED" | "PHONE_VERIFIED",
  purpose: unknown,
): FunnelStep[] {
  return purpose === "BOOKING" ? [{ name }] : [];
}

/** A pay at hotel booking is confirmed at once; an online one only by payment. */
export function bookingSavedSteps(
  booking: Readonly<{
    branchId: string;
    confirmed: boolean;
    roomTypeIds: readonly string[];
  }>,
): FunnelStep[] {
  const { branchId } = booking;
  return [
    { name: "BOOKING_SUBMITTED", branchId },
    ...(booking.confirmed
      ? bookingConfirmedSteps(branchId, booking.roomTypeIds)
      : []),
  ];
}

export function bookingConfirmedSteps(
  branchId: string,
  roomTypeIds: readonly string[],
) {
  return perListing({ name: "BOOKING_CONFIRMED", branchId }, roomTypeIds);
}

export function refusalSteps(
  branchSlug: string,
  errorCode: string,
): FunnelStep[] {
  return errorCode === "INVENTORY_UNAVAILABLE" || errorCode === "PRICE_CHANGED"
    ? [{ name: "CHECKOUT_REFUSED", branchSlug, outcome: errorCode }]
    : [];
}
