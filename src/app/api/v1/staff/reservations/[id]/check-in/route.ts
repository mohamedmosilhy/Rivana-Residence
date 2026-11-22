import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import { ifMatchVersion, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";

export const POST = staffRoute(
  { route: "/api/v1/staff/reservations/[id]/check-in" },
  async ({ staff, params, request, setBranch }) =>
    toHttp(
      await staffReservationCommands().checkIn.execute(
        staff,
        String(params.id),
        ifMatchVersion(request),
      ),
      {
        ok: ({ reservation }) =>
          staffReservationUpdated(reservation, setBranch),
      },
    ),
);
