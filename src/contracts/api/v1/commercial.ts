import { z } from "zod";

import { Money } from "./primitives";

const authoredAmount = Money.extend({
  amountMinor: z.number().int().min(1).max(2_147_483_647),
});

export const SERVICE_KIND_VALUES = ["BREAKFAST", "AIRPORT_TRANSFER"] as const;
export const SERVICE_PRICE_UNIT_VALUES = [
  "PER_BOOKING",
  "PER_NIGHT",
  "PER_PERSON",
  "PER_PERSON_PER_NIGHT",
] as const;

export const ServiceOfferingInput = z
  .object({
    priceUnit: z.enum(SERVICE_PRICE_UNIT_VALUES),
    price: authoredAmount.describe("The adult price."),
    childPrice: authoredAmount
      .nullable()
      .optional()
      .describe("Only for the per person units."),
    active: z.boolean(),
    description: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export const ServiceOffering = z.object({
  kind: z.enum(SERVICE_KIND_VALUES),
  priceUnit: z.enum(SERVICE_PRICE_UNIT_VALUES).nullable(),
  price: Money.nullable(),
  childPrice: Money.nullable(),
  active: z.boolean(),
  description: z.string().nullable(),
  updatedAt: z.string().nullable().describe("UTC instant (ISO 8601)."),
});

export const ServiceOfferingList = z.object({
  items: z
    .array(ServiceOffering)
    .describe("Both kinds; a kind with no offering is inactive with no price."),
});

export const CommercialSettingsInput = z
  .object({
    vatRateBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .describe("VAT in basis points: 1500 is 15%. 0 to 10000."),
  })
  .strict();

export const CommercialSettings = z.object({
  vatRateBasisPoints: z.number().int(),
  updatedAt: z.string().describe("UTC instant (ISO 8601)."),
});

export type ServiceOfferingDto = z.infer<typeof ServiceOffering>;
