import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { whatsAppTemplate } from "@/app/api/v1/_dto/whatsapp";
import { updateWhatsAppTemplate } from "@/composition/api";
import { WhatsAppTemplatePatch } from "@/contracts/api/v1/whatsapp";

// API-A7: patch a template under its row lock (settings:edit, Admin only).
export const PATCH = staffRoute(
  {
    route: "/api/v1/staff/whatsapp-templates/[id]",
    body: WhatsAppTemplatePatch,
  },
  async ({ staff, params, body }) =>
    toHttp(await updateWhatsAppTemplate(staff, String(params.id), body), {
      ok: (record) => json(200, whatsAppTemplate(record)),
    }),
);
