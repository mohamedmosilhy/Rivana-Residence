import { z } from "zod";

import type { PageSectionType } from "@/domain/content/page-sections";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type ImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export type ImageFormat = "jpeg" | "png" | "webp" | "avif";

export const IMAGE_FORMATS: Record<
  ImageFormat,
  Readonly<{
    mime: ImageMimeType;
    extension: string;
    extensions: readonly string[];
  }>
> = {
  jpeg: { mime: "image/jpeg", extension: "jpg", extensions: ["jpg", "jpeg"] },
  png: { mime: "image/png", extension: "png", extensions: ["png"] },
  webp: { mime: "image/webp", extension: "webp", extensions: ["webp"] },
  avif: { mime: "image/avif", extension: "avif", extensions: ["avif"] },
};

/**
 * The upload policy proposed for client approval (docs/security.md): still
 * JPEG, PNG, WebP, or AVIF; no SVG or animation; at most 15 MB and 40
 * megapixels before processing.
 */
export const MEDIA_UPLOAD_POLICY = {
  maxBytes: 15 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxEdge: 12_000,
  minEdge: 16,
} as const;

function formatForMime(mime: string): ImageFormat | null {
  const entry = Object.entries(IMAGE_FORMATS).find(
    ([, format]) => format.mime === mime,
  );
  return entry ? (entry[0] as ImageFormat) : null;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * Identifies an image from its leading bytes. Declared names and content
 * types are only hints; this and a full decode decide what a file is.
 * Animated AVIF ("avis") and every other container return null.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    ascii(bytes, 8, 4) === "avif"
  ) {
    return "avif";
  }
  return null;
}

export type UploadDeclaration = Readonly<{
  filename: string;
  declaredType: string;
  declaredBytes: number | null;
}>;

export type UploadRejection = Readonly<{ reason: string }>;

/** Checks the browser's claims before any bytes are accepted. */
export function checkUploadDeclaration(
  declaration: UploadDeclaration,
):
  | (UploadRejection & { format?: never })
  | { format: ImageFormat; reason?: never } {
  const extension = declaration.filename.split(".").pop()?.toLowerCase() ?? "";
  const format = formatForMime(declaration.declaredType);
  if (!format) {
    return {
      reason: "Only JPEG, PNG, WebP, or AVIF images can be uploaded.",
    };
  }
  if (!IMAGE_FORMATS[format].extensions.includes(extension)) {
    return {
      reason: `The file name must end in .${IMAGE_FORMATS[format].extensions.join(" or .")} for a ${format.toUpperCase()} image.`,
    };
  }
  if (
    declaration.declaredBytes !== null &&
    declaration.declaredBytes > MEDIA_UPLOAD_POLICY.maxBytes
  ) {
    return { reason: "Images must be 15 MB or smaller." };
  }
  return { format };
}

export type DecodedImage = Readonly<{
  format: ImageFormat;
  width: number;
  height: number;
  /** More than one page or frame means animation. */
  pages: number;
}>;

/** Checks the decoded image against the declared and detected format. */
export function checkDecodedImage(
  expected: ImageFormat,
  magic: ImageFormat | null,
  decoded: DecodedImage | null,
): UploadRejection | null {
  if (!magic || !decoded) {
    return { reason: "The file is not a readable image." };
  }
  if (magic !== expected || decoded.format !== expected) {
    return {
      reason: "The file's contents do not match its name or type.",
    };
  }
  if (decoded.pages > 1) {
    return { reason: "Animated images cannot be uploaded." };
  }
  const { width, height } = decoded;
  if (
    width < MEDIA_UPLOAD_POLICY.minEdge ||
    height < MEDIA_UPLOAD_POLICY.minEdge
  ) {
    return { reason: "The image is too small." };
  }
  if (
    width > MEDIA_UPLOAD_POLICY.maxEdge ||
    height > MEDIA_UPLOAD_POLICY.maxEdge ||
    width * height > MEDIA_UPLOAD_POLICY.maxPixels
  ) {
    return { reason: "Images must be 40 megapixels or smaller." };
  }
  return null;
}

/** The public URL path of a stored object. */
export function publicMediaPath(storageKey: string) {
  return `/media/${storageKey}`;
}

/** A safe original filename for display only; never used as a path. */
export function displayFilename(value: string) {
  const base = value.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "image").slice(-255);
}

/**
 * Server-generated, immutable object key: `images/2026/09/<id>.webp`.
 * Replacing an image always creates a new key.
 */
export function storageKeyFor(id: string, format: ImageFormat, now: Date) {
  if (!/^[a-z0-9]+$/.test(id))
    throw new Error("Media ids must be lowercase alphanumeric.");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `images/${now.getUTCFullYear()}/${month}/${id}.${IMAGE_FORMATS[format].extension}`;
}

export const STORAGE_KEY_PATTERN =
  /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-z0-9]+$/;

export function isSafeStorageKey(key: string) {
  return key.length <= 500 && STORAGE_KEY_PATTERN.test(key);
}

const storageKeyPattern = STORAGE_KEY_PATTERN;

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function percent(label: string) {
  return z.preprocess(
    (value) => {
      const normalized = blankToNull(value);
      return typeof normalized === "string" ? Number(normalized) : normalized;
    },
    z
      .number({ error: `Enter the ${label} as a number from 0 to 100.` })
      .min(0, `The ${label} must be between 0 and 100.`)
      .max(100, `The ${label} must be between 0 and 100.`)
      .nullable()
      .default(null),
  );
}

/** Editable details. Focal point is entered as percentages. */
export const mediaDetailsSchema = z
  .object({
    altText: z.string().trim().max(300, "Use 300 characters or fewer."),
    caption: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .max(500, "Use 500 characters or fewer.")
        .nullable()
        .default(null),
    ),
    credit: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .max(300, "Use 300 characters or fewer.")
        .nullable()
        .default(null),
    ),
    focalX: percent("horizontal focal point"),
    focalY: percent("vertical focal point"),
  })
  .superRefine((details, context) => {
    if ((details.focalX === null) !== (details.focalY === null)) {
      context.addIssue({
        code: "custom",
        path: [details.focalX === null ? "focalX" : "focalY"],
        message: "Set both focal point values, or clear both.",
      });
    }
  })
  .transform((details) => ({
    ...details,
    focalX: details.focalX === null ? null : details.focalX / 100,
    focalY: details.focalY === null ? null : details.focalY / 100,
  }));

export type MediaDetailsInput = z.output<typeof mediaDetailsSchema>;

export const altOverrideSchema = z
  .string()
  .trim()
  .max(300, "Use 300 characters or fewer.")
  .nullable();

export type PageSectionMediaRole =
  | "BACKGROUND"
  | "PRIMARY"
  | "GALLERY"
  | "DECORATIVE";

export type SectionMediaSlot = Readonly<{
  role: PageSectionMediaRole;
  label: string;
  multiple: boolean;
}>;

/** Which images each section type may hold. Others hold none. */
export const SECTION_MEDIA_SLOTS: Partial<
  Record<PageSectionType, readonly SectionMediaSlot[]>
> = {
  HERO: [{ role: "BACKGROUND", label: "Background image", multiple: false }],
  RICH_TEXT: [{ role: "PRIMARY", label: "Image", multiple: false }],
  IMAGE_TEXT_SPLIT: [{ role: "PRIMARY", label: "Image", multiple: false }],
  GALLERY: [{ role: "GALLERY", label: "Gallery images", multiple: true }],
  CONTACT_CTA: [
    { role: "BACKGROUND", label: "Background image", multiple: false },
  ],
};

export const mediaAssetSchema = z
  .object({
    storageProvider: z.string().trim().min(1).max(40),
    storageContainer: z.string().trim().min(1).max(100),
    storageKey: z.string().trim().max(500).regex(storageKeyPattern),
    originalFilename: z.string().trim().min(1).max(255),
    mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
    bytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    altText: z.string().trim().max(300),
    focalX: z.number().min(0).max(1).nullable(),
    focalY: z.number().min(0).max(1).nullable(),
    status: z.enum(["PENDING", "READY", "FAILED", "DELETED"]),
  })
  .superRefine((asset, context) => {
    if (asset.status === "READY" && (!asset.width || !asset.height)) {
      context.addIssue({
        code: "custom",
        message: "Ready image media requires positive dimensions.",
        path: ["width"],
      });
    }
  });
