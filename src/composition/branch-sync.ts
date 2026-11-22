import "server-only";

import {
  GetSyncStatus,
  RecordSyncCheckpoint,
  type SyncCheckpointContext,
} from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaSyncCheckpointRepository } from "@/infrastructure/db/prisma/repositories/reservations/sync-checkpoint-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

export function staffBranchSync() {
  const client = getPrisma();
  const clock: Clock = { now: () => new Date() };
  return {
    getStatus: new GetSyncStatus({
      reader: new PrismaSyncCheckpointRepository(client),
      clock,
    }),
    recordCheckpoint: new RecordSyncCheckpoint({
      unitOfWork: new PrismaReservationUnitOfWork<SyncCheckpointContext>(
        client,
        (transaction) => ({
          branches: new PrismaBranchRepository(transaction),
          checkpoints: new PrismaSyncCheckpointRepository(transaction),
          audit: new PrismaAuditLog(transaction),
        }),
      ),
      clock,
      ids: new Cuid2IdGenerator(),
    }),
  };
}
