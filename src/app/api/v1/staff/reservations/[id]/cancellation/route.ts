import { staffReservation } from "@/app/api/v1/_dto/reservations";
import { ifMatchVersion, json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { CancelReservationRequest } from "@/contracts/api/v1/reservations";

export const POST = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]/cancellation",
    body: CancelReservationRequest,
  },
  async ({ staff, params, body, request, setBranch }) =>
    toHttp(
      await staffReservationCommands().cancel.execute(
        staff,
        String(params.id),
        ifMatchVersion(request),
        body,
      ),
      {
        ok: ({ reservation }) => {
          setBranch(reservation.branchId);
          return json(200, staffReservation(reservation), {
            ETag: `"v${reservation.version}"`,
          });
        },
      },
    ),
);
