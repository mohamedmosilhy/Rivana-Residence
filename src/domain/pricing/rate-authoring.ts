import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";

export const RATE_LABEL_MAX = 80;
export const RATE_AMOUNT_MAX_MINOR = 2_147_483_647;
export const RATE_READ_WINDOW_MAX_NIGHTS = 62;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine((value) => {
    try {
      LocalDate.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Use a real calendar date.");

const amount = z
  .object({
    amountMinor: z
      .number()
      .int()
      .min(1, "Enter a positive nightly amount.")
      .max(RATE_AMOUNT_MAX_MINOR, "The nightly amount is too large."),
    currency: z.literal("USD"),
  })
  .strict();

const label = z
  .string()
  .trim()
  .max(RATE_LABEL_MAX, `Use at most ${RATE_LABEL_MAX} characters.`)
  .nullable()
  .transform((value) => (value === "" ? null : value));

const periodInput = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    amount,
    label: label.optional(),
  })
  .strict();

const periodPatch = z
  .object({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    amount: amount.optional(),
    label: label.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate !== undefined ||
      value.endDate !== undefined ||
      value.amount !== undefined ||
      value.label !== undefined ||
      value.active !== undefined,
    { message: "Change at least one field." },
  );

export type RatePeriodInput = Readonly<{
  range: StayRange;
  amount: Money;
  label: string | null;
}>;

export type RatePeriodPatch = Readonly<{
  startDate?: LocalDate;
  endDate?: LocalDate;
  amount?: Money;
  label?: string | null;
  active?: boolean;
}>;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

function issues(error: z.ZodError): readonly DomainIssue[] {
  return issuesFromZod(error.issues).map((issue) =>
    issue.path === "" ? { ...issue, path: "_root" } : issue,
  );
}

function parsedRange(startDate: string, endDate: string): Parsed<StayRange> {
  const start = LocalDate.parse(startDate);
  const end = LocalDate.parse(endDate);
  if (end.compare(start) <= 0) {
    return {
      ok: false,
      issues: [{ path: "endDate", message: "End must be after the start." }],
    };
  }
  return { ok: true, value: StayRange.create(start, end) };
}

export function parseBaseRateInput(input: unknown): Parsed<Money> {
  const parsed = z.object({ amount }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  return { ok: true, value: Money.create(parsed.data.amount) };
}

export function parseRatePeriodInput(input: unknown): Parsed<RatePeriodInput> {
  const parsed = periodInput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const range = parsedRange(parsed.data.startDate, parsed.data.endDate);
  if (!range.ok) return range;
  return {
    ok: true,
    value: {
      range: range.value,
      amount: Money.create(parsed.data.amount),
      label: parsed.data.label ?? null,
    },
  };
}

export function parseRatePeriodPatch(input: unknown): Parsed<RatePeriodPatch> {
  const parsed = periodPatch.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  return {
    ok: true,
    value: {
      ...(parsed.data.startDate !== undefined
        ? { startDate: LocalDate.parse(parsed.data.startDate) }
        : {}),
      ...(parsed.data.endDate !== undefined
        ? { endDate: LocalDate.parse(parsed.data.endDate) }
        : {}),
      ...(parsed.data.amount !== undefined
        ? { amount: Money.create(parsed.data.amount) }
        : {}),
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.active !== undefined
        ? { active: parsed.data.active }
        : {}),
    },
  };
}

export function mergeRatePeriodRange(
  current: StayRange,
  patch: RatePeriodPatch,
): Parsed<StayRange> {
  const start = patch.startDate ?? current.checkIn;
  const end = patch.endDate ?? current.checkOut;
  if (end.compare(start) <= 0) {
    return {
      ok: false,
      issues: [{ path: "endDate", message: "End must be after the start." }],
    };
  }
  return { ok: true, value: StayRange.create(start, end) };
}

export function parseRateReadWindow(input: unknown): Parsed<StayRange> {
  const parsed = z
    .object({ from: isoDate, to: isoDate })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const range = parsedRange(parsed.data.from, parsed.data.to);
  if (!range.ok) {
    return {
      ok: false,
      issues: range.issues.map((issue) => ({ ...issue, path: "to" })),
    };
  }
  if (range.value.nightCount > RATE_READ_WINDOW_MAX_NIGHTS) {
    return {
      ok: false,
      issues: [
        {
          path: "to",
          message: `Choose at most ${RATE_READ_WINDOW_MAX_NIGHTS} nights.`,
        },
      ],
    };
  }
  return range;
}
