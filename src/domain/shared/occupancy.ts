import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";

const occupancySchema = z
  .object({
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
  })
  .strict();

export class Occupancy {
  private constructor(
    readonly adults: number,
    readonly children: number,
  ) {
    Object.freeze(this);
  }

  static create(input: unknown): Occupancy {
    const parsed = occupancySchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainValidationError(
        "Enter valid occupancy counts for one unit.",
        issuesFromZod(parsed.error.issues),
      );
    }
    return new Occupancy(parsed.data.adults, parsed.data.children);
  }

  fits(limits: Readonly<{ maxAdults: number; maxChildren: number }>): boolean {
    return (
      this.adults <= limits.maxAdults && this.children <= limits.maxChildren
    );
  }
}
