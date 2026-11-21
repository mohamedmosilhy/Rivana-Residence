import { staffReservation } from "@/app/api/v1/_dto/reservations";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationCommands } from "@/composition/reservations";
import { RecordExternalReservationRequest } from "@/contracts/api/v1/reservations";

export const POST = staffRoute(
  {
    route: "/api/v1/staff/external-reservations",
    body: RecordExternalReservationRequest,
  },
  async ({ staff, body, request, setBranch }) => {
    return toHttp(
      await staffReservationCommands().recordExternal.execute(
        staff,
        body,
        request.headers.get("Idempotency-Key"),
      ),
      {
        ok: ({ reservation, replayed }) => {
          setBranch(reservation.branchId);
          return json(
            replayed ? 200 : 201,
            staffReservation(reservation),
            replayed
              ? undefined
              : { Location: `/api/v1/staff/reservations/${reservation.id}` },
          );
        },
      },
    );
  },
);
