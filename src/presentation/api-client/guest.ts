import type { z } from "zod";

import type { ChangeRequestDto } from "@/contracts/api/v1/change-requests";
import type {
  ApplyGuestChangeInput,
  CancellationRequest,
  CreateCancellationRequest,
  GuestChangeInput,
  GuestChangePreview,
  GuestReservation,
  GuestReservationList,
} from "@/contracts/api/v1/guests";

import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

// API-G1 to G6. Tokens travel in the Authorization header, never in a URL.

/** How a guest proves a booking is theirs. Both ways share one set of calls. */
export type GuestAccess =
  | Readonly<{ kind: "MANAGE_LINK"; token: string }>
  | Readonly<{ kind: "SESSION"; token: string; reference: string }>;

const reservationPath = (access: GuestAccess) =>
  access.kind === "MANAGE_LINK"
    ? ["guest", "reservation"]
    : ["guest", "reservations", access.reference];

/** API-G1 (manage link) and G4 (session). */
export function getGuestReservation(
  access: GuestAccess,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof GuestReservation>>>({
    ...options,
    method: "GET",
    path: reservationPath(access),
    bearer: access.token,
    expect: [200],
  });
}

/** API-G3. */
export function listGuestReservations(
  sessionToken: string,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof GuestReservationList>>>({
    ...options,
    method: "GET",
    path: ["guest", "reservations"],
    bearer: sessionToken,
    expect: [200],
  });
}

/** API-G2 and the G4 request. */
export function requestCancellation(
  access: GuestAccess,
  input: z.input<typeof CreateCancellationRequest>,
  options: CallOptions = {},
) {
  return send<ApiSuccess<201, z.output<typeof CancellationRequest>>>({
    ...options,
    method: "POST",
    path: [...reservationPath(access), "cancellation-requests"],
    bearer: access.token,
    body: input,
    expect: [201],
  });
}

/** API-G5. Writes nothing. Send the `etag` back to `applyChange`. */
export function previewChange(
  access: GuestAccess,
  input: z.input<typeof GuestChangeInput>,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof GuestChangePreview>>>({
    ...options,
    method: "POST",
    path: [...reservationPath(access), "change-preview"],
    bearer: access.token,
    body: input,
    expect: [200],
  });
}

export type ChangeSubmitted =
  /** The booking changed. */
  | ApiSuccess<200, z.output<typeof GuestReservation>>
  /** Sent to the hotel for approval; the booking has not changed. */
  | ApiSuccess<202, z.output<typeof ChangeRequestDto>>;

/** API-G6. `etag` is the preview's, so a booking that moved on is refused. */
export function applyChange(
  access: GuestAccess,
  etag: string,
  input: z.input<typeof ApplyGuestChangeInput>,
  options: CallOptions = {},
) {
  return send<ChangeSubmitted>({
    ...options,
    method: "POST",
    path: [...reservationPath(access), "changes"],
    bearer: access.token,
    headers: { "If-Match": etag },
    body: input,
    expect: [200, 202],
  });
}
