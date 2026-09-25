import type { AdminRole } from "@/domain/shared/types";

export const CAPABILITIES = [
  "admin:access",
  "content:edit",
  "content:publish",
  "content:archive",
  "media:upload",
  "media:delete",
  "promotions:manage",
  "enquiries:read",
  "enquiries:manage",
  "settings:edit",
  "users:manage",
  "sessions:manage-own",
  "sessions:revoke-any",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Editors run day-to-day content work. Administrators additionally own
// destructive media removal, site/integration settings, and staff access.
const EDITOR_CAPABILITIES: readonly Capability[] = [
  "admin:access",
  "content:edit",
  "content:publish",
  "content:archive",
  "media:upload",
  "promotions:manage",
  "enquiries:read",
  "enquiries:manage",
  "sessions:manage-own",
];

const ROLE_CAPABILITIES: Record<AdminRole, ReadonlySet<Capability>> = {
  EDITOR: new Set(EDITOR_CAPABILITIES),
  ADMIN: new Set(CAPABILITIES),
};

export function roleHasCapability(role: AdminRole, capability: Capability) {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function capabilitiesFor(role: AdminRole): readonly Capability[] {
  return CAPABILITIES.filter((capability) =>
    ROLE_CAPABILITIES[role].has(capability),
  );
}
