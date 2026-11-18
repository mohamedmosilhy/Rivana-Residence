import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { whatsAppTestResult } from "@/app/api/v1/_dto/whatsapp";
import { sendWhatsAppTest } from "@/composition/api";
import { WhatsAppTestMessageInput } from "@/contracts/api/v1/whatsapp";

// API-A8: the Admin's test message. 5 per 10 minutes per Admin; the result
// is stored on the settings and audited without the recipient.
export const POST = staffRoute(
  {
    route: "/api/v1/staff/settings/whatsapp/test-message",
    body: WhatsAppTestMessageInput,
  },
  async ({ staff, body }) =>
    toHttp(await sendWhatsAppTest(staff, body), {
      ok: (result) => json(200, whatsAppTestResult(result)),
    }),
);
