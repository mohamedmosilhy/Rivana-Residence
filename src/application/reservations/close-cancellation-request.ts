import type { AuditLog } from "@/application/audit";
import { auditEvent } from "@/domain/audit";
import {
  closedReasonForStaffAction,
  type StaffTerminalAction,
} from "@/domain/reservations";
import type { CancellationRequestStore, StoredReservation } from "./ports";

export type CloseCancellationRequestContext = Readonly<{
  cancellationRequests: Pick<CancellationRequestStore, "closeOpen">;
  audit: AuditLog;
}>;

/** Call within a successful staff transition, with the reservation locked. */
export async function closeCancellationRequest(
  context: CloseCancellationRequestContext,
  reservation: StoredReservation,
  action: StaffTerminalAction,
  staffId: string,
  at: Date,
) {
  const closedReason = closedReasonForStaffAction(action);
  const requestId = await context.cancellationRequests.closeOpen({
    reservationId: reservation.id,
    staffId,
    closedReason,
    at,
  });
  if (requestId === null) return;
  await context.audit.append(
    auditEvent({
      occurredAt: at,
      actorType: "STAFF",
      actorId: staffId,
      action: "cancellation-request.closed",
      entityType: "CancellationRequest",
      entityId: requestId,
      branchId: reservation.branchId,
      reason: closedReason,
      changes: { reservationId: reservation.id, closedReason },
    }),
  );
}
