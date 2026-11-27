import "server-only";

import { AVAILABILITY_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { rateLimited } from "@/application/shared/result";
import { recordFunnelSteps } from "@/composition/analytics";
import { publicAvailability } from "@/composition/inventory";
import { consumePublicRateLimit } from "@/composition/public-rate-limit";
import { searchSteps } from "@/domain/analytics";

export async function searchAndRecordAvailability(
  slug: string,
  input: unknown,
  headers: Headers,
  sessionId: string | null,
) {
  const result = await publicAvailability().execute(slug, input);
  if (result.ok) {
    const { branchId, stay, results } = result.value;
    await recordFunnelSteps({
      sessionId,
      headers,
      steps: () =>
        searchSteps({
          branchId,
          stay: {
            checkIn: stay.checkIn.value,
            checkOut: stay.checkOut.value,
          },
          results,
        }),
    });
  }
  return result;
}

export async function searchBookingPage(
  slug: string,
  input: unknown,
  headers: Headers,
) {
  const { name, rule } = AVAILABILITY_RATE_LIMIT;
  const admission = await consumePublicRateLimit(name, rule, headers);
  if (!admission.allowed) {
    return rateLimited("Too many searches.", admission.retryAfterSeconds);
  }
  // The GET form has no browser session id. Only unmet demand is recorded.
  return searchAndRecordAvailability(slug, input, headers, null);
}
