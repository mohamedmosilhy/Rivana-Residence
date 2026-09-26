import { describe, expect, it } from "vitest";

import {
  MEDIA_UPLOAD_POLICY,
  checkDecodedImage,
  checkUploadDeclaration,
  detectImageFormat,
  displayFilename,
  isSafeStorageKey,
  mediaDetailsSchema,
  storageKeyFor,
} from "@/domain/media/media-asset";
import {
  parseMediaListQuery,
  tagsForUsage,
} from "@/application/media/media-library";
import { assertRoomPublishable } from "@/domain/rooms/room";
import { assertPagePublishable } from "@/domain/content/page-sections";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("magic bytes", () => {
  it.each([
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ["webp", ascii("RIFF\0\0\0\0WEBPVP8 ")],
    ["avif", ascii("\0\0\0\x1cftypavif")],
  ])("recognises %s", (format, header) => {
    expect(detectImageFormat(header)).toBe(format);
  });

  it.each([
    ["GIF", ascii("GIF89a")],
    ["SVG", ascii("<svg xmlns=")],
    ["animated AVIF", ascii("\0\0\0\x1cftypavis")],
    ["HTML", ascii("<!doctype html>")],
    ["empty", bytes()],
  ])("rejects %s", (_, header) => {
    expect(detectImageFormat(header)).toBeNull();
  });
});

describe("upload declaration", () => {
  const ok = {
    filename: "pool.jpg",
    declaredType: "image/jpeg",
    declaredBytes: 1000,
  };

  it("accepts matching names and types", () => {
    expect(checkUploadDeclaration(ok)).toEqual({ format: "jpeg" });
    expect(checkUploadDeclaration({ ...ok, filename: "POOL.JPEG" })).toEqual({
      format: "jpeg",
    });
    expect(
      checkUploadDeclaration({
        ...ok,
        filename: "a.avif",
        declaredType: "image/avif",
      }),
    ).toEqual({ format: "avif" });
  });

  it.each([
    [{ declaredType: "image/svg+xml", filename: "logo.svg" }, "Only JPEG"],
    [{ declaredType: "image/gif", filename: "a.gif" }, "Only JPEG"],
    [{ declaredType: "text/html", filename: "a.jpg" }, "Only JPEG"],
    [{ filename: "pool.png" }, "must end in .jpg"],
    [{ filename: "pool.jpg.php" }, "must end in .jpg"],
    [{ filename: "pool" }, "must end in .jpg"],
    [{ declaredBytes: MEDIA_UPLOAD_POLICY.maxBytes + 1 }, "15 MB"],
  ])("rejects %o", (overrides, message) => {
    expect(checkUploadDeclaration({ ...ok, ...overrides }).reason).toContain(
      message,
    );
  });
});

describe("decoded image checks", () => {
  const decoded = { format: "png" as const, width: 800, height: 600, pages: 1 };

  it("accepts a still image that matches everything", () => {
    expect(checkDecodedImage("png", "png", decoded)).toBeNull();
  });

  it.each([
    ["undecodable", "png", null, "not a readable image"],
    ["magic mismatch", "jpeg", decoded, "do not match"],
    ["animated", "png", { ...decoded, pages: 3 }, "Animated"],
    ["tiny", "png", { ...decoded, width: 8 }, "too small"],
    [
      "too wide",
      "png",
      { ...decoded, width: 12_001, height: 100 },
      "40 megapixels",
    ],
    [
      "too many pixels",
      "png",
      { ...decoded, width: 7000, height: 7000 },
      "40 megapixels",
    ],
  ] as const)("rejects %s", (_, magic, info, message) => {
    expect(checkDecodedImage("png", magic, info)?.reason).toContain(message);
  });
});

describe("keys and names", () => {
  it("generates immutable, dated, server-controlled keys", () => {
    const key = storageKeyFor(
      "abc123",
      "webp",
      new Date("2026-09-25T12:00:00Z"),
    );
    expect(key).toBe("images/2026/09/abc123.webp");
    expect(isSafeStorageKey(key)).toBe(true);
    expect(() => storageKeyFor("../x", "png", new Date())).toThrow();
  });

  it.each([
    "../etc/passwd.jpg",
    "/abs/path.jpg",
    "images/../x.jpg",
    "images//x.jpg",
    ".hidden.jpg",
    "images/x",
    "images/x.JPG ",
    "images\\x.jpg",
  ])("refuses the key %o", (key) => {
    expect(isSafeStorageKey(key)).toBe(false);
  });

  it("keeps only a safe display name", () => {
    expect(displayFilename("C:\\Users\\me\\pool.jpg")).toBe("pool.jpg");
    expect(displayFilename("../../etc/passwd")).toBe("passwd");
    expect(displayFilename("a\u0000b\nc.png")).toBe("abc.png");
    expect(displayFilename("")).toBe("image");
  });
});

describe("image details", () => {
  it("stores focal points as fractions and blanks as null", () => {
    expect(
      mediaDetailsSchema.parse({
        altText: " Pool ",
        caption: "",
        credit: "",
        focalX: "25",
        focalY: "80",
      }),
    ).toEqual({
      altText: "Pool",
      caption: null,
      credit: null,
      focalX: 0.25,
      focalY: 0.8,
    });
  });

  it.each([
    [{ focalX: "50" }, "focalY"],
    [{ focalX: "101", focalY: "5" }, "focalX"],
    [{ focalX: "abc", focalY: "5" }, "focalX"],
    [{ altText: "x".repeat(301) }, "altText"],
  ])("rejects %o", (values, field) => {
    const result = mediaDetailsSchema.safeParse({ altText: "", ...values });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe("publishing with images", () => {
  const room = {
    id: "r",
    name: "Nile Suite",
    slug: "nile-suite",
    shortDescription: "Wide windows.",
    description: { type: "doc" as const, content: [] },
    sizeSqm: null,
    maxAdults: 2,
    maxChildren: 0,
    bedSummary: null,
    viewSummary: null,
    status: "DRAFT" as const,
  };
  const hero = {
    role: "HERO" as const,
    status: "READY" as const,
    altText: "Bed",
    rightsConfirmed: true,
  };

  it("requires confirmed rights for every image", () => {
    expect(() =>
      assertRoomPublishable({ ...room, media: [hero] }),
    ).not.toThrow();
    expect(() =>
      assertRoomPublishable({
        ...room,
        media: [{ ...hero, rightsConfirmed: false }],
      }),
    ).toThrow("not ready to publish");
  });

  it("checks images in visible page sections, allowing decorative ones without alt text", () => {
    const heroSection = {
      type: "HERO" as const,
      isVisible: true,
      payload: { schemaVersion: 1, title: "T", summary: "S" },
    };
    const contact = {
      type: "CONTACT_CTA" as const,
      isVisible: true,
      payload: { schemaVersion: 1, body: "B", formEnabled: true },
    };
    const image = {
      role: "BACKGROUND",
      status: "READY",
      altText: "",
      rightsConfirmed: true,
    };
    expect(() =>
      assertPagePublishable("CONTACT", [
        { ...heroSection, media: [image] },
        contact,
      ]),
    ).toThrow();
    expect(() =>
      assertPagePublishable("CONTACT", [
        { ...heroSection, media: [{ ...image, role: "DECORATIVE" }] },
        contact,
      ]),
    ).not.toThrow();
    expect(() =>
      assertPagePublishable("CONTACT", [
        {
          ...heroSection,
          media: [{ ...image, altText: "Lobby", rightsConfirmed: false }],
        },
        contact,
      ]),
    ).toThrow();
  });
});

describe("library queries and cache tags", () => {
  it("parses filters safely", () => {
    expect(
      parseMediaListQuery({
        q: " pool ",
        status: "FAILED",
        type: "image/png",
        alt: "missing",
        usage: "unused",
        rights: "UNCONFIRMED",
      }),
    ).toMatchObject({
      search: "pool",
      status: "FAILED",
      mimeType: "image/png",
      missingAlt: true,
      usage: "unused",
      rights: "UNCONFIRMED",
      pageSize: 24,
    });
    expect(
      parseMediaListQuery({ status: "DELETED", type: "image/svg+xml" }),
    ).toMatchObject({
      status: null,
      mimeType: null,
    });
  });

  it("invalidates only public places that show the image", () => {
    expect(
      tagsForUsage([
        {
          kind: "ROOM",
          ownerId: "r1",
          ownerName: "A",
          role: "Gallery",
          isPublic: true,
          slug: "nile",
        },
        {
          kind: "FACILITY",
          ownerId: "f1",
          ownerName: "B",
          role: "Hero image",
          isPublic: false,
          slug: "pool",
        },
        {
          kind: "PAGE_SECTION",
          ownerId: "HOME",
          ownerName: "Home page",
          role: "Hero section",
          isPublic: true,
          slug: null,
        },
        {
          kind: "SITE_SETTINGS",
          ownerId: "default",
          ownerName: "Site settings",
          role: "Logo",
          isPublic: true,
          slug: null,
        },
      ]),
    ).toEqual(["rooms", "sitemap", "room:nile", "page:home", "site-settings"]);
  });
});
