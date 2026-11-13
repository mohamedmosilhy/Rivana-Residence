import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { coupon } from "@/app/api/v1/_dto/coupons";
import { listCoupons, createCoupon } from "@/composition/api";
import { CouponInput, CouponQuery } from "@/contracts/api/v1/coupons";

const ROUTE = "/api/v1/staff/coupons";

export const GET = staffRoute(
  { route: ROUTE, query: CouponQuery },
  async ({ staff, query }) =>
    toHttp(
      await listCoupons(staff, {
        ...query,
        ...(query.active === undefined
          ? {}
          : { active: query.active === "true" }),
        page: query.page === undefined ? 1 : Number(query.page),
      }),
      { ok: (page) => json(200, { ...page, items: page.items.map(coupon) }) },
    ),
);

export const POST = staffRoute(
  { route: ROUTE, body: CouponInput },
  async ({ staff, body }) =>
    toHttp(await createCoupon(staff, body), {
      ok: (value) =>
        json(201, coupon(value), { Location: `${ROUTE}/${value.id}` }),
    }),
);
