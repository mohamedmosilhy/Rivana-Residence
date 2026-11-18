import { json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { VERIFICATION_CONFIRM_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { confirmPhoneVerification } from "@/composition/guests";
import { PhoneVerificationConfirmation } from "@/contracts/api/v1/phone-verifications";

export const POST = publicRoute(
  {
    route: "/api/v1/phone-verifications/[verificationId]/confirmation",
    body: PhoneVerificationConfirmation,
    rateLimit: VERIFICATION_CONFIRM_RATE_LIMIT,
  },
  async ({ params, body }) =>
    toHttp(await confirmPhoneVerification(params.verificationId, body), {
      ok: (value) => json(200, value),
    }),
);
