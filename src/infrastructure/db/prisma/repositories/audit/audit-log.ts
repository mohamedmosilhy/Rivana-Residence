import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type { AuditLog } from "@/application/audit";
import type { AuditEvent } from "@/domain/audit";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

/**
 * Append-only: this adapter only inserts. Constructed with a transaction
 * client, the row commits or rolls back with the change it records.
 */
export class PrismaAuditLog implements AuditLog {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async append(event: AuditEvent) {
    await this.client.auditEvent.create({
      data: {
        id: createId(),
        occurredAt: event.occurredAt,
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        branchId: event.branchId,
        reason: event.reason,
        changes: event.changes as Prisma.InputJsonObject,
      },
    });
  }
}
