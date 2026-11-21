import type { AuditEvent } from "@/domain/audit";

/**
 * Append-only audit log. An adapter bound to a transaction writes the event
 * in that transaction, so a rollback leaves no row (T-AUD-1).
 */
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
}

/** Safe history projection. Raw reason, guest identity and change JSON stay private. */
export type ReservationHistoryItem = Readonly<{
  id: string;
  occurredAt: string;
  action: string;
  actorType: string;
  staffActorId: string | null;
  changes: Readonly<Record<string, string | number | boolean | null>>;
}>;

export interface ReservationHistoryReader {
  listForReservation(
    branchId: string,
    id: string,
  ): Promise<readonly ReservationHistoryItem[]>;
}
