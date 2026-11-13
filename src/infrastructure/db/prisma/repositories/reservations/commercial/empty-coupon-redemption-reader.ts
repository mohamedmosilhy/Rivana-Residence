import "server-only";

import type {
  CouponRedemptionCounts,
  CouponRedemptionReader,
} from "@/application/coupons";

/** M7 has no redemption persistence. M8 replaces this adapter. */
export class EmptyCouponRedemptionReader implements CouponRedemptionReader {
  async count(
    _input: Readonly<{ code: string; phone?: string | undefined }>,
  ): Promise<CouponRedemptionCounts> {
    void _input;
    return { total: 0, forPhone: 0 };
  }
}
