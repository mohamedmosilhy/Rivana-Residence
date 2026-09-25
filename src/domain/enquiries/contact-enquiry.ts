import { z } from "zod";

const containsMarkup = /<[^>]*>/;
const NO_MARKUP =
  "Please remove anything that looks like HTML (text between < and >).";

export const contactEnquirySchema = z.object({
  name: z
    .string({ error: "Enter your name." })
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Use 120 characters or fewer.")
    .refine((value) => !containsMarkup.test(value), NO_MARKUP),
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .pipe(
      z
        .email("Enter a valid email address, like name@example.com.")
        .max(320, "Use 320 characters or fewer."),
    ),
  phone: z
    .string()
    .trim()
    .max(40, "Use 40 characters or fewer.")
    .regex(/^[+0-9 ()-]*$/, "Use digits, spaces, brackets, +, or dashes.")
    .nullable(),
  subject: z
    .string()
    .trim()
    .max(160, "Use 160 characters or fewer.")
    .nullable(),
  message: z
    .string({ error: "Enter your message." })
    .trim()
    .min(1, "Enter your message.")
    .max(4000, "Use 4000 characters or fewer.")
    .refine((value) => !containsMarkup.test(value), NO_MARKUP),
});

export const ENQUIRY_THROTTLE_RULE = {
  maxFailures: 5,
  windowMs: 10 * 60 * 1000,
  lockMs: 10 * 60 * 1000,
} as const;

// When the client address is unknown, all visitors share one generous bucket
// so a flood still stops.
export const ENQUIRY_GLOBAL_THROTTLE_RULE = {
  maxFailures: 40,
  windowMs: 10 * 60 * 1000,
  lockMs: 10 * 60 * 1000,
} as const;

/** Forms submitted faster than a person can type are treated as bots. */
export const MIN_FORM_FILL_MS = 3000;
/** Tokens expire so a stale page asks the visitor to reload. */
export const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;
