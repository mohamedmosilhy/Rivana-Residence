// Append-only history of sensitive changes (FR-AUD-1). `changes` carries only
// the keys listed for its action below: never free-form dumps, personal data,
// passwords, or tokens.

export const AUDIT_ACTOR_TYPES = ["STAFF", "GUEST", "SYSTEM"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

type RoleChange = Readonly<{ role: Readonly<{ from: string; to: string }> }>;
type BranchChange = Readonly<{ branchId: string }>;
type FieldChange = Readonly<{ from: unknown; to: unknown }>;

/** Each action and the exact shape of its `changes`. */
export type AuditChanges = {
  "staff.role-changed": RoleChange;
  "staff.branch-assigned": BranchChange;
  "staff.branch-unassigned": BranchChange;
  /** A new branch (spec 0002). */
  "branch.created": Readonly<{ slug: string; name: string; status: string }>;
  /** Only the fields that changed, by attribute name. */
  "branch.updated": Readonly<Record<string, FieldChange>>;
  /** A physical unit was added (M6). Notes are never stored in audit. */
  "physical-room.created": Readonly<{
    roomTypeId: string;
    label: string;
    active: boolean;
    notesChanged: boolean;
  }>;
  /** Label and active keep before and after; notes only flag a change. */
  "physical-room.updated": Readonly<{
    label?: Readonly<{ from: string; to: string }>;
    active?: Readonly<{ from: boolean; to: boolean }>;
    notesChanged?: true;
  }>;
};

export type AuditAction = keyof AuditChanges;

export type AuditEvent<A extends AuditAction = AuditAction> = Readonly<{
  occurredAt: Date;
  actorType: AuditActorType;
  /** Staff user id or guest id; null for SYSTEM (the CLI, scheduled jobs). */
  actorId: string | null;
  action: A;
  entityType: "User" | "Branch" | "PhysicalRoom";
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
