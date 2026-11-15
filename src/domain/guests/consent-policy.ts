import { z } from "zod";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";

// Q-73: identifiers only, not approved legal text. Replace these when Q-30/Q-58
// wording is approved. The server owns this list; it never comes from a request.
export const GUEST_CONSENT_VERSIONS = Object.freeze({
  privacyNotice: "privacy-placeholder-v1",
  marketing: "marketing-placeholder-v1",
});
const version = z
  .string()
  .min(1)
  .max(40)
  .refine(
    (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
    "Control characters are not allowed.",
  );
const consentSchema = z
  .object({
    privacyNoticeVersion: version,
    marketingConsentVersion: version.nullable().default(null),
  })
  .strict();
export type GuestConsent = Readonly<z.infer<typeof consentSchema>>;

/** Pure version check. The booking use case separately records consent time and audits renewed opt-in. */
export function validateGuestConsent(input: unknown): GuestConsent {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainValidationError(
      "The consent versions are invalid.",
      issuesFromZod(
        parsed.error.issues.map((issue) =>
          issue.code === "unrecognized_keys"
            ? { ...issue, message: "Remove unknown fields." }
            : issue,
        ),
      ),
    );
  const issues = [];
  if (parsed.data.privacyNoticeVersion !== GUEST_CONSENT_VERSIONS.privacyNotice)
    issues.push({
      path: "privacyNoticeVersion",
      message: "Use the current privacy notice version.",
    });
  if (
    parsed.data.marketingConsentVersion !== null &&
    parsed.data.marketingConsentVersion !== GUEST_CONSENT_VERSIONS.marketing
  )
    issues.push({
      path: "marketingConsentVersion",
      message: "Use the current marketing consent version.",
    });
  if (issues.length)
    throw new DomainValidationError(
      "The consent versions are invalid.",
      issues,
    );
  return Object.freeze(parsed.data);
}
