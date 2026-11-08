import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import type { StayRange } from "@/domain/shared/stay-range";

export type NightInventory = Readonly<{
  night: LocalDate;
  capacity: number;
  sold: number;
}>;

export type NightAvailability = NightInventory & Readonly<{ free: number }>;

export type AvailabilityResult =
  | Readonly<{ available: true; nights: readonly NightAvailability[] }>
  | Readonly<{
      available: false;
      firstUnavailableNight: LocalDate;
      nights: readonly NightAvailability[];
    }>;

const countsSchema = z.object({
  capacity: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
});
const quantitySchema = z.number().int().positive();

/** Shared within this module; callers outside inventory use index.ts. */
export function inventoryByNight(
  nights: readonly NightInventory[],
): ReadonlyMap<string, NightInventory> {
  const indexed = new Map<string, NightInventory>();
  for (const [index, row] of nights.entries()) {
    const parsed = countsSchema.safeParse(row);
    if (!parsed.success) {
      throw new DomainValidationError(
        "Inventory counts must be nonnegative safe integers.",
        issuesFromZod(parsed.error.issues).map((issue) => ({
          ...issue,
          path: `nights.${index}.${issue.path}`,
        })),
      );
    }
    if (!(row.night instanceof LocalDate) || indexed.has(row.night.value)) {
      throw new DomainValidationError(
        "Inventory dates must be valid and unique.",
        [
          {
            path: `nights.${index}.night`,
            message: "Supply each calendar date once.",
          },
        ],
      );
    }
    indexed.set(
      row.night.value,
      Object.freeze({ night: row.night, ...parsed.data }),
    );
  }
  return indexed;
}

export class AvailabilityCalculator {
  static check(
    input: Readonly<{
      stay: StayRange;
      quantity: number;
      nights: readonly NightInventory[];
    }>,
  ): AvailabilityResult {
    const quantity = quantitySchema.safeParse(input.quantity);
    if (!quantity.success) {
      throw new DomainValidationError("The requested quantity is invalid.", [
        {
          path: "quantity",
          message: "Request a positive safe integer quantity.",
        },
      ]);
    }
    const indexed = inventoryByNight(input.nights);
    const nights = Object.freeze(
      Array.from(input.stay.nights(), (night): NightAvailability => {
        const counts = indexed.get(night.value);
        const capacity = counts?.capacity ?? 0;
        const sold = counts?.sold ?? 0;
        return Object.freeze({ night, capacity, sold, free: capacity - sold });
      }),
    );
    const firstFull = nights.find((night) => night.free < quantity.data);
    return firstFull
      ? Object.freeze({
          available: false,
          firstUnavailableNight: firstFull.night,
          nights,
        })
      : Object.freeze({ available: true, nights });
  }
}
