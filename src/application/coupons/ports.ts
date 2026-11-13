import type { BranchScope } from "@/application/auth/authorize-branch";
import type { Result } from "@/application/shared/result";
import type { CouponInput, CouponRecord } from "@/domain/coupons";

export type ManagedCoupon = CouponInput &
  Readonly<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    redemptionsTotal: number;
  }>;
export type CouponQuery = Readonly<{
  branchId?: string | undefined;
  active?: boolean | undefined;
  q?: string | undefined;
  page: number;
}>;
export type CouponPage = Readonly<{
  items: readonly ManagedCoupon[];
  page: number;
  pageSize: number;
  total: number;
}>;
export interface CouponRepository {
  list(scope: BranchScope, query: CouponQuery): Promise<CouponPage>;
  branchesExist(ids: readonly string[]): Promise<boolean>;
  create(
    id: string,
    input: CouponInput,
    actorId: string,
    now: Date,
  ): Promise<Result<ManagedCoupon>>;
  /** Transaction only. Lock the parent before reading it and its branch joins. */
  lock(id: string): Promise<Result<ManagedCoupon | null>>;
  replace(
    id: string,
    input: CouponInput,
    actorId: string,
    now: Date,
  ): Promise<ManagedCoupon>;
}

/** Public lookup for quotes (API-P6): one coupon by its normalized code. */
export interface CouponLookup {
  /**
   * Matches the upper case code exactly and returns it with its branch ids
   * read in one statement, or null. Never lists or counts other coupons.
   */
  findByCode(code: string): Promise<CouponRecord | null>;
}

export type CouponRedemptionCounts = Readonly<{
  total: number;
  forPhone: number;
}>;

/**
 * How often a coupon was redeemed, overall and by one verified phone. M7
 * supplies a zero adapter; M8 replaces it with persisted redemptions.
 */
export interface CouponRedemptionReader {
  count(
    input: Readonly<{ code: string; phone?: string | undefined }>,
  ): Promise<CouponRedemptionCounts>;
}
