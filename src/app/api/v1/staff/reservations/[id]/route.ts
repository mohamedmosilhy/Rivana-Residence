import { staffReservation } from "@/app/api/v1/_dto/reservations";
import { ifMatchVersion, json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationUpdated } from "@/app/api/v1/_http/staff-reservation-response";
import {
  staffReservationCommands,
  staffReservationQueries,
} from "@/composition/reservations";
import { UpdateReservationGuestRequest } from "@/contracts/api/v1/reservations";

export const GET = staffRoute(
  { route: "/api/v1/staff/reservations/[id]" },
  async ({ staff, params, setBranch }) =>
    toHttp(
      await staffReservationQueries().get.execute(staff, String(params.id)),
      {
        ok: ({ reservation }) => {
          setBranch(reservation.branchId);
          return json(200, staffReservation(reservation), {
            ETag: `"v${reservation.version}"`,
          });
        },
      },
    ),
);

export const PATCH = staffRoute(
  {
    route: "/api/v1/staff/reservations/[id]",
    body: UpdateReservationGuestRequest,
  },
  async ({ staff, params, request, body, setBranch }) =>
    toHttp(
      await staffReservationCommands().updateGuest.execute(
        staff,
        String(params.id),
        ifMatchVersion(request),
        body,
      ),
      {
        ok: ({ reservation }) =>
          staffReservationUpdated(reservation, setBranch),
      },
    ),
);
