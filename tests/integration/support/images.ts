import { crc32 } from "node:zlib";

import sharp from "sharp";

export async function image(
  format: "jpeg" | "png" | "webp" | "avif",
  options: Partial<{ width: number; height: number; color: string }> = {},
) {
  const pipeline = sharp({
    create: {
      width: options.width ?? 64,
      height: options.height ?? 48,
      channels: 3,
      background: options.color ?? "#3f1930",
    },
  });
  return new Uint8Array(await pipeline[format]().toBuffer());
}

export async function animatedWebp() {
  const frames = await Promise.all(
    ["#ff0000", "#0000ff"].map((color) =>
      sharp({
        create: { width: 32, height: 32, channels: 3, background: color },
      })
        .png()
        .toBuffer(),
    ),
  );
  return new Uint8Array(
    await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer(),
  );
}

export async function jpegWithExif() {
  return new Uint8Array(
    await sharp({
      create: { width: 64, height: 48, channels: 3, background: "#123456" },
    })
      .withExif({
        IFD0: { Artist: "Secret Photographer", Copyright: "GPS 30.0,31.4" },
      })
      .jpeg()
      .toBuffer(),
  );
}

/**
 * A tiny PNG whose header claims enormous dimensions: the classic
 * decompression bomb. The header CRC is recomputed so decoders accept it.
 */
export async function pngClaiming(width: number, height: number) {
  const png = Buffer.from(await image("png", { width: 16, height: 16 }));
  // IHDR data starts at byte 16 (8 signature + 4 length + 4 type).
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return new Uint8Array(png);
}

export async function* stream(bytes: Uint8Array) {
  // Deliver in several chunks, like a network upload.
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    yield bytes.subarray(offset, offset + 4096);
  }
}
