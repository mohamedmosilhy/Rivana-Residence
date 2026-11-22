import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import { ifMatchVersion, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { ReservationOperationNote } from "@/contracts/api/v1/reservations";

export const POST = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]/pms-entry",
    body: ReservationOperationNote,
    bodyOptional: true,
  },
  async ({ staff, params, request, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().markEntered.execute(
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
