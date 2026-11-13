import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";

/** 100% in basis points. The rate is never null (Q-05 amended 2026-11-11). */
export const VAT_RATE_MAX_BASIS_POINTS = 10_000;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

export type CommercialSettingsInput = Readonly<{
  vatRateBasisPoints: number;
}>;

const settingsSchema = z
  .object({
    vatRateBasisPoints: z
      .number("Enter the VAT rate in basis points.")
      .int("Use a whole number of basis points.")
      .min(0, "The VAT rate cannot be below 0%.")
      .max(VAT_RATE_MAX_BASIS_POINTS, "The VAT rate cannot be above 100%."),
  })
  .strict();

/** The staff body of API-A5 `PUT`: an integer from 0 to 10000 (0% to 100%). */
export function parseCommercialSettingsInput(
  input: unknown,
): Parsed<CommercialSettingsInput> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: issuesFromZod(parsed.error.issues).map((issue) =>
        issue.path === "" ? { ...issue, path: "_root" } : issue,
      ),
    };
  }
  return { ok: true, value: parsed.data };
}
