// Media operator commands. Run through `npm run media -- <command>`.
//
//   manifest                      rebuild media-import/reference-manifest.json
//   import [--allow-unconfirmed]  import manifest entries (see below)
//   cleanup                       reconcile database and storage
//
// `import` brings in only IMPORT entries whose rights are APPROVED. The flag
// also imports UNCONFIRMED entries for development and staging; they are
// stored as rights-not-confirmed, so content using them cannot be published.
import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";

import { CleanupMedia } from "../src/application/media/cleanup-media.ts";
import type { IngestDependencies } from "../src/application/media/ingest-image.ts";
import {
  importReferenceAssets,
  type ManifestEntry,
} from "../src/application/media/import-reference-assets.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaMediaRepository } from "../src/infrastructure/db/prisma/repositories/media-repository.ts";
import { Cuid2IdGenerator } from "../src/infrastructure/ids/cuid2-id-generator.ts";
import { LocalMediaStorage } from "../src/infrastructure/media/local-media-storage.ts";
import { NodeHasher } from "../src/infrastructure/media/node-hasher.ts";
import { SharpImageProcessor } from "../src/infrastructure/media/sharp-image-processor.ts";

const SOURCE_DIR = "design/assets/images";
const CURATION = "media-import/curation.json";
const MANIFEST = "media-import/reference-manifest.json";
// Images whose 64-bit difference hashes differ in at most this many bits are
// treated as the same photo (re-crops, re-exports, or renamed copies).
const NEAR_DUPLICATE_BITS = 6;

type Curation = Record<
  string,
  { usage: string; alt: string; usedByReference: string[]; exclude?: string }
>;

async function differenceHash(file: string) {
  const pixels = await sharp(file)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[row * 9 + column]!;
      const right = pixels[row * 9 + column + 1]!;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

function distance(a: bigint, b: bigint) {
  let value = a ^ b;
  let bits = 0;
  while (value) {
    bits += Number(value & 1n);
    value >>= 1n;
  }
  return bits;
}

async function buildManifest() {
  const curation = (
    JSON.parse(await readFile(CURATION, "utf8")) as { assets: Curation }
  ).assets;
  const files = (await readdir(SOURCE_DIR))
    .filter((name) => /\.(jpe?g|png)$/i.test(name))
    .sort();
  const missing = files.filter((name) => !curation[name]);
  if (missing.length > 0)
    throw new Error(`Curate these files first: ${missing.join(", ")}`);

  const scanned = [];
  for (const name of files) {
    const file = path.join(SOURCE_DIR, name);
    const bytes = await readFile(file);
    const metadata = await sharp(bytes).metadata();
    scanned.push({
      name,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: metadata.format ?? "unknown",
      hash: await differenceHash(file),
      curated: curation[name]!,
    });
  }

  // Keep referenced images over unreferenced copies, then alphabetical.
  const preference = [...scanned].sort(
    (a, b) =>
      Number(b.curated.usedByReference.length > 0) -
        Number(a.curated.usedByReference.length > 0) ||
      a.name.localeCompare(b.name),
  );
  const kept: typeof scanned = [];
  const duplicateOf = new Map<string, string>();
  for (const candidate of preference) {
    if (candidate.curated.exclude) continue;
    const match = kept.find(
      (keeper) =>
        keeper.sha256 === candidate.sha256 ||
        distance(keeper.hash, candidate.hash) <= NEAR_DUPLICATE_BITS,
    );
    if (match) duplicateOf.set(candidate.name, match.name);
    else kept.push(candidate);
  }

  const entries: ManifestEntry[] = scanned.map((item) => ({
    source: `${SOURCE_DIR}/${item.name}`,
    sha256: item.sha256,
    width: item.width,
    height: item.height,
    bytes: item.bytes,
    format: item.format,
    intendedUsage: item.curated.usage,
    decision: item.curated.exclude
      ? "EXCLUDED"
      : duplicateOf.has(item.name)
        ? "DUPLICATE"
        : "IMPORT",
    duplicateOf: duplicateOf.has(item.name)
      ? `${SOURCE_DIR}/${duplicateOf.get(item.name)}`
      : null,
    rights: "UNCONFIRMED",
    altDraft: item.curated.alt,
    notes: item.curated.exclude ?? "",
  }));
  await writeFile(
    MANIFEST,
    `${JSON.stringify({ generatedFrom: SOURCE_DIR, entries }, null, 2)}\n`,
  );
  const count = (decision: string) =>
    entries.filter((entry) => entry.decision === decision).length;
  console.log(
    `Manifest: ${entries.length} files — ${count("IMPORT")} to import, ${count("DUPLICATE")} duplicates, ${count("EXCLUDED")} excluded.`,
  );
}

async function withDependencies<T>(
  run: (deps: IngestDependencies) => Promise<T>,
) {
  const databaseUrl =
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const root =
    process.env.MEDIA_STORAGE_ROOT ??
    path.join(os.tmpdir(), "rivana-media-dev");
  const client = new PrismaClient({
    // Timestamps must round-trip in UTC; see src/infrastructure/db/prisma/client.ts.
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      options: "-c TimeZone=UTC",
    }),
  });
  try {
    return await run({
      media: new PrismaMediaRepository(client),
      storage: await LocalMediaStorage.create(path.resolve(root)),
      images: new SharpImageProcessor(),
      hasher: new NodeHasher(),
      ids: new Cuid2IdGenerator(),
      clock: { now: () => new Date() },
    });
  } finally {
    await client.$disconnect();
  }
}

async function importManifest(allowUnconfirmed: boolean) {
  const { entries } = JSON.parse(await readFile(MANIFEST, "utf8")) as {
    entries: ManifestEntry[];
  };
  const outcomes = await withDependencies((deps) =>
    importReferenceAssets(
      deps,
      entries,
      async (source) => new Uint8Array(await readFile(source)),
      {
        allowUnconfirmed,
      },
    ),
  );
  for (const outcome of outcomes) {
    console.log(
      `${outcome.result.padEnd(16)} ${outcome.source} ${outcome.detail}`,
    );
  }
  if (outcomes.some((outcome) => outcome.result === "FAILED"))
    process.exitCode = 1;
}

async function cleanup() {
  const report = await withDependencies((deps) =>
    new CleanupMedia(deps, { now: () => new Date() }).execute(),
  );
  console.log(JSON.stringify(report));
  if (report.errors > 0) process.exitCode = 1;
}

const [command, ...flags] = process.argv.slice(2);
switch (command) {
  case "manifest":
    await buildManifest();
    break;
  case "import":
    await importManifest(flags.includes("--allow-unconfirmed"));
    break;
  case "cleanup":
    await cleanup();
    break;
  default:
    console.error(
      "Usage: npm run media -- manifest | import [--allow-unconfirmed] | cleanup",
    );
    process.exitCode = 2;
}
