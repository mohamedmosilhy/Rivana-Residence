import "server-only";

import type { LastSyncCheckpointReader } from "@/application/inventory";
import type {
  SyncStatusSnapshot,
  SyncStatusReader,
  SyncCheckpointWriter,
} from "@/application/reservations";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export class PrismaSyncCheckpointRepository
  implements SyncStatusReader, SyncCheckpointWriter, LastSyncCheckpointReader
{
  constructor(private readonly client: DatabaseClient) {}

  async append(checkpoint: Parameters<SyncCheckpointWriter["append"]>[0]) {
    await this.client.branchSyncCheckpoint.create({ data: checkpoint });
  }

  async read(branchId: string): Promise<Date | null> {
    const latest = await this.client.branchSyncCheckpoint.findFirst({
      where: { branchId, kind: "COMPLETED" },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    });
    return latest?.recordedAt ?? null;
  }

  async readStatus(branchId: string): Promise<SyncStatusSnapshot | null> {
    // Keep settings, checkpoint actor and backlog in one statement snapshot.
    const [row] = await this.client.$queryRaw<SyncStatusSnapshot[]>`
      SELECT b."syncReminderIntervalMinutes" AS "intervalMinutes",
             b."syncFollowUpMinutes" AS "followUpMinutes",
             completed."recordedAt" AS "lastCompletedAt",
             completed."recordedById" AS "lastCompletedBy",
             started."recordedAt" AS "lastStartedAt",
             backlog."notEnteredInHotelSystem", backlog."oldestNotEnteredAt"
      FROM "Branch" b
      LEFT JOIN LATERAL (
        SELECT c."recordedAt", c."recordedById"
        FROM "BranchSyncCheckpoint" c
        WHERE c."branchId" = b.id AND c.kind = 'COMPLETED'
        ORDER BY c."recordedAt" DESC, c.id DESC
        LIMIT 1
      ) completed ON TRUE
      LEFT JOIN LATERAL (
        SELECT c."recordedAt"
        FROM "BranchSyncCheckpoint" c
        WHERE c."branchId" = b.id AND c.kind = 'STARTED'
        ORDER BY c."recordedAt" DESC
        LIMIT 1
      ) started ON TRUE
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS "notEnteredInHotelSystem",
               min(r."createdAt") AS "oldestNotEnteredAt"
        FROM "Reservation" r
        WHERE r."branchId" = b.id AND r.source = 'WEBSITE'
          AND r.status IN ('CONFIRMED', 'CHECKED_IN') AND r."pmsEnteredAt" IS NULL
      ) backlog
      WHERE b.id = ${branchId}
    `;
    return row ?? null;
  }
}
