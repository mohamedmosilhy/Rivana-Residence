import { randomBytes } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import type {
  ByteRange,
  MediaStorage,
  StoredObject,
} from "@/application/ports/providers";
import { isSafeStorageKey } from "@/domain/media/media-asset";

const QUARANTINE_DIR = "quarantine";
const UPLOAD_ID = /^[a-z0-9]{8,40}$/;
const DIRECTORY_MODE = 0o750;
const FILE_MODE = 0o640;
// Read-only opens refuse to follow a symlink at the final path component.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
// Exclusive create: never truncates or follows an existing file or link.
const CREATE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  (constants.O_NOFOLLOW ?? 0);

export class StorageSecurityError extends Error {}
export class ObjectExistsError extends Error {}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Stores media below one configured root. Every path is built from a
 * validated, server-generated key, re-checked to stay inside the canonical
 * root, and walked to refuse symlinks, so a planted link cannot redirect a
 * read, write, or delete outside the root.
 */
export class LocalMediaStorage implements MediaStorage {
  readonly provider = "local";
  readonly container = "media";

  private constructor(private readonly root: string) {}

  /**
   * Prepares the root. In production the root must be outside `forbidInside`
   * (the application checkout), so a deployment can never replace uploads.
   */
  static async create(
    root: string,
    options: Readonly<{ forbidInside?: string }> = {},
  ) {
    if (!path.isAbsolute(root)) {
      throw new StorageSecurityError(
        "The media root must be an absolute path.",
      );
    }
    await mkdir(root, { recursive: true, mode: DIRECTORY_MODE });
    const canonical = await realpath(root);
    if (!(await stat(canonical)).isDirectory()) {
      throw new StorageSecurityError("The media root is not a directory.");
    }
    if (options.forbidInside) {
      const forbidden = await realpath(options.forbidInside);
      const relative = path.relative(forbidden, canonical);
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
        throw new StorageSecurityError(
          "The media root must be outside the application directory.",
        );
      }
    }
    await mkdir(path.join(canonical, QUARANTINE_DIR), {
      recursive: true,
      mode: DIRECTORY_MODE,
    });
    return new LocalMediaStorage(canonical);
  }

  async writeQuarantine(
    uploadId: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
  ): Promise<{ ok: true; bytes: number } | { ok: false; reason: "TOO_LARGE" }> {
    const target = await this.quarantinePath(uploadId);
    const handle = await open(target, CREATE_FLAGS, FILE_MODE);
    let bytes = 0;
    let tooLarge = false;
    try {
      for await (const chunk of source) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          tooLarge = true;
          break;
        }
        await handle.write(chunk);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (tooLarge) {
      await this.discardQuarantine(uploadId);
      return { ok: false, reason: "TOO_LARGE" };
    }
    return { ok: true, bytes };
  }

  async readQuarantine(uploadId: string) {
    const handle = await open(await this.quarantinePath(uploadId), READ_FLAGS);
    try {
      return new Uint8Array(await handle.readFile());
    } finally {
      await handle.close();
    }
  }

  async discardQuarantine(uploadId: string) {
    try {
      await unlink(await this.quarantinePath(uploadId));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async listQuarantine() {
    const directory = path.join(this.root, QUARANTINE_DIR);
    const entries = await readdir(directory, { withFileTypes: true });
    const uploads = [];
    for (const entry of entries) {
      const uploadId = entry.name.replace(/\.upload$/, "");
      if (!entry.isFile() || !UPLOAD_ID.test(uploadId)) continue;
      const info = await lstat(path.join(directory, entry.name));
      uploads.push({ uploadId, modifiedAt: info.mtime });
    }
    return uploads;
  }

  async put(key: string, bytes: Uint8Array) {
    const target = this.objectPath(key);
    const directory = path.dirname(target);
    await this.ensureDirectory(directory);

    // Write a private temporary file, then hard-link it into place. link()
    // is atomic and fails if the key exists, so objects are never replaced.
    const temporary = path.join(
      directory,
      `.tmp-${randomBytes(8).toString("hex")}`,
    );
    const handle = await open(temporary, CREATE_FLAGS, FILE_MODE);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ObjectExistsError(`Object already exists: ${key}`);
      }
      throw error;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async open(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const target = this.objectPath(key);
    try {
      await this.assertNoLinks(path.dirname(target));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    let handle;
    try {
      handle = await open(target, READ_FLAGS);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const { size } = await handle.stat();
    const stream = createReadStream("", {
      fd: handle,
      ...(range ? { start: range.start, end: range.end } : {}),
    });
    return {
      size,
      stream: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    };
  }

  async delete(key: string) {
    const target = this.objectPath(key);
    try {
      await this.assertNoLinks(path.dirname(target));
      await unlink(target);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private async quarantinePath(uploadId: string) {
    if (!UPLOAD_ID.test(uploadId)) {
      throw new StorageSecurityError("Invalid upload id.");
    }
    const directory = path.join(this.root, QUARANTINE_DIR);
    await this.assertNoLinks(directory);
    return path.join(directory, `${uploadId}.upload`);
  }

  private objectPath(key: string) {
    if (!isSafeStorageKey(key) || key.startsWith(`${QUARANTINE_DIR}/`)) {
      throw new StorageSecurityError("Invalid storage key.");
    }
    const target = path.resolve(this.root, key);
    const relative = path.relative(this.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new StorageSecurityError("Storage key escapes the media root.");
    }
    return target;
  }

  /**
   * Creates `directory` one segment at a time below the root, checking each
   * existing segment first, so a planted link can never make mkdir create
   * anything outside the root.
   */
  private async ensureDirectory(directory: string) {
    const relative = path.relative(this.root, directory);
    let current = this.root;
    for (const segment of relative ? relative.split(path.sep) : []) {
      current = path.join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory()) {
          throw new StorageSecurityError("Media paths may not contain links.");
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        try {
          await mkdir(current, { mode: DIRECTORY_MODE });
        } catch (mkdirError) {
          // Another request created it first; re-check it on the next pass.
          if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST")
            throw mkdirError;
          const info = await lstat(current);
          if (info.isSymbolicLink() || !info.isDirectory()) {
            throw new StorageSecurityError(
              "Media paths may not contain links.",
            );
          }
        }
      }
    }
  }

  /** Refuses any symlink between the root and `directory` (inclusive). */
  private async assertNoLinks(directory: string) {
    const relative = path.relative(this.root, directory);
    let current = this.root;
    for (const segment of relative ? relative.split(path.sep) : []) {
      current = path.join(current, segment);
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new StorageSecurityError("Media paths may not contain links.");
      }
    }
  }
}
