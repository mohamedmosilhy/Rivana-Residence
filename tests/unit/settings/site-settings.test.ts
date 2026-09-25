import { describe, expect, it } from "vitest";

import {
  siteSettingsSchema,
  socialLinksSchema,
} from "@/domain/settings/site-settings";

const blank = {
  siteName: "Rivana Residence",
  tagline: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  country: "",
  latitude: "",
  longitude: "",
  mapEmbedUrl: "",
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
      siteSettingsSchema.parse({ ...blank, siteName: "  Rivana  ", city: " " }),
    ).toEqual({
      siteName: "Rivana",
      tagline: null,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      mapEmbedUrl: null,
      footerText: null,
      defaultSeoTitle: null,
      defaultSeoDescription: null,
    });
  });

  it("treats missing optional fields as not set", () => {
    expect(siteSettingsSchema.parse({ siteName: "Rivana" }).email).toBeNull();
  });

  it("parses coordinates from form text", () => {
    const parsed = siteSettingsSchema.parse({
      ...blank,
      latitude: "30.0131",
      longitude: "-31.49",
    });
    expect(parsed).toMatchObject({ latitude: 30.0131, longitude: -31.49 });
  });

  it("requires the residence name", () => {
    expect(issues({ ...blank, siteName: "   " })).toHaveProperty("siteName");
    expect(issues({ ...blank, siteName: null })).toHaveProperty("siteName");
  });

  it.each([
    ["email", "not-an-email"],
    ["phone", "call us"],
    ["latitude", "91"],
    ["longitude", "east"],
    ["defaultSeoTitle", "x".repeat(71)],
    ["defaultSeoDescription", "x".repeat(171)],
    ["footerText", "x".repeat(501)],
  ])("rejects an invalid %s", (field, value) => {
    const input = { ...blank, [field]: value };
    if (field === "latitude") input.longitude = "31";
    if (field === "longitude") input.latitude = "30";
    expect(issues(input)).toHaveProperty(field);
  });

  it("requires latitude and longitude together", () => {
    expect(issues({ ...blank, latitude: "30" })).toEqual({
      longitude: "Enter both latitude and longitude, or leave both empty.",
    });
  });

  it("accepts only Google Maps embed links for the map", () => {
    expect(
      issues({
        ...blank,
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18",
      }),
    ).toEqual({});
    for (const url of [
      "https://evil.example/maps/embed",
      "http://www.google.com/maps/embed?pb=1",
      "javascript:alert(1)",
      "https://www.google.com.evil.example/maps/embed",
    ]) {
      expect(issues({ ...blank, mapEmbedUrl: url })).toHaveProperty(
        "mapEmbedUrl",
      );
    }
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
