import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationQueries } from "@/composition/reservations";
import { StaffChangeRequestQuery } from "@/contracts/api/v1/change-requests";

// API-S56.
export const GET = staffRoute(
  {
    route: "/api/v1/staff/change-requests",
    query: StaffChangeRequestQuery,
  },
  async ({ staff, query }) =>
    toHttp(
      await staffReservationQueries().changeRequests.execute(staff, query),
      { ok: (page) => json(200, page) },
    ),
);
