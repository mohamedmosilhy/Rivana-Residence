import type { z } from "zod";

import type {
  WebsiteReservationCreated,
  WebsiteReservationReplayed,
  WebsiteReservationRequest,
} from "@/contracts/api/v1/reservations";

import { analyticsSessionId } from "./analytics-session";
import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

/** The client adds the visit id itself, so opting out is always honored. */
export type BookingInput = Omit<
  z.input<typeof WebsiteReservationRequest>,
  "analyticsSessionId"
>;

export type BookingCreated =
  /** A new booking. Only this answer carries the manage link. */
  | ApiSuccess<201, z.output<typeof WebsiteReservationCreated>>
  /** The same submission seen again: the booking's current status. */
  | ApiSuccess<200, z.output<typeof WebsiteReservationReplayed>>;

/**
 * API-P7. Keep `idempotencyKey` for every retry of the same submission,
 * including after `NETWORK`, so it can never book twice.
 */
export function createReservation(
  input: BookingInput,
  idempotencyKey: string,
  options: CallOptions = {},
) {
  return send<BookingCreated>({
    ...options,
    method: "POST",
    path: ["reservations"],
    headers: { "Idempotency-Key": idempotencyKey },
    body: { ...input, analyticsSessionId: analyticsSessionId() ?? undefined },
    expect: [200, 201],
  });
}
