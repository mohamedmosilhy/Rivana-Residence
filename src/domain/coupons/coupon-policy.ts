import {
  DomainValidationError,
  type DomainIssue,
} from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";

export const COUPON_REFUSALS = [
  "NOT_FOUND",
  "INACTIVE",
  "NOT_YET_VALID",
  "EXPIRED",
  "WRONG_BRANCH",
  "LIMIT_REACHED",
  "PHONE_LIMIT_REACHED",
] as const;
export type CouponRefusal = (typeof COUPON_REFUSALS)[number];

export type CouponRecord = Readonly<{
  code: string;
  kind: "PERCENT" | "FIXED";
  percentBasisPoints: number | null;
  amount: Money | null;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxRedemptionsPerPhone: number | null;
  allBranches: boolean;
  branchIds: readonly string[];
}>;

export type CouponContext = Readonly<{
  branchId: string;
  /** A verified phone, when the guest has one. Never matched here. */
  phone?: string | undefined;
  now: Date;
  redemptionsTotal: number;
  redemptionsForPhone: number;
}>;

/** The same shape `QuoteCalculator` accepts. */
export type CouponValue =
  | Readonly<{ kind: "PERCENT"; percentBasisPoints: number }>
  | Readonly<{ kind: "FIXED"; amount: Money }>;

export type CouponValidation =
  | Readonly<{ valid: true; value: CouponValue }>
  | Readonly<{ valid: false; reason: CouponRefusal }>;

function corrupt(path: string, message: string): never {
  const issue: DomainIssue = { path, message };
  throw new DomainValidationError("The coupon input is invalid.", [issue]);
}

const validDate = (value: Date | null) =>
  value === null || (value instanceof Date && !Number.isNaN(value.getTime()));
const validLimit = (value: number | null) =>
  value === null || (Number.isSafeInteger(value) && value >= 1);
const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

/**
 * Coupon validation (CP-1, CP-7). Pure: counts and the clock instant are
 * supplied. Checks stop at the first failure in the fixed order of the
 * `COUPON_REFUSALS` list. A corrupt record or context throws instead of
 * granting a discount.
 */
export class CouponPolicy {
  static validate(
    coupon: CouponRecord | null,
    context: CouponContext,
  ): CouponValidation {
    if (!(context.now instanceof Date) || Number.isNaN(context.now.getTime()))
      corrupt("now", "Supply a valid instant.");
    if (!validCount(context.redemptionsTotal))
      corrupt("redemptionsTotal", "Use a nonnegative safe integer.");
    if (!validCount(context.redemptionsForPhone))
      corrupt("redemptionsForPhone", "Use a nonnegative safe integer.");
    if (
      context.phone !== undefined &&
      (typeof context.phone !== "string" || context.phone.trim() === "")
    )
      corrupt("phone", "Supply a phone number or none.");
    if (coupon === null) return { valid: false, reason: "NOT_FOUND" };

    if (typeof coupon.active !== "boolean")
      corrupt("active", "Use true or false.");
    if (typeof coupon.allBranches !== "boolean")
      corrupt("allBranches", "Use true or false.");
    if (
      !Array.isArray(coupon.branchIds) ||
      coupon.branchIds.some((id) => typeof id !== "string")
    )
      corrupt("branchIds", "Use a list of branch ids.");

    if (!validDate(coupon.startsAt) || !validDate(coupon.endsAt))
      corrupt("window", "Use valid start and end instants.");
    if (!validLimit(coupon.maxRedemptions))
      corrupt("maxRedemptions", "Use at least 1 or no limit.");
    if (!validLimit(coupon.maxRedemptionsPerPhone))
      corrupt("maxRedemptionsPerPhone", "Use at least 1 or no limit.");
    let value: CouponValue;
    if (coupon.kind === "PERCENT") {
      const bp = coupon.percentBasisPoints;
      if (
        bp === null ||
        !Number.isSafeInteger(bp) ||
        bp < 1 ||
        bp > 10_000 ||
        coupon.amount !== null
      )
        corrupt("percentBasisPoints", "A percent coupon needs 1 to 10000.");
      value = { kind: "PERCENT", percentBasisPoints: bp };
    } else if (coupon.kind === "FIXED") {
      if (
        coupon.amount === null ||
        coupon.amount.amountMinor < 1 ||
        coupon.percentBasisPoints !== null
      )
        corrupt("amount", "A fixed coupon needs a positive amount.");
      value = { kind: "FIXED", amount: coupon.amount };
    } else {
      corrupt("kind", "Use PERCENT or FIXED.");
    }

    if (!coupon.active) return { valid: false, reason: "INACTIVE" };
    const now = context.now.getTime();
    if (coupon.startsAt && now < coupon.startsAt.getTime())
      return { valid: false, reason: "NOT_YET_VALID" };
    if (coupon.endsAt && now >= coupon.endsAt.getTime())
      return { valid: false, reason: "EXPIRED" };
    if (!coupon.allBranches && !coupon.branchIds.includes(context.branchId))
      return { valid: false, reason: "WRONG_BRANCH" };
    if (
      coupon.maxRedemptions !== null &&
      context.redemptionsTotal >= coupon.maxRedemptions
    )
      return { valid: false, reason: "LIMIT_REACHED" };
    if (
      context.phone !== undefined &&
      coupon.maxRedemptionsPerPhone !== null &&
      context.redemptionsForPhone >= coupon.maxRedemptionsPerPhone
    )
      return { valid: false, reason: "PHONE_LIMIT_REACHED" };
    return { valid: true, value };
  }
}
