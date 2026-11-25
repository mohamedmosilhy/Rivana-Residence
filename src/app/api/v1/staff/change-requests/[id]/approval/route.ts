import { staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import { staffReservationCommands } from "@/composition/reservations";
import { CancellationApprovalRequest } from "@/contracts/api/v1/cancellation-requests";

// API-S57.
export const POST = staffRoute(
  {
    route: "/api/v1/staff/change-requests/[id]/approval",
    body: CancellationApprovalRequest,
    bodyOptional: true,
  },
  async ({ staff, params, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().decideChange.approve(
        staff,
        String(params.id),
        body,
      ),
      { ok: (reservation) => staffReservationUpdated(reservation, setBranch) },
    ),
);
