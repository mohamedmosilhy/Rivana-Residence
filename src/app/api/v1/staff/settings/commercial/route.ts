import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { commercialSettings } from "@/app/api/v1/_dto/commercial";
import {
  readCommercialSettings,
  updateCommercialSettings,
} from "@/composition/api";
import { CommercialSettingsInput } from "@/contracts/api/v1/commercial";

const ROUTE = "/api/v1/staff/settings/commercial";

// API-A5: the VAT rate. Reading needs pricing:read; writing is Admin only.
export const GET = staffRoute({ route: ROUTE }, async ({ staff }) =>
  toHttp(await readCommercialSettings(staff), {
    ok: (settings) => json(200, commercialSettings(settings)),
  }),
);

export const PUT = staffRoute(
  { route: ROUTE, body: CommercialSettingsInput },
  async ({ staff, body }) =>
    toHttp(await updateCommercialSettings(staff, body), {
      ok: (settings) => json(200, commercialSettings(settings)),
    }),
);
