import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { whatsAppSetup } from "@/app/api/v1/_dto/whatsapp";
import {
  readWhatsAppSettings,
  updateWhatsAppSettings,
} from "@/composition/api";
import { WhatsAppSettingsInput } from "@/contracts/api/v1/whatsapp";

const ROUTE = "/api/v1/staff/settings/whatsapp";

// API-A6: the WhatsApp setup (settings:edit, Admin only). The access token is
// never accepted or returned; GET reports only whether it is configured.
export const GET = staffRoute({ route: ROUTE }, async ({ staff }) =>
  toHttp(await readWhatsAppSettings(staff), {
    ok: (view) => json(200, whatsAppSetup(view)),
  }),
);

export const PUT = staffRoute(
  { route: ROUTE, body: WhatsAppSettingsInput },
  async ({ staff, body }) =>
    toHttp(await updateWhatsAppSettings(staff, body), {
      ok: (view) => json(200, whatsAppSetup(view)),
    }),
);
