import { z } from "zod";

import { isoDate, Money } from "./primitives";

const queryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const authoredAmount = Money.extend({
  amountMinor: z.number().int().min(1).max(2_147_483_647),
});
const label = z.string().trim().max(80).nullable();

export const RateQuery = z
  .object({
    from: queryDate,
    to: queryDate.describe("Exclusive end; at most 62 nights after from."),
  })
  .strict();

export const BaseRateInput = z.object({ amount: authoredAmount }).strict();

export const RatePeriodInput = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    amount: authoredAmount,
    label: label.optional(),
  })
  .strict();

export const RatePeriodPatch = z
  .object({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    amount: authoredAmount.optional(),
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

export const RatePeriod = z.object({
  id: z.string(),
  roomTypeId: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  amount: Money,
  label: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().describe("UTC instant (ISO 8601)."),
  updatedAt: z.string().describe("UTC instant (ISO 8601)."),
});

export const NightPrice = z.object({
  night: isoDate,
  amount: Money.nullable(),
  source: z.enum(["BASE", "PERIOD"]).nullable(),
  periodId: z.string().nullable(),
  label: z.string().nullable(),
});

export const RateCalendar = z.object({
  baseRate: Money.nullable(),
  periods: z.array(RatePeriod),
  calendar: z.array(NightPrice),
});

export type RatePeriodDto = z.infer<typeof RatePeriod>;
export type NightPriceDto = z.infer<typeof NightPrice>;
