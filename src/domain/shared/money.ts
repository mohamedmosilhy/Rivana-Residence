import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";

const moneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("USD"),
  })
  .strict();

/** Integer USD cents. Storage-specific limits belong at persistence boundaries. */
export class Money {
  readonly currency = "USD";

  private constructor(readonly amountMinor: number) {
    Object.freeze(this);
  }

  static create(input: unknown): Money {
    const parsed = moneySchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainValidationError(
        "Enter a nonnegative, safe integer amount in USD cents.",
        issuesFromZod(parsed.error.issues),
      );
    }
    return new Money(parsed.data.amountMinor);
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new DomainValidationError("Amounts must use the same currency.", [
        { path: "currency", message: "Use USD for every amount." },
      ]);
    }
    return Money.create({
      amountMinor: this.amountMinor + other.amountMinor,
      currency: this.currency,
    });
  }

  multiply(quantity: number): Money {
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new DomainValidationError("The quantity is invalid.", [
        {
          path: "quantity",
          message: "Use a nonnegative safe integer quantity.",
        },
      ]);
    }
    return Money.create({
      amountMinor: this.amountMinor * quantity,
      currency: this.currency,
    });
  }
}

/**
 * Integer division rounded half up, for nonnegative values only (ADR 027).
 * The division uses BigInt, so no floating point is involved: 1501.5 becomes
 * 1502 and 3333.3 becomes 3333. Both inputs must already be safe integers;
 * callers that multiply first (the quote calculator) form the product with
 * BigInt and check it before calling.
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    throw new DomainValidationError("The division input is invalid.", [
      {
        path: "division",
        message:
          "Use a nonnegative safe integer numerator and a positive safe integer denominator.",
      },
    ]);
  }
  // The result never exceeds the numerator, so it is always a safe integer.
  return Number(
    (2n * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator)),
  );
}
