import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";

// WhatsApp message templates (ADR 028, Q-67, spec 0005 Decision 6). The
// template itself is approved in Meta; Rivana stores its exact name and the
// ordered variable keys it fills. Only keys from these fixed lists exist, and
// each purpose allows only the keys it can actually fill (owner, 2026-11-17).

export const WHATSAPP_PURPOSES = [
  "VERIFICATION_CODE",
  "BOOKING_CONFIRMED",
  "PAYMENT_NOT_COMPLETED",
  "CANCELLATION_RECEIVED",
  "CANCELLATION_APPROVED",
  "CANCELLATION_REJECTED",
  "REFUND_COMPLETED",
  "CANCELLED_BY_HOTEL",
  "MANAGE_LINK",
  "FEEDBACK_REQUEST",
  "MARKETING",
  "TEST",
  // Q-84 (2026-11-17): staff and guest changes, and M9 change requests.
  "RESERVATION_MODIFIED",
  "CHANGE_REQUEST_RECEIVED",
  "CHANGE_REQUEST_APPROVED",
  "CHANGE_REQUEST_REJECTED",
] as const;
export type WhatsAppPurpose = (typeof WHATSAPP_PURPOSES)[number];

export const WHATSAPP_VARIABLE_KEYS = [
  "guestFirstName",
  "reference",
  "branchName",
  "checkIn",
  "checkOut",
  "total",
  "manageLink",
  "code",
  "holdExpiresAt",
  "refundAmount",
  "reason",
  "feedbackLink",
] as const;
export type WhatsAppVariableKey = (typeof WHATSAPP_VARIABLE_KEYS)[number];

/** Template languages that may be stored. M8 sends `en` only (Q-72). */
export const WHATSAPP_LANGUAGES = ["en", "ar"] as const;
export type WhatsAppLanguage = (typeof WHATSAPP_LANGUAGES)[number];
export const WHATSAPP_SEND_LANGUAGE: WhatsAppLanguage = "en";

export const WHATSAPP_CATEGORIES = [
  "AUTHENTICATION",
  "UTILITY",
  "MARKETING",
] as const;
export type WhatsAppCategory = (typeof WHATSAPP_CATEGORIES)[number];

const STAY = [
  "guestFirstName",
  "reference",
  "branchName",
  "checkIn",
  "checkOut",
  "total",
  "manageLink",
] as const satisfies readonly WhatsAppVariableKey[];
const REQUEST_SUMMARY = [
  "guestFirstName",
  "reference",
  "branchName",
] as const satisfies readonly WhatsAppVariableKey[];
const CASE = [...REQUEST_SUMMARY, "manageLink"] as const;

/** The keys each purpose may use, in a suggested order. */
export const WHATSAPP_PURPOSE_VARIABLES: Readonly<
  Record<WhatsAppPurpose, readonly WhatsAppVariableKey[]>
> = {
  // Meta authentication templates carry only the one time code.
  VERIFICATION_CODE: ["code"],
  BOOKING_CONFIRMED: STAY,
  PAYMENT_NOT_COMPLETED: [
    "guestFirstName",
    "reference",
    "branchName",
    "holdExpiresAt",
    "manageLink",
  ],
  CANCELLATION_RECEIVED: REQUEST_SUMMARY,
  CANCELLATION_APPROVED: [...CASE, "refundAmount"],
  CANCELLATION_REJECTED: [...CASE, "reason"],
  REFUND_COMPLETED: [
    "guestFirstName",
    "reference",
    "branchName",
    "refundAmount",
  ],
  CANCELLED_BY_HOTEL: [
    "guestFirstName",
    "reference",
    "branchName",
    "checkIn",
    "checkOut",
    "reason",
  ],
  MANAGE_LINK: CASE,
  FEEDBACK_REQUEST: ["guestFirstName", "branchName", "feedbackLink"],
  MARKETING: ["guestFirstName", "branchName"],
  TEST: WHATSAPP_VARIABLE_KEYS,
  RESERVATION_MODIFIED: STAY,
  CHANGE_REQUEST_RECEIVED: CASE,
  CHANGE_REQUEST_APPROVED: STAY,
  CHANGE_REQUEST_REJECTED: [...CASE, "reason"],
};

/** Keys a template of the purpose must contain. */
const REQUIRED_VARIABLES: Partial<
  Record<WhatsAppPurpose, readonly WhatsAppVariableKey[]>
> = { VERIFICATION_CODE: ["code"] };

export const WHATSAPP_TEMPLATE_LIMITS = {
  providerName: 120,
  previewText: 1024,
  variables: WHATSAPP_VARIABLE_KEYS.length,
} as const;

export type WhatsAppTemplateInput = Readonly<{
  purpose: WhatsAppPurpose;
  language: WhatsAppLanguage;
  providerName: string;
  category: WhatsAppCategory;
  variables: readonly WhatsAppVariableKey[];
  previewText: string;
  active: boolean;
}>;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

const fields = {
  purpose: z.enum(WHATSAPP_PURPOSES, "Choose a message purpose."),
  language: z.enum(WHATSAPP_LANGUAGES, "Choose English or Arabic."),
  providerName: z
    .string("Enter the template name approved in Meta.")
    .trim()
    .min(1, "Enter the template name approved in Meta.")
    .max(WHATSAPP_TEMPLATE_LIMITS.providerName, "Use 120 characters or fewer.")
    .regex(
      /^[a-z0-9_]*$/,
      "Use the Meta template name: lowercase letters, digits, and underscores.",
    ),
  category: z.enum(WHATSAPP_CATEGORIES, "Choose the template category."),
  variables: z
    .array(z.string("Each variable must be a key."), "List the variables.")
    .max(WHATSAPP_TEMPLATE_LIMITS.variables, "Too many variables."),
  previewText: z
    .string("Enter a preview of the message.")
    .trim()
    .min(1, "Enter a preview of the message.")
    .max(WHATSAPP_TEMPLATE_LIMITS.previewText, "Use 1024 characters or fewer."),
  active: z.boolean("Choose whether the template is active."),
};

const templateSchema = z.object(fields).strict();
const patchSchema = z.object(fields).partial().strict();

/** Only the keys a patch sent; Zod leaves absent keys out. */
export type WhatsAppTemplatePatch = z.output<typeof patchSchema>;

function isVariableKey(value: string): value is WhatsAppVariableKey {
  return (WHATSAPP_VARIABLE_KEYS as readonly string[]).includes(value);
}

function rootPath(issues: readonly DomainIssue[]) {
  return issues.map((issue) =>
    issue.path === "" ? { ...issue, path: "_root" } : issue,
  );
}

/** Cross field rules: the per purpose allowlist and the Meta category. */
function templateIssues(
  purpose: WhatsAppPurpose,
  category: WhatsAppCategory,
  variables: readonly string[],
): DomainIssue[] {
  const issues: DomainIssue[] = [];
  const allowed = WHATSAPP_PURPOSE_VARIABLES[purpose];
  const seen = new Set<string>();
  for (const key of variables) {
    if (!isVariableKey(key)) {
      issues.push({ path: "variables", message: `Unknown variable "${key}".` });
    } else if (!allowed.includes(key)) {
      issues.push({
        path: "variables",
        message: `"${key}" cannot be used in a ${purpose} message.`,
      });
    }
    if (seen.has(key)) {
      issues.push({ path: "variables", message: `"${key}" is listed twice.` });
    }
    seen.add(key);
  }
  for (const key of REQUIRED_VARIABLES[purpose] ?? []) {
    if (!seen.has(key)) {
      issues.push({
        path: "variables",
        message: `A ${purpose} template must include "${key}".`,
      });
    }
  }
  if (purpose === "VERIFICATION_CODE" && category !== "AUTHENTICATION") {
    issues.push({
      path: "category",
      message:
        "A verification code template must be an AUTHENTICATION template.",
    });
  }
  if (purpose === "MARKETING" && category !== "MARKETING") {
    issues.push({
      path: "category",
      message: "A marketing template must be a MARKETING template.",
    });
  }
  if (
    category === "AUTHENTICATION" &&
    purpose !== "VERIFICATION_CODE" &&
    purpose !== "TEST"
  ) {
    issues.push({
      path: "category",
      message:
        "Only verification code templates use the AUTHENTICATION category.",
    });
  }
  return issues;
}

/** A whole template (API-A7 `POST`, and a patch merged onto the stored row). */
export function parseWhatsAppTemplateInput(
  input: unknown,
): Parsed<WhatsAppTemplateInput> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: rootPath(issuesFromZod(parsed.error.issues)) };
  }
  const value = parsed.data;
  const issues = templateIssues(value.purpose, value.category, value.variables);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: { ...value, variables: value.variables.filter(isVariableKey) },
  };
}

/**
 * The shape of an API-A7 `PATCH`. Cross field rules run after the patch is
 * merged onto the stored template, under its row lock.
 */
export function parseWhatsAppTemplatePatch(
  input: unknown,
): Parsed<WhatsAppTemplatePatch> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: rootPath(issuesFromZod(parsed.error.issues)) };
  }
  return { ok: true, value: parsed.data };
}
