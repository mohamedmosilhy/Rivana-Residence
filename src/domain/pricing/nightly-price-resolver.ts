import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import type { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";

export type DateRatePeriod = Readonly<{
  id: string;
  range: StayRange;
  amount: Money;
  active: boolean;
  label: string | null;
}>;

export type ResolvedNightPrice = Readonly<{
  night: LocalDate;
  amount: Money | null;
  source: "BASE" | "PERIOD" | null;
  periodId: string | null;
  label: string | null;
}>;

export type NightlyPriceResult =
  | Readonly<{
      priced: true;
      nights: readonly ResolvedNightPrice[];
      accommodationTotal: Money;
    }>
  | Readonly<{
      priced: false;
      nights: readonly ResolvedNightPrice[];
      accommodationTotal: null;
      firstUnpricedNight: LocalDate;
    }>;

const rateAmount = z
  .custom<Money>((value) => value instanceof Money, "Supply a Money value.")
  .refine(
    (amount) => amount.amountMinor > 0,
    "Authored nightly rates must be positive.",
  );
const periodSchema = z
  .object({
    id: z.string().min(1).max(32),
    range: z.custom<StayRange>(
      (value) => value instanceof StayRange,
      "Supply a StayRange value.",
    ),
    amount: rateAmount,
    active: z.boolean(),
    label: z.string().max(80).nullable(),
  })
  .strict();

export class NightlyPriceResolver {
  static resolve(
    input: Readonly<{
      stay: StayRange;
      baseRate: Money | null;
      periods: readonly DateRatePeriod[];
      quantity?: number;
    }>,
  ): NightlyPriceResult {
    const parsed = z
      .object({
        baseRate: rateAmount.nullable(),
        periods: z.array(periodSchema),
        quantity: z.number().int().positive(),
      })
      .safeParse({
        ...input,
        quantity: input.quantity === undefined ? 1 : input.quantity,
      });
    if (!parsed.success) {
      throw new DomainValidationError(
        "The nightly rate input is invalid.",
        issuesFromZod(parsed.error.issues),
      );
    }
    const ids = new Set<string>();
    for (const period of parsed.data.periods) {
      if (ids.has(period.id)) {
        throw new DomainValidationError(
          "Rate period identities must be unique.",
          [{ path: "periods", message: "Supply each period once." }],
        );
      }
      ids.add(period.id);
    }
    const active = parsed.data.periods
      .filter((period) => period.active)
      .sort((left, right) => left.range.checkIn.compare(right.range.checkIn));
    let previous: DateRatePeriod | undefined;
    for (const period of active) {
      if (previous?.range.overlaps(period.range)) {
        throw new DomainValidationError(
          "Active nightly rate periods overlap.",
          [{ path: "periods", message: "Active periods must not overlap." }],
        );
      }
      previous = period;
    }

    const nights = Object.freeze(
      Array.from(input.stay.nights(), (night): ResolvedNightPrice => {
        const period = active.find(
          (candidate) =>
            candidate.range.checkIn.compare(night) <= 0 &&
            night.compare(candidate.range.checkOut) < 0,
        );
        const amount = period?.amount ?? parsed.data.baseRate;
        return Object.freeze({
          night,
          amount,
          source: period ? "PERIOD" : amount ? "BASE" : null,
          periodId: period?.id ?? null,
          label: period?.label ?? null,
        });
      }),
    );
    const unpriced = nights.find((night) => night.amount === null);
    if (unpriced) {
      return Object.freeze({
        priced: false,
        nights,
        accommodationTotal: null,
        firstUnpricedNight: unpriced.night,
      });
    }
    let total = Money.create({ amountMinor: 0, currency: "USD" });
    for (const night of nights) {
      if (night.amount !== null) total = total.add(night.amount);
    }
    return Object.freeze({
      priced: true,
      nights,
      accommodationTotal: total.multiply(parsed.data.quantity),
    });
  }
}
