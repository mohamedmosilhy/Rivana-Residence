import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { ratePeriod } from "@/app/api/v1/_dto/pricing";
import { deactivateRatePeriod, updateRatePeriod } from "@/composition/api";
import { RatePeriodPatch } from "@/contracts/api/v1/pricing";

const ROUTE = "/api/v1/staff/rate-periods/[id]";

// API-S33: row locked merge. Reactivation can conflict with another period.
export const PATCH = staffRoute(
  { route: ROUTE, body: RatePeriodPatch },
  async ({ staff, params, body }) =>
    toHttp(await updateRatePeriod(staff, String(params.id), body), {
      ok: (updated) => json(200, ratePeriod(updated)),
    }),
);

// API-S34: idempotent soft deactivation. Existing snapshots are unaffected.
export const DELETE = staffRoute({ route: ROUTE }, async ({ staff, params }) =>
  toHttp(await deactivateRatePeriod(staff, String(params.id)), {
    ok: () => new Response(null, { status: 204 }),
  }),
);
