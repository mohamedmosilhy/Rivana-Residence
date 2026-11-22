import { staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";

export const POST = staffRoute(
  { route: "/api/v1/staff/reservations/[id]/manage-link" },
  async ({ staff, params, setBranch }) =>
    toHttp(
      await staffReservationCommands().resendManageLink.execute(
        staff,
        String(params.id),
      ),
      {
        ok: ({ branchId }) => {
          setBranch(branchId);
          return new Response(null, { status: 202 });
        },
      },
    ),
);
