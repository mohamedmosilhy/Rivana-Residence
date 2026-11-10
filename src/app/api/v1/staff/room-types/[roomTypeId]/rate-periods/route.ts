import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { ratePeriod } from "@/app/api/v1/_dto/pricing";
import { createRatePeriod } from "@/composition/api";
import { RatePeriodInput } from "@/contracts/api/v1/pricing";

const ROUTE = "/api/v1/staff/room-types/[roomTypeId]/rate-periods";

// API-S32: creates one active date period. Active overlaps are conflicts.
export const POST = staffRoute(
  { route: ROUTE, body: RatePeriodInput },
  async ({ staff, params, body }) =>
    toHttp(await createRatePeriod(staff, String(params.roomTypeId), body), {
      ok: (created) =>
        json(201, ratePeriod(created), {
          Location: `/api/v1/staff/rate-periods/${created.id}`,
        }),
    }),
);
