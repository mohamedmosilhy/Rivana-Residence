import { z } from "zod";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string({ error: "Enter a web address." })
  .trim()
  .min(1, "Enter a web address.")
  .max(120, "Use 120 characters or fewer.")
  .regex(
    SLUG_PATTERN,
    "Use lowercase letters, numbers, and single hyphens, e.g. nile-suite.",
  );

/** Suggests a slug from a display name, e.g. "Nile Suite" → "nile-suite". */
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}
