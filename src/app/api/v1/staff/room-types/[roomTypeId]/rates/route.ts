import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { rateCalendar } from "@/app/api/v1/_dto/pricing";
import { readRates } from "@/composition/api";
import { RateQuery } from "@/contracts/api/v1/pricing";

const ROUTE = "/api/v1/staff/room-types/[roomTypeId]/rates";

// API-S30: base, intersecting periods, and a resolved calendar up to 62 nights.
export const GET = staffRoute(
  { route: ROUTE, query: RateQuery },
  async ({ staff, params, query }) =>
    toHttp(await readRates(staff, String(params.roomTypeId), query), {
      ok: (rates) => json(200, rateCalendar(rates)),
    }),
);
