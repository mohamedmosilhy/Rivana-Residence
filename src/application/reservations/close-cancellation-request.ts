import type { AuditLog } from "@/application/audit";
import { auditEvent } from "@/domain/audit";
import {
  closedReasonForStaffAction,
  type StaffTerminalAction,
} from "@/domain/reservations";
import type { ChangeRequestStore } from "./change-request-ports";
import type { CancellationRequestStore, StoredReservation } from "./ports";

export type CloseGuestRequestsContext = Readonly<{
  cancellationRequests: Pick<CancellationRequestStore, "closeOpen">;
  changeRequests: Pick<ChangeRequestStore, "closeOpen">;
  audit: AuditLog;
}>;

/** Call within a successful staff transition, with the reservation locked. */
export async function closeGuestRequests(
  context: CloseGuestRequestsContext,
  reservation: StoredReservation,
  action: StaffTerminalAction,
  staffId: string,
  at: Date,
) {
  const closedReason = closedReasonForStaffAction(action);
  const input = {
    reservationId: reservation.id,
    staffId,
    closedReason,
    at,
  };
  const cancellationId = await context.cancellationRequests.closeOpen(input);
  const changeId = await context.changeRequests.closeOpen(input);
  if (cancellationId !== null)
    await context.audit.append(
      auditEvent({
        occurredAt: at,
        actorType: "STAFF",
        actorId: staffId,
        action: "cancellation-request.closed",
        entityType: "CancellationRequest",
        entityId: cancellationId,
        branchId: reservation.branchId,
        reason: closedReason,
        changes: { reservationId: reservation.id, closedReason },
      }),
    );
  if (changeId !== null)
    await context.audit.append(
      auditEvent({
        occurredAt: at,
        actorType: "STAFF",
        actorId: staffId,
        action: "change-request.closed",
        entityType: "ChangeRequest",
        entityId: changeId,
        branchId: reservation.branchId,
        reason: closedReason,
        changes: { reservationId: reservation.id, closedReason },
      }),
    );
}
