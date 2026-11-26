import type { z } from "zod";

import type {
  AvailabilityQuery,
  AvailabilityResponse,
} from "@/contracts/api/v1/availability";

import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

/** API-P5. Server pages call the use case; this is for the browser. */
export function searchAvailability(
  branchSlug: string,
  query: z.input<typeof AvailabilityQuery>,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof AvailabilityResponse>>>({
    ...options,
    method: "GET",
    path: ["branches", branchSlug, "availability"],
    query,
    expect: [200],
    withAnalyticsSession: true,
  });
}
