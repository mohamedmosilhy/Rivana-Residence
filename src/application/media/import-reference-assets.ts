import type { MediaAssetDto } from "@/application/ports/repositories";

import { ingestImage, type IngestDependencies } from "./ingest-image";

export type ManifestDecision =
  | "IMPORT"
  | "DUPLICATE"
  | "BRAND_ASSET"
  | "EXCLUDED";
export type RightsState = "APPROVED" | "UNCONFIRMED";

export type ManifestEntry = Readonly<{
  source: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  intendedUsage: string;
  decision: ManifestDecision;
  duplicateOf: string | null;
  rights: RightsState;
  altDraft: string;
  notes: string;
}>;

export type ImportOutcome = Readonly<{
  source: string;
  result: "IMPORTED" | "ALREADY_IMPORTED" | "SKIPPED" | "FAILED";
  detail: string;
  asset?: MediaAssetDto;
}>;

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

async function* once(bytes: Uint8Array) {
  yield bytes;
}

/**
 * Imports manifest entries through the same verification pipeline as staff
 * uploads. Only IMPORT entries are considered; entries whose rights are not
 * APPROVED are skipped unless `allowUnconfirmed` is set (for staging and
 * development), and are then stored UNCONFIRMED so content using them cannot
 * be published. Re-running skips anything already imported.
 */
export async function importReferenceAssets(
  deps: IngestDependencies,
  entries: readonly ManifestEntry[],
  readSource: (source: string) => Promise<Uint8Array>,
  options: Readonly<{ allowUnconfirmed: boolean }>,
): Promise<ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  for (const entry of entries) {
    const reference = `reference:${entry.source}`;
    if (entry.decision !== "IMPORT") {
      outcomes.push({
        source: entry.source,
        result: "SKIPPED",
        detail: `Decision is ${entry.decision}.`,
      });
      continue;
    }
    if (entry.rights !== "APPROVED" && !options.allowUnconfirmed) {
      outcomes.push({
        source: entry.source,
        result: "SKIPPED",
        detail: "Usage rights are not approved.",
      });
      continue;
    }
    const existing = await deps.media.findBySourceReference(reference);
    if (existing?.status === "READY") {
      outcomes.push({
        source: entry.source,
        result: "ALREADY_IMPORTED",
        detail: existing.id,
        asset: existing,
      });
      continue;
    }

    const bytes = await readSource(entry.source);
    const result = await ingestImage(deps, {
      filename: entry.source.split("/").pop() ?? "image",
      declaredType: MIME_BY_FORMAT[entry.format] ?? "application/octet-stream",
      declaredBytes: bytes.byteLength,
      source: once(bytes),
      altText: entry.altDraft,
      rightsStatus: entry.rights === "APPROVED" ? "CONFIRMED" : "UNCONFIRMED",
      sourceReference: reference,
      createdById: null,
    });
    outcomes.push(
      result.ok
        ? {
            source: entry.source,
            result: "IMPORTED",
            detail: result.value.id,
            asset: result.value,
          }
        : {
            source: entry.source,
            result: "FAILED",
            detail: result.error.message,
          },
    );
  }
  return outcomes;
}
