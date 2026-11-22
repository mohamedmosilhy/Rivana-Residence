import type { StaffPrincipal } from "@/application/auth";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  staleVersion,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import type { AuditAction, AuditChanges } from "@/domain/audit";
import type { ReservationUnitOfWork, StoredReservation } from "./ports";
import type { StaffReservationReader } from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

export type OperationDependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<ReservationStorageContext>;
  reads: Pick<StaffReservationReader, "findVisible">;
  clock: Clock;
}>;

export const reservationVersionRequired = () =>
  failure("PRECONDITION_REQUIRED", "Send an If-Match header.");

export function canMarkPmsEntered(row: StoredReservation) {
  return (
    row.source === "WEBSITE" &&
    row.pmsEnteredAt === null &&
    (row.status === "CONFIRMED" || row.status === "CHECKED_IN")
  );
}

export async function lockOperation(
  context: ReservationStorageContext,
  row: StoredReservation,
  expectedVersion?: number,
): Promise<Result<StoredReservation>> {
  const locked = await context.reservations.lockById(row.branchId, row.id);
  if (!locked.ok) return locked;
  const current = locked.value;
  if (!current) return failure("NOT_FOUND", "This reservation was not found.");
  return expectedVersion !== undefined && current.version !== expectedVersion
    ? staleVersion(current.version)
    : success(current);
}

export function auditOperation<Action extends AuditAction>(
  context: ReservationStorageContext,
  row: StoredReservation,
  principal: StaffPrincipal,
  at: Date,
  action: Action,
  changes: AuditChanges[NoInfer<Action>],
  reason: string | null = null,
) {
  return context.audit.append(
    auditEvent({
      occurredAt: at,
      actorType: "STAFF",
      actorId: principal.id,
      action,
      entityType: "Reservation",
      entityId: row.id,
      branchId: row.branchId,
      reason,
      changes,
    }),
  );
}
