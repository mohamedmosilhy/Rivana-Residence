// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  WHATSAPP_CATEGORY_VALUES,
  WHATSAPP_LANGUAGE_VALUES,
  WHATSAPP_PURPOSE_VALUES,
} from "@/contracts/api/v1/whatsapp";
import {
  WHATSAPP_CATEGORIES,
  WHATSAPP_LANGUAGES,
  WHATSAPP_PURPOSES,
  WHATSAPP_PURPOSE_VARIABLES,
  WHATSAPP_SAMPLE_VARIABLES,
  WHATSAPP_VARIABLE_KEYS,
  parseWhatsAppSettingsInput,
  parseWhatsAppTemplateInput,
  parseWhatsAppTemplatePatch,
  parseWhatsAppTestMessageInput,
  whatsAppReadiness,
} from "@/domain/notifications";

// M8-T4: WhatsApp setup rules (spec 0005 Decision 6, Q-67, Q-71, Q-84).

const template = {
  purpose: "BOOKING_CONFIRMED",
  language: "en",
  providerName: "booking_confirmed_v1",
  category: "UTILITY",
  variables: ["guestFirstName", "reference", "checkIn"],
  previewText: "Hello {{1}}, booking {{2}} is confirmed for {{3}}.",
  active: true,
};

const issuesOf = (input: unknown) => {
  const parsed = parseWhatsAppTemplateInput(input);
  return parsed.ok ? [] : parsed.issues;
};

describe("WhatsApp template allowlist (T-WA-5)", () => {
  it("accepts an allowlisted template in the stored variable order", () => {
    expect(parseWhatsAppTemplateInput(template)).toEqual({
      ok: true,
      value: template,
    });
  });

  it("holds the Q-84 change purposes, so M9 needs no allowlist change", () => {
    expect(WHATSAPP_PURPOSES).toEqual(
      expect.arrayContaining([
        "RESERVATION_MODIFIED",
        "CHANGE_REQUEST_RECEIVED",
        "CHANGE_REQUEST_APPROVED",
        "CHANGE_REQUEST_REJECTED",
      ]),
    );
  });

  it("refuses an unknown variable key", () => {
    expect(issuesOf({ ...template, variables: ["guestPhone"] })).toEqual([
      { path: "variables", message: 'Unknown variable "guestPhone".' },
    ]);
  });

  it("refuses a known key the purpose cannot fill", () => {
    expect(issuesOf({ ...template, variables: ["code"] })).toEqual([
      {
        path: "variables",
        message: '"code" cannot be used in a BOOKING_CONFIRMED message.',
      },
    ]);
  });

  it("refuses a key listed twice", () => {
    expect(
      issuesOf({ ...template, variables: ["reference", "reference"] }),
    ).toEqual([{ path: "variables", message: '"reference" is listed twice.' }]);
  });

  it("requires the code in a verification template, as an AUTHENTICATION one", () => {
    expect(
      issuesOf({
        ...template,
        purpose: "VERIFICATION_CODE",
        category: "UTILITY",
        variables: [],
      }),
    ).toEqual([
      {
        path: "variables",
        message: 'A VERIFICATION_CODE template must include "code".',
      },
      {
        path: "category",
        message:
          "A verification code template must be an AUTHENTICATION template.",
      },
    ]);
    expect(
      parseWhatsAppTemplateInput({
        ...template,
        purpose: "VERIFICATION_CODE",
        category: "AUTHENTICATION",
        variables: ["code"],
      }).ok,
    ).toBe(true);
  });

  it("keeps AUTHENTICATION for verification and test templates only", () => {
    expect(issuesOf({ ...template, category: "AUTHENTICATION" })).toEqual([
      {
        path: "category",
        message:
          "Only verification code templates use the AUTHENTICATION category.",
      },
    ]);
  });

  it("lets a TEST template use every key", () => {
    expect(
      parseWhatsAppTemplateInput({
        ...template,
        purpose: "TEST",
        variables: [...WHATSAPP_VARIABLE_KEYS],
      }).ok,
    ).toBe(true);
  });

  it("requires the MARKETING category for a marketing template", () => {
    const marketing = {
      ...template,
      purpose: "MARKETING",
      variables: ["guestFirstName"],
      previewText: "Hello {{1}}.",
    };
    expect(
      parseWhatsAppTemplateInput({ ...marketing, category: "MARKETING" }).ok,
    ).toBe(true);
    expect(issuesOf({ ...marketing, category: "UTILITY" })).toEqual([
      { path: "category", message: expect.stringContaining("MARKETING") },
    ]);
  });

  it.each([
    ["Booking Confirmed", "lowercase letters"],
    ["", "Enter the template name"],
    ["a".repeat(121), "120 characters"],
  ])("refuses the Meta name %j", (providerName, message) => {
    expect(issuesOf({ ...template, providerName })).toEqual([
      { path: "providerName", message: expect.stringContaining(message) },
    ]);
  });

  it("refuses unknown fields, so a token can never ride along", () => {
    expect(issuesOf({ ...template, accessToken: "x" })).toEqual([
      expect.objectContaining({ path: "_root" }),
    ]);
  });

  it("parses a patch without applying cross field rules yet", () => {
    expect(parseWhatsAppTemplatePatch({ active: false })).toEqual({
      ok: true,
      value: { active: false },
    });
    expect(parseWhatsAppTemplatePatch({ purpose: "NOPE" }).ok).toBe(false);
  });

  it("only allows keys from the fixed list in every purpose", () => {
    for (const keys of Object.values(WHATSAPP_PURPOSE_VARIABLES)) {
      for (const key of keys) expect(WHATSAPP_VARIABLE_KEYS).toContain(key);
    }
  });

  it("has a fake sample value for every key, so a test fills any template", () => {
    expect(Object.keys(WHATSAPP_SAMPLE_VARIABLES).sort()).toEqual(
      [...WHATSAPP_VARIABLE_KEYS].sort(),
    );
  });

  it("matches the HTTP contract enums", () => {
    expect([...WHATSAPP_PURPOSE_VALUES]).toEqual([...WHATSAPP_PURPOSES]);
    expect([...WHATSAPP_LANGUAGE_VALUES]).toEqual([...WHATSAPP_LANGUAGES]);
    expect([...WHATSAPP_CATEGORY_VALUES]).toEqual([...WHATSAPP_CATEGORIES]);
  });
});

describe("WhatsApp settings input (T-WA-4)", () => {
  it("normalizes the business number to E.164 and keeps digit ids", () => {
    expect(
      parseWhatsAppSettingsInput({
        businessPhoneNumber: "+20 100 123 4567",
        providerPhoneNumberId: " 123456789012345 ",
      }),
    ).toEqual({
      ok: true,
      value: {
        businessPhoneNumber: "+201001234567",
        providerPhoneNumberId: "123456789012345",
      },
    });
  });

  it("treats blank values as cleared (Q-71 allows clearing)", () => {
    expect(
      parseWhatsAppSettingsInput({
        businessPhoneNumber: "",
        providerPhoneNumberId: null,
      }),
    ).toEqual({
      ok: true,
      value: { businessPhoneNumber: null, providerPhoneNumberId: null },
    });
  });

  it("refuses a local number and a non digit id", () => {
    const parsed = parseWhatsAppSettingsInput({
      businessPhoneNumber: "01001234567",
      providerPhoneNumberId: "abc",
    });
    expect(
      parsed.ok || parsed.issues.map((issue) => issue.path).sort(),
    ).toEqual(["providerPhoneNumberId"]);
    const phone = parseWhatsAppSettingsInput({
      businessPhoneNumber: "01001234567",
      providerPhoneNumberId: "1",
    });
    expect(phone.ok || phone.issues.map((issue) => issue.path)).toEqual([
      "businessPhoneNumber",
    ]);
  });

  it("never accepts an access token", () => {
    const parsed = parseWhatsAppSettingsInput({
      businessPhoneNumber: null,
      providerPhoneNumberId: null,
      accessToken: "EAAG-secret",
    });
    expect(parsed.ok).toBe(false);
  });

  it("parses the test message phone and optional template", () => {
    const parsed = parseWhatsAppTestMessageInput({ phone: "+12025550101" });
    expect(parsed.ok && parsed.value.phone.value).toBe("+12025550101");
    expect(parsed.ok && parsed.value.templateId).toBeNull();
    const bad = parseWhatsAppTestMessageInput({ phone: "12345" });
    expect(bad.ok || bad.issues.map((issue) => issue.path)).toEqual(["phone"]);
  });
});

describe("WhatsApp readiness (Q-71)", () => {
  const ready = {
    businessPhoneNumber: "+201001234567",
    providerPhoneNumberId: "1234",
    accessTokenConfigured: true,
    activeTemplates: [
      { purpose: "VERIFICATION_CODE", language: "en" },
      { purpose: "BOOKING_CONFIRMED", language: "en" },
    ],
  };

  it("is configured with number, id, token, and both required templates", () => {
    const readiness = whatsAppReadiness(ready);
    expect(readiness.configured).toBe(true);
    expect(readiness.setupGaps.every((gap) => !gap.blocking)).toBe(true);
    expect(readiness.setupGaps.map((gap) => gap.purpose)).toContain(
      "MANAGE_LINK",
    );
    expect(readiness.setupGaps.map((gap) => gap.purpose)).not.toContain(
      "MARKETING",
    );
  });

  it.each([
    ["number", { businessPhoneNumber: null }],
    ["phone number id", { providerPhoneNumberId: null }],
    ["access token", { accessTokenConfigured: false }],
  ])("is not configured without the %s", (_name, override) => {
    expect(whatsAppReadiness({ ...ready, ...override }).configured).toBe(false);
  });

  it("marks a missing required template as a blocking gap", () => {
    const readiness = whatsAppReadiness({
      ...ready,
      activeTemplates: [
        { purpose: "VERIFICATION_CODE", language: "en" },
        { purpose: "BOOKING_CONFIRMED", language: "ar" },
      ],
    });
    expect(readiness.configured).toBe(false);
    expect(readiness.setupGaps[0]).toEqual({
      purpose: "BOOKING_CONFIRMED",
      language: "en",
      blocking: true,
    });
  });
});
