import { describe, expect, it } from "vitest";

import { contactEnquirySchema } from "@/domain/enquiries/contact-enquiry";
import { mediaAssetSchema } from "@/domain/media/media-asset";

const asset = {
  storageProvider: "local",
  storageContainer: "public",
  storageKey: "rooms/river-suite/hero.webp",
  originalFilename: "hero.webp",
  mimeType: "image/webp",
  bytes: 2048,
  width: 1600,
  height: 900,
  altText: "River suite",
  focalX: 0.5,
  focalY: 0.4,
  status: "READY",
};

describe("media asset rules", () => {
  it("accepts a ready image", () => {
    expect(mediaAssetSchema.safeParse(asset).success).toBe(true);
  });

  it.each([
    ["ready without dimensions", { width: null }],
    ["absolute storage key", { storageKey: "/etc/passwd.webp" }],
    ["traversal storage key", { storageKey: "rooms/../../secret.webp" }],
    ["unsupported mime type", { mimeType: "image/svg+xml" }],
    ["oversized file", { bytes: 26 * 1024 * 1024 }],
    ["focal point outside the image", { focalX: 1.2 }],
  ])("rejects %s", (_label, change) => {
    expect(mediaAssetSchema.safeParse({ ...asset, ...change }).success).toBe(
      false,
    );
  });

  it("allows pending media without dimensions", () => {
    expect(
      mediaAssetSchema.safeParse({
        ...asset,
        status: "PENDING",
        width: null,
        height: null,
      }).success,
    ).toBe(true);
  });
});

describe("contact enquiry rules", () => {
  const enquiry = {
    name: "Amira",
    email: "amira@example.test",
    phone: null,
    subject: null,
    message: "Do you have connecting rooms?",
  };

  it("accepts a plain-text enquiry", () => {
    expect(contactEnquirySchema.safeParse(enquiry).success).toBe(true);
  });

  it.each([
    ["markup in the name", { name: "<b>Amira</b>" }],
    ["markup in the message", { message: "<script>alert(1)</script>" }],
    ["an invalid email", { email: "not-an-email" }],
    ["an empty message", { message: "   " }],
  ])("rejects %s", (_label, change) => {
    expect(
      contactEnquirySchema.safeParse({ ...enquiry, ...change }).success,
    ).toBe(false);
  });
});
