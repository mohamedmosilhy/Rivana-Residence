import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import { ifMatchVersion, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { RoomAssignmentInput } from "@/contracts/api/v1/reservations";

export const PUT = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]/rooms/[lineId]/assignment",
    body: RoomAssignmentInput,
  },
  async ({ staff, params, request, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().assignRoom.execute(
        staff,
        String(params.id),
        String(params.lineId),
        ifMatchVersion(request),
        body.physicalRoomId,
      ),
      {
        ok: ({ reservation }) =>
          staffReservationUpdated(reservation, setBranch),
      },
    ),
);
