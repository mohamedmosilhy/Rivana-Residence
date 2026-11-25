import { changeRequest } from "@/app/api/v1/_dto/guests";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { CancellationRejectionRequest } from "@/contracts/api/v1/cancellation-requests";

// API-S58.
export const POST = staffRoute(
  {
    route: "/api/v1/staff/change-requests/[id]/rejection",
    body: CancellationRejectionRequest,
  },
  async ({ staff, params, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().decideChange.reject(
        staff,
        String(params.id),
        body,
      ),
      {
        ok: ({ request, branchId }) => {
          setBranch(branchId);
          return json(200, changeRequest(request));
        },
      },
    ),
);
