import { describe, expect, it } from "vitest";
import { GUEST_CONSENT_VERSIONS, validateGuestConsent } from "@/domain/guests";
import { DomainValidationError } from "@/domain/shared/domain-error";
const privacyNoticeVersion = GUEST_CONSENT_VERSIONS.privacyNotice;
const marketingConsentVersion = GUEST_CONSENT_VERSIONS.marketing;

describe("Q-73 server-owned placeholder consent versions", () => {
  it("accepts current privacy without implying marketing opt-in", () => {
    expect(validateGuestConsent({ privacyNoticeVersion })).toEqual({
      privacyNoticeVersion,
      marketingConsentVersion: null,
    });
    expect(
      validateGuestConsent({
        privacyNoticeVersion,
        marketingConsentVersion: null,
      }).marketingConsentVersion,
    ).toBeNull();
  });
  it("accepts the current marketing version only when explicitly supplied, and freezes the result", () => {
    const result = validateGuestConsent({
      privacyNoticeVersion,
      marketingConsentVersion,
    });
    expect(result).toEqual({ privacyNoticeVersion, marketingConsentVersion });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(GUEST_CONSENT_VERSIONS)).toBe(true);
    expect(privacyNoticeVersion).toContain("placeholder");
    expect(marketingConsentVersion).toContain("placeholder");
  });
  it.each([
    {},
    { privacyNoticeVersion: "old" },
    { privacyNoticeVersion, marketingConsentVersion: "old" },
    { privacyNoticeVersion: ` ${privacyNoticeVersion}` },
    {
      privacyNoticeVersion,
      marketingConsentVersion: ` ${marketingConsentVersion}`,
    },
    { privacyNoticeVersion: null },
    { privacyNoticeVersion, marketingConsentVersion: true },
    { privacyNoticeVersion: "a".repeat(41) },
    { privacyNoticeVersion, marketingConsentVersion: "a".repeat(41) },
    { privacyNoticeVersion: `${privacyNoticeVersion}\n` },
    {
      privacyNoticeVersion,
      marketingConsentVersion: `${marketingConsentVersion}\u200b`,
    },
    { privacyNoticeVersion: "" },
    { privacyNoticeVersion, marketingConsentVersion: "" },
    { privacyNoticeVersion, currentPrivacyVersion: "attacker-override" },
  ])(
    "rejects missing, stale, malformed or client-overridden versions %j",
    (input) => {
      expect(() => validateGuestConsent(input)).toThrow(DomainValidationError);
    },
  );
  it("reports version field names without exposing supplied values", () => {
    try {
      validateGuestConsent({
        privacyNoticeVersion: "private-value@example.test",
        marketingConsentVersion: "secret-marketing-token",
      });
      throw new Error("Expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      const failure = error as DomainValidationError;
      expect(failure.issues.map((issue) => issue.path)).toEqual([
        "privacyNoticeVersion",
        "marketingConsentVersion",
      ]);
      expect(JSON.stringify(failure.issues)).not.toContain(
        "private-value@example.test",
      );
      expect(JSON.stringify(failure.issues)).not.toContain(
        "secret-marketing-token",
      );
    }
  });
});
