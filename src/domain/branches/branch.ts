import { z } from "zod";

import {
  isMapEmbedUrl,
  MAP_EMBED_MESSAGE,
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

function optionalCoordinate(limit: number, label: string) {
  return z.preprocess(
    (value) => {
      const normalized = blankToNull(value);
      return typeof normalized === "string" ? Number(normalized) : normalized;
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

/**
 * The editable attributes of a branch (docs/domain/branch-model.md). The
 * database enforces the same slug, time, and sync rules with CHECK
 * constraints; this schema gives staff friendly messages first.
 */
export const branchSchema = z
  .object({
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
    phone: optionalText(40),
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
  })
  .superRefine((branch, context) => {
    if (branch.syncFollowUpMinutes >= branch.syncReminderIntervalMinutes) {
      context.addIssue({
        code: "custom",
        path: ["syncFollowUpMinutes"],
        message: "The follow-up delay must be shorter than the interval.",
      });
    }
    if ((branch.latitude === null) !== (branch.longitude === null)) {
      context.addIssue({
        code: "custom",
        path: [branch.latitude === null ? "latitude" : "longitude"],
        message: "Enter both latitude and longitude, or leave both empty.",
      });
    }
  });

export type BranchInput = z.input<typeof branchSchema>;
export type BranchAttributes = z.output<typeof branchSchema>;
