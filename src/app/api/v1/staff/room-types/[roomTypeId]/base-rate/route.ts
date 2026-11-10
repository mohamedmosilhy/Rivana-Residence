import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { money } from "@/app/api/v1/_dto/pricing";
import { setBaseRate } from "@/composition/api";
import { BaseRateInput } from "@/contracts/api/v1/pricing";

const ROUTE = "/api/v1/staff/room-types/[roomTypeId]/base-rate";

// API-S31: serialize base rate creation or replacement and audit it.
export const PUT = staffRoute(
  { route: ROUTE, body: BaseRateInput },
  async ({ staff, params, body }) =>
    toHttp(await setBaseRate(staff, String(params.roomTypeId), body), {
      ok: (rate) => json(200, money(rate.amount)),
    }),
);
