import sharp, { type Metadata } from "sharp";

import type { ImageInfo, ImageProcessor } from "@/application/ports/providers";
import { MEDIA_UPLOAD_POLICY } from "@/domain/media/media-asset";

// libvips refuses to allocate for images above this size, which stops
// decompression bombs before any pixels are decoded.
const PIXEL_LIMIT = MEDIA_UPLOAD_POLICY.maxPixels;

function formatOf(metadata: Metadata): ImageInfo["format"] | null {
  switch (metadata.format) {
    case "jpeg":
    case "png":
    case "webp":
      return metadata.format;
    case "heif":
      return metadata.compression === "av1" ? "avif" : null;
    default:
      return null;
  }
}

export class SharpImageProcessor implements ImageProcessor {
  async inspect(bytes: Uint8Array): Promise<ImageInfo | null> {
    try {
      const metadata = await sharp(bytes, {
        failOn: "error",
        limitInputPixels: false,
      }).metadata();
      const format = formatOf(metadata);
      if (!format || !metadata.width || !metadata.height) return null;
      return {
        format,
        width: metadata.width,
        height: metadata.height,
        pages: metadata.pages ?? 1,
      };
    } catch {
      return null;
    }
  }

  async sanitize(bytes: Uint8Array, format: ImageInfo["format"]) {
    // A full decode + re-encode: rejects truncated or corrupt data, applies
    // EXIF orientation, and drops all metadata (sharp strips it unless
    // withMetadata() is called) and anything appended to the file.
    let pipeline = sharp(bytes, {
      failOn: "error",
      limitInputPixels: PIXEL_LIMIT,
    }).rotate();
    switch (format) {
      case "jpeg":
        pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
        break;
      case "png":
        pipeline = pipeline.png({ compressionLevel: 9 });
        break;
      case "webp":
        pipeline = pipeline.webp({ quality: 90 });
        break;
      case "avif":
        pipeline = pipeline.avif({ quality: 65 });
        break;
    }
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      bytes: new Uint8Array(data),
      width: info.width,
      height: info.height,
    };
  }
}
