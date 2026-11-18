import { z } from "zod";

import { PhoneNumber } from "@/domain/guests";
import {
  DomainValidationError,
  issuesFromZod,
  type DomainIssue,
} from "@/domain/shared/domain-error";

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

/**
 * The Admin's WhatsApp setup (API-A6 `PUT`, Q-67). Both values may be empty:
 * the number stays a placeholder until the client supplies it, and clearing
 * it turns sending off (Q-71). The access token is never part of this input.
 */
export type WhatsAppSettingsInput = Readonly<{
  businessPhoneNumber: string | null;
  providerPhoneNumberId: string | null;
}>;

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const settingsSchema = z
  .object({
    businessPhoneNumber: z.preprocess(
      blankToNull,
      z.string("Enter the number in international format.").nullable(),
    ),
    providerPhoneNumberId: z.preprocess(
      blankToNull,
      z
        .string("Enter the phone number id from Meta.")
        .trim()
        .regex(/^\d{1,64}$/, "The phone number id is digits only (up to 64).")
        .nullable(),
    ),
  })
  .strict();

export function parseWhatsAppSettingsInput(
  input: unknown,
): Parsed<WhatsAppSettingsInput> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: issuesFromZod(parsed.error.issues).map((issue) =>
        issue.path === "" ? { ...issue, path: "_root" } : issue,
      ),
    };
  }
  const { businessPhoneNumber, providerPhoneNumberId } = parsed.data;
  if (businessPhoneNumber === null) {
    return { ok: true, value: { businessPhoneNumber, providerPhoneNumberId } };
  }
  try {
    return {
      ok: true,
      value: {
        businessPhoneNumber: PhoneNumber.parse(businessPhoneNumber).value,
        providerPhoneNumberId,
      },
    };
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    return {
      ok: false,
      issues: error.issues.map((issue) => ({
        ...issue,
        path: "businessPhoneNumber",
      })),
    };
  }
}

/** The Admin's test message (API-A8). */
export type WhatsAppTestMessageInput = Readonly<{
  phone: PhoneNumber;
  templateId: string | null;
}>;

const testSchema = z
  .object({
    phone: z.unknown(),
    templateId: z
      .string("Choose a template.")
      .trim()
      .min(1, "Choose a template.")
      .max(32, "Choose a template.")
      .nullable()
      .optional(),
  })
  .strict();

export function parseWhatsAppTestMessageInput(
  input: unknown,
): Parsed<WhatsAppTestMessageInput> {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: issuesFromZod(parsed.error.issues).map((issue) =>
        issue.path === "" ? { ...issue, path: "_root" } : issue,
      ),
    };
  }
  try {
    return {
      ok: true,
      value: {
        phone: PhoneNumber.parse(parsed.data.phone),
        templateId: parsed.data.templateId ?? null,
      },
    };
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    return { ok: false, issues: error.issues };
  }
}
