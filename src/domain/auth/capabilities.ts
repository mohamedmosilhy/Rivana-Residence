import type { StaffRole } from "@/domain/shared/types";

// The authoritative capability matrix is
// docs/requirements/user-roles-and-permissions.md (ADR 018). Every reservation,
// inventory, pricing, service, coupon, cancellation, marketing, and report
// capability is additionally checked against branch scope with
// `authorizeBranch`.
export const CAPABILITIES = [
  "admin:access",
  "content:edit",
  "content:publish",
  "content:archive",
  "content:delete",
  "media:upload",
  "media:delete",
  "media:rights",
  "enquiries:read",
  "enquiries:manage",
  "settings:edit",
  "users:manage",
  "sessions:manage-own",
  "sessions:revoke-any",
  "reservations:read",
  "reservations:create",
  "reservations:record-external",
  "reservations:pms-entry",
  "reservations:modify",
  "reservations:cancel",
  "reservations:cancel-paid",
  "reservations:front-desk",
  "cancellations:decide",
  "guests:read",
  "guests:block",
  "inventory:read",
  "inventory:block",
  "inventory:manage",
  "pricing:read",
  "pricing:manage",
  "pricing:override",
  "services:manage",
  "coupons:manage",
  "tax:manage",
  "marketing:broadcast",
  "reports:read",
  "audit:read",
  "branches:manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Editors run day-to-day content work and nothing else (Q-01). Administrators
// additionally own permanent deletion, settings, staff access, and every
// reservation capability.
const EDITOR_CAPABILITIES: readonly Capability[] = [
  "admin:access",
  "content:edit",
  "content:publish",
  "content:archive",
  "media:upload",
  "enquiries:read",
  "enquiries:manage",
  "sessions:manage-own",
];

// Front desk at assigned branches. No CMS capability. Enquiries are limited
// to the receptionist's branches (Q-26).
const RECEPTIONIST_CAPABILITIES: readonly Capability[] = [
  "admin:access",
  "enquiries:read",
  "enquiries:manage",
  "sessions:manage-own",
  "reservations:read",
  "reservations:create",
  "reservations:record-external",
  "reservations:pms-entry",
  "reservations:modify",
  "reservations:cancel",
  "reservations:front-desk",
  "guests:read",
  "inventory:read",
  "inventory:block",
  "pricing:read",
];

// Branch management at assigned branches. No CMS capability.
const MANAGER_CAPABILITIES: readonly Capability[] = [
  ...RECEPTIONIST_CAPABILITIES,
  "reservations:cancel-paid",
  "cancellations:decide",
  "guests:block",
  "inventory:manage",
  "pricing:manage",
  "pricing:override",
  "services:manage",
  "coupons:manage",
  "marketing:broadcast",
  "reports:read",
  "audit:read",
];

const ROLE_CAPABILITIES: Record<StaffRole, ReadonlySet<Capability>> = {
  EDITOR: new Set(EDITOR_CAPABILITIES),
  ADMIN: new Set(CAPABILITIES),
  RECEPTIONIST: new Set(RECEPTIONIST_CAPABILITIES),
  MANAGER: new Set(MANAGER_CAPABILITIES),
};

export function roleHasCapability(role: StaffRole, capability: Capability) {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function capabilitiesFor(role: StaffRole): readonly Capability[] {
  return CAPABILITIES.filter((capability) =>
    ROLE_CAPABILITIES[role].has(capability),
  );
}

/** Roles whose data access is limited to their assigned branches. */
export function isBranchScopedRole(role: StaffRole) {
  return role === "RECEPTIONIST" || role === "MANAGER";
}
