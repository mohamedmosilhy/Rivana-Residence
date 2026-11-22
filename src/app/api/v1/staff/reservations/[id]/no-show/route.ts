import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import { ifMatchVersion, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { ReservationOperationNote } from "@/contracts/api/v1/reservations";

export const POST = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]/no-show",
    body: ReservationOperationNote,
    bodyOptional: true,
  },
  async ({ staff, params, request, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().markNoShow.execute(
        staff,
        String(params.id),
        ifMatchVersion(request),
        body.note,
      ),
      {
        ok: ({ reservation }) =>
          staffReservationUpdated(reservation, setBranch),
      },
    ),
);
