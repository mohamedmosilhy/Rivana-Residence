import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";

// API-S45. Only for a payment whose refund failed.
export const POST = staffRoute(
  { route: "/api/v1/staff/payments/[id]/refund-retry" },
  async ({ staff, params }) =>
    toHttp(
      await staffReservationCommands().retryRefund.execute(
        staff,
        String(params.id),
      ),
      { ok: (accepted) => json(202, accepted) },
    ),
);
