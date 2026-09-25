import { describe, expect, it } from "vitest";

import type { MediaStorage } from "@/application/ports/providers";

async function* chunks(...parts: string[]) {
  for (const part of parts) yield new TextEncoder().encode(part);
}

async function text(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

/**
 * The behaviour every MediaStorage adapter must provide. The local adapter
 * runs it today; a future S3-compatible adapter must pass it unchanged.
 */
export function describeMediaStorageContract(
  name: string,
  create: () => Promise<MediaStorage>,
) {
  describe(`${name} storage contract`, () => {
    it("writes, reads, opens ranges of, and deletes an object", async () => {
      const storage = await create();
      await storage.put(
        "images/2026/09/abcdef12.jpg",
        new TextEncoder().encode("0123456789"),
      );

      const whole = await storage.open("images/2026/09/abcdef12.jpg");
      expect(whole?.size).toBe(10);
      expect(await text(whole!.stream)).toBe("0123456789");

      const part = await storage.open("images/2026/09/abcdef12.jpg", {
        start: 2,
        end: 5,
      });
      expect(await text(part!.stream)).toBe("2345");

      await storage.delete("images/2026/09/abcdef12.jpg");
      expect(await storage.open("images/2026/09/abcdef12.jpg")).toBeNull();
      // Deleting again is not an error.
      await storage.delete("images/2026/09/abcdef12.jpg");
    });

    it("never overwrites an existing object", async () => {
      const storage = await create();
      await storage.put(
        "images/2026/09/fixedkey.png",
        new TextEncoder().encode("first"),
      );
      await expect(
        storage.put(
          "images/2026/09/fixedkey.png",
          new TextEncoder().encode("second"),
        ),
      ).rejects.toThrow();
      expect(
        await text((await storage.open("images/2026/09/fixedkey.png"))!.stream),
      ).toBe("first");
    });

    it("streams uploads into quarantine with a size cap", async () => {
      const storage = await create();
      expect(
        await storage.writeQuarantine("upload0001", chunks("abc", "def"), 10),
      ).toEqual({
        ok: true,
        bytes: 6,
      });
      expect(
        new TextDecoder().decode(await storage.readQuarantine("upload0001")),
      ).toBe("abcdef");
      expect(
        (await storage.listQuarantine()).map((item) => item.uploadId),
      ).toContain("upload0001");

      expect(
        await storage.writeQuarantine(
          "upload0002",
          chunks("12345", "67890", "x"),
          10,
        ),
      ).toEqual({
        ok: false,
        reason: "TOO_LARGE",
      });
      // An oversized upload leaves nothing behind.
      expect(
        (await storage.listQuarantine()).map((item) => item.uploadId),
      ).not.toContain("upload0002");

      await storage.discardQuarantine("upload0001");
      await storage.discardQuarantine("upload0001");
      expect(await storage.listQuarantine()).toEqual([]);
    });

    it("refuses a second upload with the same id", async () => {
      const storage = await create();
      await storage.writeQuarantine("upload0003", chunks("a"), 10);
      await expect(
        storage.writeQuarantine("upload0003", chunks("b"), 10),
      ).rejects.toThrow();
    });

    it.each([
      "../outside.jpg",
      "/etc/passwd.jpg",
      "images/../../outside.jpg",
      "quarantine/upload0001.jpg",
      "images/x",
    ])("refuses the key %o", async (key) => {
      const storage = await create();
      await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow();
      await expect(storage.open(key)).rejects.toThrow();
      await expect(storage.delete(key)).rejects.toThrow();
    });

    it.each(["../x", "UPPERCASE1", "a/b/cdefgh", "short"])(
      "refuses the upload id %o",
      async (uploadId) => {
        const storage = await create();
        await expect(
          storage.writeQuarantine(uploadId, chunks("a"), 10),
        ).rejects.toThrow();
      },
    );

    it("returns null for a missing object", async () => {
      const storage = await create();
      expect(await storage.open("images/2026/09/missing1.jpg")).toBeNull();
    });
  });
}
