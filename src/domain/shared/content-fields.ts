import { z } from "zod";

export function requiredText(label: string, max: number) {
  return z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Use ${max} characters or fewer.`);
}

export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .nullable()
    .default(null)
    .transform((value) => (value === "" ? null : value));
}

// Search-result fields shared by rooms, facilities, and pages. Blank means
// "fall back to the default" from site settings.
export const seoFields = {
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
};
