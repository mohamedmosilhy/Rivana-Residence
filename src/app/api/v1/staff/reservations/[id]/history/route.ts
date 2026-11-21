import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationQueries } from "@/composition/reservations";

export const GET = staffRoute(
  { route: "/api/v1/staff/reservations/[id]/history" },
  async ({ staff, params }) =>
    toHttp(
      await staffReservationQueries().history.execute(staff, String(params.id)),
      {
        ok: (history) => json(200, history),
      },
    ),
);
