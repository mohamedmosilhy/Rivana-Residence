import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { CancellationApprovalRequest } from "@/contracts/api/v1/cancellation-requests";

// API-S18. 200 when the booking was cancelled at once, 202 when a refund was
// started and the booking is cancelled once the gateway confirms it.
export const POST = staffRoute(
  {
    route: "/api/v1/staff/cancellation-requests/[id]/approval",
    body: CancellationApprovalRequest,
    bodyOptional: true,
  },
  async ({ staff, params, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().decideCancellation.approve(
        staff,
        String(params.id),
        body,
      ),
      {
        ok: ({ branchId, refundStarted, ...decision }) => {
          setBranch(branchId);
          return json(refundStarted ? 202 : 200, decision);
        },
      },
    ),
);
