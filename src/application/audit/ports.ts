import type { AuditEvent } from "@/domain/audit";

/**
 * Append-only audit log. An adapter bound to a transaction writes the event
 * in that transaction, so a rollback leaves no row (T-AUD-1).
 */
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
}
