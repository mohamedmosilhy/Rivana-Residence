import type { z } from "zod";

import type {
  PhoneVerificationConfirmation,
  PhoneVerificationConfirmed,
  PhoneVerificationRequest,
  PhoneVerificationRequested,
} from "@/contracts/api/v1/phone-verifications";

import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

/** API-P9: send a code. */
export function requestVerification(
  input: z.input<typeof PhoneVerificationRequest>,
  options: CallOptions = {},
) {
  return send<ApiSuccess<201, z.output<typeof PhoneVerificationRequested>>>({
    ...options,
    method: "POST",
    path: ["phone-verifications"],
    body: input,
    expect: [201],
    withAnalyticsSession: true,
  });
}

/** API-P10: check the code. The returned token stays in memory. */
export function confirmVerification(
  verificationId: string,
  input: z.input<typeof PhoneVerificationConfirmation>,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof PhoneVerificationConfirmed>>>({
    ...options,
    method: "POST",
    path: ["phone-verifications", verificationId, "confirmation"],
    body: input,
    expect: [200],
    withAnalyticsSession: true,
  });
}
