import type { z } from "zod";

import type { QuoteRequest, QuoteResponse } from "@/contracts/api/v1/quotes";

import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

/** API-P6 ignores `phone`, so the client never sends one. */
export type QuoteInput = Omit<z.input<typeof QuoteRequest>, "phone">;

/** API-P6. The returned total is the only total a screen may show or send. */
export function requestQuote(input: QuoteInput, options: CallOptions = {}) {
  return send<ApiSuccess<200, z.output<typeof QuoteResponse>>>({
    ...options,
    method: "POST",
    path: ["quotes"],
    body: input,
    expect: [200],
    withAnalyticsSession: true,
  });
}
