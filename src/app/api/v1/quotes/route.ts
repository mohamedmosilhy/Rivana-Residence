import { quoteResponse } from "@/app/api/v1/_dto/quotes";
import { json, publicRoute, toHttp } from "@/app/api/v1/_http";
import {
  QUOTE_COUPON_RATE_LIMIT,
  QUOTE_RATE_LIMIT,
} from "@/application/shared/public-rate-limit-policy";
import { quoteBooking } from "@/composition/api";
import { QuoteRequest } from "@/contracts/api/v1/quotes";

// API-P6. A read: no lock, hold, or cache. Every request takes the general
// limit; a request that sends a coupon code also takes the stricter one.
export const POST = publicRoute(
  {
    route: "/api/v1/quotes",
    body: QuoteRequest,
    rateLimit: QUOTE_RATE_LIMIT,
    rateLimitAfterBody: (body) =>
      body.couponCode ? QUOTE_COUPON_RATE_LIMIT : null,
  },
  async ({ body, setBranch }) =>
    toHttp(await quoteBooking(body), {
      ok: (result) => {
        setBranch(result.branchId);
        return json(200, quoteResponse(result));
      },
    }),
);
