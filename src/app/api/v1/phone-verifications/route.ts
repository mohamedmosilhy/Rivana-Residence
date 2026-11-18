import { json, publicRoute, toHttp } from "@/app/api/v1/_http";
import { VERIFICATION_REQUEST_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { requestPhoneVerification } from "@/composition/guests";
import { PhoneVerificationRequest } from "@/contracts/api/v1/phone-verifications";

export const POST = publicRoute(
  {
    route: "/api/v1/phone-verifications",
    body: PhoneVerificationRequest,
    rateLimit: VERIFICATION_REQUEST_RATE_LIMIT,
  },
  async ({ body, request }) =>
    toHttp(await requestPhoneVerification(body, request.headers), {
      ok: (value) => json(201, value),
    }),
);
