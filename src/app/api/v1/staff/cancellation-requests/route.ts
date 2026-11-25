import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { staffReservationQueries } from "@/composition/reservations";
import { StaffCancellationRequestQuery } from "@/contracts/api/v1/cancellation-requests";

// API-S17.
export const GET = staffRoute(
  {
    route: "/api/v1/staff/cancellation-requests",
    query: StaffCancellationRequestQuery,
  },
  async ({ staff, query }) =>
    toHttp(
      await staffReservationQueries().cancellationRequests.execute(
        staff,
        query,
      ),
      { ok: (page) => json(200, page) },
    ),
);
