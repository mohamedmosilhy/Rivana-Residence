import { type DomainIssue } from "@/domain/shared/domain-error";

export const COUPON_CODE_MAX = 32;

// Letters, digits, hyphen and underscore, 3 to 32 characters, after upper
// casing. The column is VARCHAR(32) and uniqueness is on upper(code).
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export type CouponCodeResult =
  | Readonly<{ ok: true; code: string }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

/**
 * The one normal form of a coupon code (Q-57: codes are case insensitive):
 * trimmed and upper cased with ASCII rules only, so lookup, storage, and
 * uniqueness agree. Anything outside the allowlist is refused.
 */
export function normalizeCouponCode(raw: unknown): CouponCodeResult {
  if (typeof raw !== "string") {
    return {
      ok: false,
      issues: [{ path: "couponCode", message: "Enter the code as text." }],
    };
  }
  const code = raw.trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
  if (!COUPON_CODE_PATTERN.test(code)) {
    return {
      ok: false,
      issues: [
        {
          path: "couponCode",
          message: `Use 3 to ${COUPON_CODE_MAX} letters, numbers, hyphens, or underscores.`,
        },
      ],
    };
  }
  return { ok: true, code };
}
