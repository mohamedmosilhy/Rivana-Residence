import { staffReservation } from "@/app/api/v1/_dto/reservations";
import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationQueries } from "@/composition/reservations";

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
