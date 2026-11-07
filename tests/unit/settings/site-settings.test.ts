import { describe, expect, it } from "vitest";

import {
  siteSettingsSchema,
  socialLinksSchema,
} from "@/domain/settings/site-settings";

// Brand-wide fields only: contact, address, and map moved to branches in M5
// (owner decision, spec 0002); their rules are tested with the branch schema.
const blank = {
  siteName: "Rivana Residence",
  tagline: "",
  footerText: "",
  defaultSeoTitle: "",
  defaultSeoDescription: "",
};

function issues(input: unknown) {
  const result = siteSettingsSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
}

describe("site settings rules", () => {
  it("treats blank optional fields as not set and trims text", () => {
    expect(
      siteSettingsSchema.parse({
        ...blank,
        siteName: "  Rivana  ",
        tagline: " ",
      }),
    ).toEqual({
      siteName: "Rivana",
      tagline: null,
      footerText: null,
      defaultSeoTitle: null,
      defaultSeoDescription: null,
    });
  });

  // AC-11: contact and map fields are no longer part of the settings form.
  it("drops retired contact and map fields", () => {
    const parsed = siteSettingsSchema.parse({
      ...blank,
      phone: "+20 2 1234 5678",
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=1",
    });
    expect(parsed).not.toHaveProperty("phone");
    expect(parsed).not.toHaveProperty("mapEmbedUrl");
  });

  it("requires the residence name", () => {
    expect(issues({ ...blank, siteName: "   " })).toHaveProperty("siteName");
    expect(issues({ ...blank, siteName: null })).toHaveProperty("siteName");
  });

  it.each([
    ["defaultSeoTitle", "x".repeat(71)],
    ["defaultSeoDescription", "x".repeat(171)],
    ["footerText", "x".repeat(501)],
  ])("rejects an invalid %s", (field, value) => {
    expect(issues({ ...blank, [field]: value })).toHaveProperty(field);
  });

  it("rejects non-string values such as uploaded files", () => {
    expect(issues({ ...blank, siteName: new Blob(["x"]) })).toHaveProperty(
      "siteName",
    );
  });
});

describe("social link rules", () => {
  const link = {
    platform: "instagram",
    label: "Rivana on Instagram",
    url: "https://instagram.com/rivana",
    isVisible: true,
  };

  it("accepts ordered https links", () => {
    expect(
      socialLinksSchema.parse([
        link,
        { ...link, platform: "facebook", url: "https://facebook.com/rivana" },
      ]),
    ).toHaveLength(2);
  });

  it("rejects a repeated platform at the repeated row", () => {
    const result = socialLinksSchema.safeParse([link, link]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([1, "platform"]);
  });

  it.each([
    ["http://instagram.com/rivana"],
    ["javascript:alert(1)"],
    ["instagram.com/rivana"],
  ])("rejects the non-https link %s", (url) => {
    expect(socialLinksSchema.safeParse([{ ...link, url }]).success).toBe(false);
  });

  it("rejects unknown platforms, blank labels, and too many links", () => {
    expect(
      socialLinksSchema.safeParse([{ ...link, platform: "myspace" }]).success,
    ).toBe(false);
    expect(
      socialLinksSchema.safeParse([{ ...link, label: "  " }]).success,
    ).toBe(false);
    expect(socialLinksSchema.safeParse(Array(9).fill(link)).success).toBe(
      false,
    );
  });

  it("rejects a payload that is not a list", () => {
    expect(socialLinksSchema.safeParse(null).success).toBe(false);
    expect(socialLinksSchema.safeParse({ 0: link }).success).toBe(false);
  });
});
