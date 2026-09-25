import { z } from "zod";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const storageKeyPattern =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/;

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
