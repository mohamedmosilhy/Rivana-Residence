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
  | "VALIDATION"
  | "WHATSAPP_NOT_CONFIGURED"
  | "WHATSAPP_TEST_FAILED"
  | "PHONE_BLOCKED"
  | "VERIFICATION_CODE_INVALID"
  | "VERIFICATION_EXPIRED"
  | "VERIFICATION_UNAVAILABLE"
  | "PHONE_NOT_VERIFIED"
  | "BOOKING_LIMIT_REACHED"
  | "BRANCH_NOT_BOOKABLE"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PRICE_CHANGED";

type StandardApplicationErrorCode = Exclude<
  ApplicationErrorCode,
  | "INVENTORY_UNAVAILABLE"
  | "COUPON_INVALID"
  | "SERVICE_UNAVAILABLE"
  | "VERIFICATION_CODE_INVALID"
  | "PRICE_CHANGED"
  | "BRANCH_NOT_BOOKABLE"
>;

export type BranchNotBookableReason =
  | "ONLINE_BOOKING_DISABLED"
  | "CHECK_IN_TIME_MISSING"
  | "WHATSAPP_NOT_CONFIGURED";

export type BranchNotBookableError = Readonly<{
  code: "BRANCH_NOT_BOOKABLE";
  message: string;
  context: Readonly<{ reason: BranchNotBookableReason }>;
  fieldErrors?: never;
}>;

type StandardApplicationError = Readonly<{
  code: StandardApplicationErrorCode;
  message: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  context?: never;
  /** For 429 and 503: when the caller may try again (`Retry-After`). */
  retryAfterSeconds?: number;
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

/**
 * The server's current quote, so the client can show the new total. Typed
 * structurally so `shared` never imports a feature module; the quote view of
 * `application/quotes` satisfies it.
 */
export type PriceChangedQuote = Readonly<
  { totalMinor: number } & Record<string, unknown>
>;
export type PriceChangedError = Readonly<{
  code: "PRICE_CHANGED";
  message: string;
  context: Readonly<{ quote: PriceChangedQuote }>;
  fieldErrors?: never;
}>;

export type ApplicationError =
  | StandardApplicationError
  | BranchNotBookableError
  | PriceChangedError
  | InventoryUnavailableError
  | CouponInvalidError
  | ServiceUnavailableError
  | Readonly<{
      code: "VERIFICATION_CODE_INVALID";
      message: string;
      context: Readonly<{ attemptsLeft: number }>;
      fieldErrors?: never;
    }>;

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

/** A limiter refusal that tells the caller when the window reopens. */
export function rateLimited(
  message: string,
  retryAfterSeconds: number,
): Result<never> {
  return {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
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

export function priceChanged(quote: PriceChangedQuote): Result<never> {
  return {
    ok: false,
    error: {
      code: "PRICE_CHANGED",
      message: "The price changed. Review the new total.",
      context: { quote },
    },
  };
}

export function branchNotBookable(
  reason: BranchNotBookableReason,
): Result<never> {
  return {
    ok: false,
    error: {
      code: "BRANCH_NOT_BOOKABLE",
      message: "This branch cannot take online bookings right now.",
      context: { reason },
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
