import { json, toHttp, webhookRoute } from "@/app/api/v1/_http";
import { processPaymentCallback } from "@/composition/reservations";

// API-P8. No session and no CSRF: the gateway adapter verifies the raw bytes.
// A recorded event always answers 200 so the gateway stops retrying.
export const POST = webhookRoute(
  { route: "/api/v1/payments/callback", maxBytes: 64 * 1024 },
  async ({ request, rawBody, headers }) =>
    toHttp(
      await processPaymentCallback().execute({
        rawBody,
        headers,
        url: new URL(request.url),
      }),
      { ok: () => json(200, { received: true }) },
    ),
);
