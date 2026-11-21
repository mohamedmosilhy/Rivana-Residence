import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type { AuditLog, ReservationHistoryReader } from "@/application/audit";
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

export class PrismaReservationHistoryReader
  implements ReservationHistoryReader
{
  constructor(private readonly client: DatabaseClient) {}

  async listForReservation(branchId: string, id: string) {
    const rows = await this.client.auditEvent.findMany({
      where: { branchId, entityId: id, entityType: "Reservation" },
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        occurredAt: true,
        action: true,
        actorId: true,
        actorType: true,
        changes: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      actorType: row.actorType,
      staffActorId: row.actorType === "STAFF" ? row.actorId : null,
      changes: reservationChanges(row.action, row.changes),
    }));
  }
}

const CANCELLATION_REASON_CODES: ReadonlySet<string> = new Set([
  "GUEST_REQUEST",
  "CROSS_SYSTEM_CONFLICT",
  "INVALID_DETAILS",
  "OTHER",
]);

function reservationChanges(action: string, changes: Prisma.JsonValue) {
  const safe: Record<string, string | number | boolean | null> = {};
  if (
    (action !== "reservation.created" &&
      action !== "reservation.staff-created" &&
      action !== "reservation.stay-modified" &&
      action !== "reservation.cancelled" &&
      action !== "reservation.pms-update-entered") ||
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes)
  )
    return safe;
  for (const key of [
    "totalMinor",
    "units",
    "priceOverridden",
    "confirmationRequested",
    "oldTotalMinor",
    "newTotalMinor",
    "overrideFromMinor",
    "overrideToMinor",
    "flagPmsUpdate",
    "changeSeq",
    "couponReleased",
    "guestNotified",
    "noteProvided",
  ] as const) {
    const value = changes[key];
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    )
      safe[key] = value;
  }
  // The cancellation reason is a fixed code, never the free text note.
  if (
    action === "reservation.cancelled" &&
    typeof changes.reason === "string" &&
    CANCELLATION_REASON_CODES.has(changes.reason)
  )
    safe.reason = changes.reason;
  return safe;
}
