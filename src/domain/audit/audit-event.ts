// Append-only history of sensitive changes (FR-AUD-1). `changes` carries only
// the keys listed for its action below: never free-form dumps, personal data,
// passwords, or tokens.

export const AUDIT_ACTOR_TYPES = ["STAFF", "GUEST", "SYSTEM"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

type RoleChange = Readonly<{ role: Readonly<{ from: string; to: string }> }>;
type BranchChange = Readonly<{ branchId: string }>;

/** Each action and the exact shape of its `changes`. */
export type AuditChanges = {
  "staff.role-changed": RoleChange;
  "staff.branch-assigned": BranchChange;
  "staff.branch-unassigned": BranchChange;
};

export type AuditAction = keyof AuditChanges;

export type AuditEvent<A extends AuditAction = AuditAction> = Readonly<{
  occurredAt: Date;
  actorType: AuditActorType;
  /** Staff user id or guest id; null for SYSTEM (the CLI, scheduled jobs). */
  actorId: string | null;
  action: A;
  entityType: "User";
  entityId: string;
  branchId: string | null;
  reason: string | null;
  changes: AuditChanges[A];
}>;

export function auditEvent<A extends AuditAction>(
  event: AuditEvent<A>,
): AuditEvent<A> {
  if (event.actorType !== "SYSTEM" && !event.actorId) {
    throw new Error(`${event.actorType} audit events need an actor id.`);
  }
  if (event.reason !== null && event.reason.length > 500) {
    throw new Error("Audit reasons are limited to 500 characters.");
  }
  return event;
}
