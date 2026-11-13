import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { coupon } from "@/app/api/v1/_dto/coupons";
import { updateCoupon } from "@/composition/api";
import { CouponPatch } from "@/contracts/api/v1/coupons";

export const PATCH = staffRoute(
  { route: "/api/v1/staff/coupons/[id]", body: CouponPatch },
  async ({ staff, params, body }) =>
    toHttp(await updateCoupon(staff, String(params.id), body), {
      ok: (value) => json(200, coupon(value)),
    }),
);
