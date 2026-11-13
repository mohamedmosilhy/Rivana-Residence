import { z } from "zod";

import {
  isMapEmbedUrl,
  MAP_EMBED_MESSAGE,
  PHONE_MESSAGE,
  PHONE_PATTERN,
} from "@/domain/settings/site-settings";
import { SLUG_PATTERN } from "@/domain/shared/slug";
import { isValidTimeZone } from "@/domain/shared/zoned-time";

export const BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/**
 * Top-level route segments a branch slug may never take, because branch
 * sites live at `/{branchSlug}/…` (ADR 026). Kept in step with the
 * `Branch_slug_check` constraint in the database. Legacy `*.html` paths are
 * refused separately.
 */
export const RESERVED_BRANCH_SLUGS = [
  "admin",
  "api",
  "media",
  "reservations",
  "book",
  "sitemap.xml",
  "robots.txt",
  // Old public paths that redirect permanently to the default branch (M5).
  "about",
  "contact",
  "rooms",
  "facilities",
] as const;

export function isReservedBranchSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  return (
    (RESERVED_BRANCH_SLUGS as readonly string[]).includes(normalized) ||
    normalized.endsWith(".html")
  );
}

const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function optionalText(max: number) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(max, `Use ${max} characters or fewer.`)
      .nullable()
      .default(null),
  );
}

function optionalTime(label: string) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(TIME_OF_DAY, `Enter the ${label} as HH:MM, e.g. 14:00.`)
      .nullable()
      .default(null),
  );
}

// Rounded to the column scale (DECIMAL(9,6)), so an unchanged form never
// reads as a change against the stored value.
function optionalCoordinate(limit: number, label: string) {
  return z.preprocess(
    (value) => {
      const normalized = blankToNull(value);
      const number =
        typeof normalized === "string" ? Number(normalized) : normalized;
      return typeof number === "number" && Number.isFinite(number)
        ? Math.round(number * 1e6) / 1e6
        : number;
    },
    z
      .number({ error: `Enter the ${label} as a number.` })
      .min(-limit, `${label} must be between -${limit} and ${limit}.`)
      .max(limit, `${label} must be between -${limit} and ${limit}.`)
      .nullable()
      .default(null),
  );
}

export const branchSlugSchema = z
  .string({ error: "Enter a web address." })
  .trim()
  .min(1, "Enter a web address.")
  .max(80, "Use 80 characters or fewer.")
  .refine(
    (value) => !isReservedBranchSlug(value),
    "This web address is reserved for the website. Choose another.",
  )
  .refine(
    (value) => SLUG_PATTERN.test(value),
    "Use lowercase letters, numbers, and single hyphens, e.g. new-cairo.",
  );

const branchFields = z.object({
  slug: branchSlugSchema,
  name: z
    .string({ error: "Enter the branch name." })
    .trim()
    .min(1, "Enter the branch name.")
    .max(120, "Use 120 characters or fewer."),
  summary: optionalText(300),
  status: z.enum(BRANCH_STATUSES).default("ACTIVE"),
  timeZone: z
    .string()
    .trim()
    .default("Africa/Cairo")
    .refine(isValidTimeZone, "Choose a valid time zone, e.g. Africa/Cairo."),
  phone: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(40, "Use 40 characters or fewer.")
      .regex(PHONE_PATTERN, PHONE_MESSAGE)
      .nullable()
      .default(null),
  ),
  email: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .pipe(
        z
          .email("Enter a valid email address.")
          .max(320, "Use 320 characters or fewer."),
      )
      .nullable()
      .default(null),
  ),
  addressLine1: optionalText(180),
  addressLine2: optionalText(180),
  city: optionalText(100),
  country: optionalText(100),
  latitude: optionalCoordinate(90, "Latitude"),
  longitude: optionalCoordinate(180, "Longitude"),
  mapEmbedUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(2048, "Use 2048 characters or fewer.")
      .refine(isMapEmbedUrl, MAP_EMBED_MESSAGE)
      .nullable()
      .default(null),
  ),
  checkInTime: optionalTime("check-in time"),
  checkOutTime: optionalTime("check-out time"),
  syncReminderIntervalMinutes: z
    .number({ error: "Enter the reminder interval in minutes." })
    .int("Use whole minutes.")
    .min(10, "Use between 10 and 240 minutes.")
    .max(240, "Use between 10 and 240 minutes.")
    .default(30),
  syncFollowUpMinutes: z
    .number({ error: "Enter the follow-up delay in minutes." })
    .int("Use whole minutes.")
    .min(5, "Use between 5 and 60 minutes.")
    .max(60, "Use between 5 and 60 minutes.")
    .default(10),
});

type CrossFieldValues = Readonly<{
  syncFollowUpMinutes: number;
  syncReminderIntervalMinutes: number;
  latitude: number | null;
  longitude: number | null;
}>;

/** Rules that span two fields; also run on a merged patch by the use case. */
export function branchCrossFieldIssues(branch: CrossFieldValues) {
  const issues: { path: string; message: string }[] = [];
  if (branch.syncFollowUpMinutes >= branch.syncReminderIntervalMinutes) {
    issues.push({
      path: "syncFollowUpMinutes",
      message: "The follow-up delay must be shorter than the interval.",
    });
  }
  if ((branch.latitude === null) !== (branch.longitude === null)) {
    issues.push({
      path: branch.latitude === null ? "latitude" : "longitude",
      message: "Enter both latitude and longitude, or leave both empty.",
    });
  }
  return issues;
}

function crossFieldRules(branch: CrossFieldValues, context: z.RefinementCtx) {
  for (const issue of branchCrossFieldIssues(branch)) {
    context.addIssue({
      code: "custom",
      path: [issue.path],
      message: issue.message,
    });
  }
}

/**
 * The editable attributes of a branch (docs/domain/branch-model.md). The
 * database enforces the same slug, time, and sync rules with CHECK
 * constraints; this schema gives staff friendly messages first.
 */
export const branchSchema = branchFields.superRefine(crossFieldRules);

export const ONLINE_BOOKING_NOT_READY_MESSAGE =
  "Online booking can't be turned on yet. It needs WhatsApp messaging and the booking journey, which arrive in later releases.";

/** Optional whole number from a form string or a JSON number. */
const sortOrderField = z.preprocess(
  (value) => {
    const normalized = blankToNull(value);
    return typeof normalized === "string" ? Number(normalized) : normalized;
  },
  z
    .number({ error: "Enter the display order as a whole number." })
    .int("Use a whole number.")
    .min(0, "Use 0 or more.")
    .max(9999, "Use 9999 or less."),
);

// M5 additions shared by create and update (spec 0002). Online booking is
// refused until its prerequisites exist (M10); the hero image is checked
// against the media library by the use case.
const managedFields = {
  heroMediaId: z.preprocess(
    blankToNull,
    z.string().trim().min(1).max(32).nullable().default(null),
  ),
  onlineBookingEnabled: z
    .boolean()
    .default(false)
    .refine((value) => value === false, ONLINE_BOOKING_NOT_READY_MESSAGE),
  sortOrder: sortOrderField.default(0),
};

/**
 * A new branch (API-A2 and the "Add branch" form). It starts INACTIVE unless
 * asked otherwise, so an unfinished site never goes live (review of M5).
 */
export const branchCreateSchema = branchFields
  .extend({
    ...managedFields,
    status: z.enum(BRANCH_STATUSES).default("INACTIVE"),
  })
  .superRefine(crossFieldRules);

/**
 * A change to an existing branch (API-A3 and the edit form). The slug is
 * fixed once created. Cross-field rules run on the merged result in the
 * use case, because a patch may carry only one side of a pair.
 */
export const branchUpdateSchema = branchFields
  .omit({ slug: true })
  .extend(managedFields)
  .partial();

/**
 * Parses a patch and keeps only the fields the caller sent. Zod applies
 * field defaults even inside `.partial()`, so without this an omitted field
 * would be "changed" to its default.
 */
export function parseBranchUpdate(input: unknown) {
  const parsed = branchUpdateSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const sent = new Set(
    typeof input === "object" && input !== null ? Object.keys(input) : [],
  );
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => sent.has(key)),
  ) as BranchUpdateAttributes;
  return { success: true as const, data };
}

export type BranchInput = z.input<typeof branchSchema>;
export type BranchAttributes = z.output<typeof branchSchema>;
export type BranchCreateInput = z.input<typeof branchCreateSchema>;
export type BranchCreateAttributes = z.output<typeof branchCreateSchema>;
export type BranchUpdateAttributes = z.output<typeof branchUpdateSchema>;
