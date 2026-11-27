import "server-only";

import { GetBookingSetup } from "@/application/booking";
import { QUOTE_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { rateLimited } from "@/application/shared/result";
import { quoteBooking } from "@/composition/commercial";
import { isPaymentGatewayReady } from "@/composition/provider-readiness";
import { consumePublicRateLimit } from "@/composition/public-rate-limit";
import { verificationChannelReadiness } from "@/composition/verification-channels";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";

function bookingSetup() {
  return new GetBookingSetup({
    branches: new PrismaBranchRepository(),
    channels: verificationChannelReadiness(),
    services: new PrismaServiceOfferingRepository(getPrisma()),
    paymentReady: isPaymentGatewayReady,
    clock: { now: () => new Date() },
  });
}

/** A fresh read of what the branch's booking pages may offer. */
export function getBookingSetup(branchId: string) {
  return bookingSetup().execute(branchId);
}

/** The same rule without the services, for the search page. */
export function getBookingReadiness(branchId: string) {
  return bookingSetup().readiness(branchId);
}

/**
 * The details page's server quote: P6's use case under P6's per client limit.
 * The page has no visit id, so no website step is recorded here.
 */
export async function quoteBookingDetails(input: unknown, headers: Headers) {
  const { name, rule } = QUOTE_RATE_LIMIT;
  const admission = await consumePublicRateLimit(name, rule, headers);
  if (!admission.allowed) {
    return rateLimited("Too many price checks.", admission.retryAfterSeconds);
  }
  return quoteBooking().execute(input);
}
