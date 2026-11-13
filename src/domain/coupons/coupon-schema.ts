import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";
import { normalizeCouponCode } from "./coupon-code";

const integer = z.number().int().min(1).max(2_147_483_647);
const amount = z
  .object({ amountMinor: integer, currency: z.literal("USD") })
  .strict();
const fields = {
  kind: z.enum(["PERCENT", "FIXED"]),
  percentBasisPoints: z.number().int().min(1).max(10_000).nullable().optional(),
  amount: amount.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  maxRedemptions: integer.nullable().optional(),
  maxRedemptionsPerPhone: integer.nullable().optional(),
  allBranches: z.boolean(),
  branchIds: z.array(z.string().min(1).max(32)).max(1000),
  active: z.boolean(),
  description: z.string().trim().max(300).nullable().optional(),
};
const createSchema = z
  .object({ code: z.string().max(100), ...fields })
  .strict();
const patchSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    "Supply at least one field.",
  );
export type CouponPatch = z.infer<typeof patchSchema>;
export type CouponInput = Readonly<{
  code: string;
  kind: "PERCENT" | "FIXED";
  percentBasisPoints: number | null;
  amount: Money | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  maxRedemptionsPerPhone: number | null;
  allBranches: boolean;
  branchIds: readonly string[];
  active: boolean;
  description: string | null;
}>;
type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;
const issues = (error: z.ZodError) =>
  issuesFromZod(error.issues).map((issue) => ({
    ...issue,
    path: issue.path || "_root",
  }));

export function parseCouponPatch(input: unknown): Parsed<CouponPatch> {
  const parsed = patchSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: issues(parsed.error) };
}

/** Validates the complete state, including a PATCH merged under the row lock. */
export function parseCouponInput(input: unknown): Parsed<CouponInput> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const value = parsed.data;
  const code = normalizeCouponCode(value.code);
  if (!code.ok)
    return {
      ok: false,
      issues: code.issues.map((issue) => ({ ...issue, path: "code" })),
    };
  const errors: DomainIssue[] = [];
  if (
    value.kind === "PERCENT"
      ? value.percentBasisPoints == null || value.amount != null
      : value.amount == null || value.percentBasisPoints != null
  ) {
    errors.push({
      path: value.kind === "PERCENT" ? "percentBasisPoints" : "amount",
      message: "Supply only the value for this coupon kind.",
    });
  }
  if (
    value.startsAt &&
    value.endsAt &&
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  ) {
    errors.push({ path: "endsAt", message: "End must be after start." });
  }
  if (
    value.allBranches
      ? value.branchIds.length !== 0
      : value.branchIds.length === 0
  ) {
    errors.push({
      path: "branchIds",
      message: "Choose branches, or all branches with an empty list.",
    });
  }
  if (new Set(value.branchIds).size !== value.branchIds.length) {
    errors.push({ path: "branchIds", message: "Choose each branch once." });
  }
  if (errors.length) return { ok: false, issues: errors };
  return {
    ok: true,
    value: {
      code: code.code,
      kind: value.kind,
      percentBasisPoints: value.percentBasisPoints ?? null,
      amount: value.amount ? Money.create(value.amount) : null,
      startsAt: value.startsAt ? new Date(value.startsAt) : null,
      endsAt: value.endsAt ? new Date(value.endsAt) : null,
      maxRedemptions: value.maxRedemptions ?? null,
      maxRedemptionsPerPhone: value.maxRedemptionsPerPhone ?? null,
      allBranches: value.allBranches,
      branchIds: [...value.branchIds].sort(),
      active: value.active,
      description: value.description || null,
    },
  };
}

export function couponInputData(value: CouponInput) {
  return {
    code: value.code,
    kind: value.kind,
    percentBasisPoints: value.percentBasisPoints,
    maxRedemptions: value.maxRedemptions,
    maxRedemptionsPerPhone: value.maxRedemptionsPerPhone,
    allBranches: value.allBranches,
    branchIds: value.branchIds,
    active: value.active,
    description: value.description,
    amount: value.amount
      ? { amountMinor: value.amount.amountMinor, currency: "USD" as const }
      : null,
    startsAt: value.startsAt?.toISOString() ?? null,
    endsAt: value.endsAt?.toISOString() ?? null,
  };
}
