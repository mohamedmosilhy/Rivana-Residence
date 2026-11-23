import { DomainValidationError } from "@/domain/shared/domain-error";
import { PAYMENT_METHODS, type PaymentMethod } from "@/domain/shared/types";

export type PaymentMethodUnavailableReason =
  | "GATEWAY_NOT_READY"
  | "BRANCH_ONLINE_DISABLED"
  | "ZERO_TOTAL";
export type PaymentMethodAvailabilityResult =
  | Readonly<{ available: true }>
  | Readonly<{
      available: false;
      reason: PaymentMethodUnavailableReason;
    }>;

/** CP-6: `PAY_AT_HOTEL` is always offered; `ONLINE` needs a ready gateway, an enabled branch, and a total above zero. */
export function paymentMethodAvailability(input: {
  method: PaymentMethod;
  gatewayReady: boolean;
  branchOnlinePaymentEnabled: boolean;
  totalMinor: number;
}): PaymentMethodAvailabilityResult {
  if (
    !PAYMENT_METHODS.includes(input.method) ||
    typeof input.gatewayReady !== "boolean" ||
    typeof input.branchOnlinePaymentEnabled !== "boolean" ||
    !Number.isSafeInteger(input.totalMinor) ||
    input.totalMinor < 0
  )
    throw new DomainValidationError("The availability input is invalid.", [
      {
        path: "input",
        message: "Supply a payment method, readiness flags, and a total.",
      },
    ]);
  if (input.method === "PAY_AT_HOTEL") return { available: true };
  if (!input.gatewayReady)
    return { available: false, reason: "GATEWAY_NOT_READY" };
  if (!input.branchOnlinePaymentEnabled)
    return { available: false, reason: "BRANCH_ONLINE_DISABLED" };
  if (input.totalMinor === 0) return { available: false, reason: "ZERO_TOTAL" };
  return { available: true };
}
