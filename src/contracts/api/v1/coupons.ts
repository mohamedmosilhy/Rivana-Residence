import { z } from "zod";
import { Money } from "./primitives";

const integer = z.number().int().min(1).max(2_147_483_647);
const fields = {
  kind: z.enum(["PERCENT", "FIXED"]),
  percentBasisPoints: z.number().int().min(1).max(10_000).nullable().optional(),
  amount: Money.extend({ amountMinor: integer }).nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  maxRedemptions: integer.nullable().optional(),
  maxRedemptionsPerPhone: integer.nullable().optional(),
  allBranches: z.boolean(),
  branchIds: z.array(z.string().min(1).max(32)).max(1000),
  active: z.boolean(),
  description: z.string().trim().max(300).nullable().optional(),
};
export const CouponInput = z
  .object({ code: z.string().max(100), ...fields })
  .strict();
export const CouponPatch = z.object(fields).partial().strict();
export const CouponQuery = z
  .object({
    branchId: z.string().min(1).max(32).optional(),
    active: z.enum(["true", "false"]).optional(),
    q: z.string().max(32).optional(),
    page: z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .optional(),
  })
  .strict();
export const Coupon = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(["PERCENT", "FIXED"]),
  percentBasisPoints: z.number().int().nullable(),
  amount: Money.nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  maxRedemptions: z.number().int().nullable(),
  maxRedemptionsPerPhone: z.number().int().nullable(),
  allBranches: z.boolean(),
  branchIds: z.array(z.string()),
  active: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  redemptionsTotal: z.number().int().nonnegative(),
});
export const CouponList = z.object({
  items: z.array(Coupon),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type CouponDto = z.infer<typeof Coupon>;
