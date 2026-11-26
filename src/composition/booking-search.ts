import "server-only";

import { GetBookingSearchSetup } from "@/application/booking";
import { AVAILABILITY_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { rateLimited } from "@/application/shared/result";
import { recordFunnelSteps } from "@/composition/analytics";
import { publicAvailability } from "@/composition/inventory";
import { isPaymentGatewayReady } from "@/composition/provider-readiness";
import { consumePublicRateLimit } from "@/composition/public-rate-limit";
import { verificationChannelReadiness } from "@/composition/verification-channels";
import { searchSteps } from "@/domain/analytics";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";

/** A fresh read of the settings that decide whether the branch can take new bookings. */
export function getBookingSearchSetup(branchId: string) {
  return new GetBookingSearchSetup({
    branches: new PrismaBranchRepository(),
    channels: verificationChannelReadiness(),
    paymentReady: isPaymentGatewayReady,
    clock: { now: () => new Date() },
  }).execute(branchId);
}

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
