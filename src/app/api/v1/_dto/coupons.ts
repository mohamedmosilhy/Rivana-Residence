import type { ManagedCoupon } from "@/application/coupons";
import type { CouponDto } from "@/contracts/api/v1/coupons";

export function coupon(value: ManagedCoupon): CouponDto {
  return {
    id: value.id,
    code: value.code,
    kind: value.kind,
    percentBasisPoints: value.percentBasisPoints,
    amount: value.amount
      ? { amountMinor: value.amount.amountMinor, currency: "USD" }
      : null,
    startsAt: value.startsAt?.toISOString() ?? null,
    endsAt: value.endsAt?.toISOString() ?? null,
    maxRedemptions: value.maxRedemptions,
    maxRedemptionsPerPhone: value.maxRedemptionsPerPhone,
    allBranches: value.allBranches,
    branchIds: [...value.branchIds],
    active: value.active,
    description: value.description,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    redemptionsTotal: value.redemptionsTotal,
  };
}
