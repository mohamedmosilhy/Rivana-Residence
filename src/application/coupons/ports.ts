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

/** Booking transaction writes. Lock the coupon before counting its redemptions (CP-1). */
export interface CouponRedemptionStore {
  /** Transaction only. Locks the coupon row by normalized code; null when it does not exist. */
  lockByCode(code: string): Promise<Result<string | null>>;
  /** One redemption per reservation; the phone is the verified booking phone. */
  record(
    input: Readonly<{
      couponId: string;
      reservationId: string;
      phone: string | null;
      at: Date;
    }>,
  ): Promise<void>;
  /**
   * Frees the reservation's redemption (CP-2). Idempotent: a redemption that
   * is already released, or none at all, changes nothing. Runs in the
   * transaction of the cancellation.
   */
  release(reservationId: string, at: Date): Promise<void>;
}
