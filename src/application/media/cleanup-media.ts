import type { Clock } from "@/application/ports/providers";

import type { IngestDependencies } from "./ingest-image";

const PENDING_TIMEOUT_MS = 60 * 60 * 1000;
const FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type CleanupReport = {
  abandonedUploads: number;
  orphanedQuarantine: number;
  deletedObjects: number;
  purgedFailed: number;
  errors: number;
};

/**
 * Reconciles the database and storage after interrupted or failed work:
 * uploads that never finished, quarantine files without a live upload,
 * deletions whose object removal failed, and old failed records. Safe to
 * run repeatedly (e.g. hourly from cron).
 */
export class CleanupMedia {
  constructor(
    private readonly deps: Pick<IngestDependencies, "media" | "storage">,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<CleanupReport> {
    const now = this.clock.now().getTime();
    const pendingBefore = new Date(now - PENDING_TIMEOUT_MS);
    const report: CleanupReport = {
      abandonedUploads: 0,
      orphanedQuarantine: 0,
      deletedObjects: 0,
      purgedFailed: 0,
      errors: 0,
    };
    const { media, storage } = this.deps;
    const candidates = await media.cleanupCandidates(
      pendingBefore,
      new Date(now - FAILED_RETENTION_MS),
    );

    for (const { id } of candidates.stalePending) {
      await media.markFailed(id, "The upload did not finish.");
      await storage.discardQuarantine(id);
      report.abandonedUploads += 1;
    }

    for (const upload of await storage.listQuarantine()) {
      if (upload.modifiedAt >= pendingBefore) continue;
      const asset = await media.findAdminById(upload.uploadId);
      if (asset?.status === "PENDING") continue;
      await storage.discardQuarantine(upload.uploadId);
      report.orphanedQuarantine += 1;
    }

    for (const { id, storageKey } of candidates.deleted) {
      try {
        await storage.delete(storageKey);
        await media.purge(id);
        report.deletedObjects += 1;
      } catch {
        report.errors += 1;
      }
    }

    for (const { id } of candidates.failed) {
      await media.purge(id);
      report.purgedFailed += 1;
    }
    return report;
  }
}
