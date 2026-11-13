import type { BranchScope } from "@/application/auth/authorize-branch";
import type { Result } from "@/application/shared/result";
import type { CouponInput } from "@/domain/coupons";

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
