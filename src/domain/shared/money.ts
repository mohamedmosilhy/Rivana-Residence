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
