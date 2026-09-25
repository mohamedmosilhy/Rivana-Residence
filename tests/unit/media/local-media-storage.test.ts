// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LocalMediaStorage } from "@/infrastructure/media/local-media-storage";

import { describeMediaStorageContract } from "../../support/media-storage-contract";

const roots: string[] = [];

async function freshRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "rivana-storage-test-"));
  roots.push(root);
  return root;
}

afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

describeMediaStorageContract("Local filesystem", async () =>
  LocalMediaStorage.create(await freshRoot()),
);

describe("local filesystem containment", () => {
  it("refuses a symlinked directory that points outside the root", async () => {
    const root = await freshRoot();
    const outside = await freshRoot();
    const storage = await LocalMediaStorage.create(root);
    await mkdir(path.join(root, "images"));
    await symlink(outside, path.join(root, "images", "2026"));

    await expect(
      storage.put("images/2026/09/escape01.jpg", new Uint8Array([1])),
    ).rejects.toThrow("links");
    await writeFile(path.join(outside, "secret.jpg"), "secret");
    await expect(storage.open("images/2026/secret.jpg")).rejects.toThrow(
      "links",
    );
    await expect(storage.delete("images/2026/secret.jpg")).rejects.toThrow(
      "links",
    );
    expect(await readdir(outside)).toEqual(["secret.jpg"]);
  });

  it("refuses to read an object that is itself a symlink", async () => {
    const root = await freshRoot();
    const outside = await freshRoot();
    const storage = await LocalMediaStorage.create(root);
    await writeFile(path.join(outside, "secret.jpg"), "secret");
    await mkdir(path.join(root, "images"));
    await symlink(
      path.join(outside, "secret.jpg"),
      path.join(root, "images", "link0001.jpg"),
    );

    await expect(storage.open("images/link0001.jpg")).rejects.toThrow();
  });

  it("refuses a quarantine directory replaced by a link", async () => {
    const root = await freshRoot();
    const outside = await freshRoot();
    const storage = await LocalMediaStorage.create(root);
    await rm(path.join(root, "quarantine"), { recursive: true });
    await symlink(outside, path.join(root, "quarantine"));

    async function* one() {
      yield new Uint8Array([1]);
    }
    await expect(
      storage.writeQuarantine("upload0009", one(), 10),
    ).rejects.toThrow("links");
    expect(await readdir(outside)).toEqual([]);
  });

  it("creates private files and directories", async () => {
    const root = await freshRoot();
    const storage = await LocalMediaStorage.create(root);
    await storage.put("images/2026/09/perm0001.jpg", new Uint8Array([1]));
    const file = await stat(path.join(root, "images/2026/09/perm0001.jpg"));
    expect(file.mode & 0o777).toBe(0o640);
    // No temporary files are left beside the object.
    expect(await readdir(path.join(root, "images/2026/09"))).toEqual([
      "perm0001.jpg",
    ]);
  });

  it("refuses a root inside the application directory when asked", async () => {
    const app = await freshRoot();
    await expect(
      LocalMediaStorage.create(path.join(app, "media"), { forbidInside: app }),
    ).rejects.toThrow("outside the application directory");
    await expect(LocalMediaStorage.create("relative/media")).rejects.toThrow(
      "absolute",
    );
    const separate = await freshRoot();
    await expect(
      LocalMediaStorage.create(separate, { forbidInside: app }),
    ).resolves.toBeInstanceOf(LocalMediaStorage);
  });
});
