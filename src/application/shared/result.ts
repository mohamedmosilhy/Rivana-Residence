import type { CouponRefusal } from "@/domain/coupons";
import type {
  DomainIssue,
  DomainValidationError,
} from "@/domain/shared/domain-error";

export type ApplicationErrorCode =
  | "CONFLICT"
  | "COUPON_INVALID"
  | "FORBIDDEN"
  | "INVENTORY_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "NOT_FOUND"
  | "NOT_PUBLISHABLE"
  | "REFERENCED"
  | "SERVICE_UNAVAILABLE"
  | "TRY_AGAIN"
  | "VALIDATION";

type StandardApplicationErrorCode = Exclude<
  ApplicationErrorCode,
  "INVENTORY_UNAVAILABLE" | "COUPON_INVALID" | "SERVICE_UNAVAILABLE"
>;

type StandardApplicationError = Readonly<{
  code: StandardApplicationErrorCode;
  message: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  context?: never;
}>;

export type InventoryUnavailableError = Readonly<{
  code: "INVENTORY_UNAVAILABLE";
  message: string;
  context: Readonly<{
    firstUnavailableNight: string;
    roomTypeId: string;
  }>;
  fieldErrors?: never;
}>;

/** One message for every refusal; only `context.reason` tells them apart. */
export type CouponInvalidError = Readonly<{
  code: "COUPON_INVALID";
  message: string;
  context: Readonly<{ reason: CouponRefusal }>;
  fieldErrors: Readonly<Record<string, readonly string[]>>;
}>;

export type ServiceUnavailableError = Readonly<{
  code: "SERVICE_UNAVAILABLE";
  message: string;
  context: Readonly<{ kind: string }>;
  fieldErrors?: never;
}>;

export type ApplicationError =
  | StandardApplicationError
  | InventoryUnavailableError
  | CouponInvalidError
  | ServiceUnavailableError;

export type Result<T, E = ApplicationError> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

export function success<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure(
  code: StandardApplicationErrorCode,
  message: string,
  fieldErrors?: Readonly<Record<string, readonly string[]>>,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

export function inventoryUnavailable(
  roomTypeId: string,
  firstUnavailableNight: string,
): Result<never> {
  return {
    ok: false,
    error: {
      code: "INVENTORY_UNAVAILABLE",
      message: "The requested inventory is no longer available.",
      context: { firstUnavailableNight, roomTypeId },
    },
  };
}

const COUPON_MESSAGE = "This coupon code cannot be used for this booking.";

export function couponInvalid(reason: CouponRefusal): Result<never> {
  return {
    ok: false,
    error: {
      code: "COUPON_INVALID",
      message: COUPON_MESSAGE,
      context: { reason },
      fieldErrors: { couponCode: [COUPON_MESSAGE] },
    },
  };
}

export function serviceUnavailable(kind: string): Result<never> {
  return {
    ok: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "This service is not available at this branch.",
      context: { kind },
    },
  };
}

function groupIssues(issues: readonly DomainIssue[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    (fieldErrors[issue.path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function notPublishable(error: DomainValidationError): Result<never> {
  return failure("NOT_PUBLISHABLE", error.message, groupIssues(error.issues));
}

export function invalid(
  message: string,
  issues: readonly DomainIssue[],
): Result<never> {
  return failure("VALIDATION", message, groupIssues(issues));
}
