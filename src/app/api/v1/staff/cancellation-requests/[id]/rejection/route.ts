import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { CancellationRejectionRequest } from "@/contracts/api/v1/cancellation-requests";

// API-S19.
export const POST = staffRoute(
  {
    route: "/api/v1/staff/cancellation-requests/[id]/rejection",
    body: CancellationRejectionRequest,
  },
  async ({ staff, params, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().decideCancellation.reject(
        staff,
        String(params.id),
        body,
      ),
      {
        ok: ({ branchId, id, reservationId, status }) => {
          setBranch(branchId);
          return json(200, { id, reservationId, status });
        },
      },
    ),
);
