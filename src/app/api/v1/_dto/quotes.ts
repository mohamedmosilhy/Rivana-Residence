import type { z } from "zod";

import { displayQuote, type QuoteResult } from "@/application/quotes";
import type { QuoteRequest, QuoteResponse } from "@/contracts/api/v1/quotes";

type Response = z.infer<typeof QuoteResponse>;

/**
 * The public P6 request without its unverified `phone`: P6 never evaluates
 * the per phone coupon limit (spec 0005 Decision 9.1). Only the booking
 * transaction does, against the verified phone.
 */
export function publicQuoteRequest(body: z.infer<typeof QuoteRequest>) {
  const request: Record<string, unknown> = { ...body };
  delete request.phone;
  return request;
}

/** An allowlist: internal ids, period ids, and rate sources never leave. */
export function quoteResponse(result: QuoteResult): Response {
  return {
    available: result.available,
    unavailableLines: [...result.unavailableLines],
    bookable: result.bookable,
    paymentMethods: [...result.paymentMethods],
    quote: result.quote ? displayQuote(result.quote) : null,
  };
}
