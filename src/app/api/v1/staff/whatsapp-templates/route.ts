import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import {
  whatsAppTemplate,
  whatsAppTemplateList,
} from "@/app/api/v1/_dto/whatsapp";
import {
  createWhatsAppTemplate,
  listWhatsAppTemplates,
} from "@/composition/api";
import { WhatsAppTemplateInput } from "@/contracts/api/v1/whatsapp";

const ROUTE = "/api/v1/staff/whatsapp-templates";

// API-A7: WhatsApp templates (settings:edit, Admin only), audited.
export const GET = staffRoute({ route: ROUTE }, async ({ staff }) =>
  toHttp(await listWhatsAppTemplates(staff), {
    ok: (records) => json(200, whatsAppTemplateList(records)),
  }),
);

export const POST = staffRoute(
  { route: ROUTE, body: WhatsAppTemplateInput },
  async ({ staff, body }) =>
    toHttp(await createWhatsAppTemplate(staff, body), {
      ok: (record) =>
        json(201, whatsAppTemplate(record), {
          Location: `${ROUTE}/${record.id}`,
        }),
    }),
);
