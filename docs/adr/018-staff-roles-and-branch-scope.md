# ADR 018 — Staff roles, capabilities, and branch-scoped authorization

Status: **Accepted** (2026-10-24). The `EDITOR` question (Q-01) was **decided on 2026-10-24**: keep it as a CMS-only role. **Extended by ADRs [024](./024-immediate-confirmation.md)–[028](./028-whatsapp-guest-messaging.md) (2026-11-06):** `reservations:decide` is removed (no `PENDING` status); `reservations:pms-entry`, `reservations:cancel-paid`, `cancellations:decide`, `services:manage`, `coupons:manage`, `tax:manage`, and `marketing:broadcast` are added; `promotions:manage` is retired. The current matrix is in [user-roles-and-permissions.md](../requirements/user-roles-and-permissions.md); the role and branch-scope decision below is unchanged.

## Context

Better Auth manages closed staff accounts with database sessions (ADR 004). Rivana stores the role `EDITOR` or `ADMIN` on `User.role` (Postgres enum `AdminRole`). `src/domain/auth/capabilities.ts` maps each role to a set of capabilities, and `authorize()` checks one capability per command. The authorization sweep test proves every protected command checks before it touches data. The scope PDF (section 7) defines Receptionist, Manager, and Admin. The reservation prompt says the CMS is Admin-only and that reservation roles must not gain CMS rights.

## Problem

How are new roles added, how does branch scope work, and what happens to `EDITOR`?

## Options considered

1. Replace roles with a fine-grained permission table editable by admins. Flexible but needs a permissions UI and invites misconfiguration.
2. **Extend the existing role-to-capability map** and add a separate branch-assignment check.

## Decision

Option 2.

- Add `RECEPTIONIST` and `MANAGER` to the role enum (`ALTER TYPE … ADD VALUE`, non-destructive). The TypeScript type is renamed `StaffRole`; the database enum keeps its name to avoid a pointless migration.
- Add reservation capabilities (`reservations:read`, `reservations:create`, `reservations:record-external`, `reservations:decide`, `reservations:modify`, `reservations:cancel`, `reservations:front-desk`, `guests:read`, `inventory:read`, `inventory:block`, `inventory:manage`, `pricing:read`, `pricing:manage`, `pricing:override`, `guests:block`, `reports:read`, `audit:read`, `branches:manage`). The matrix is in [user-roles-and-permissions.md](../requirements/user-roles-and-permissions.md).
- CMS capabilities (`content:*`, `media:*`, `promotions:manage`, `settings:edit`) are **not** granted to Receptionist or Manager.
- Branch scope is checked separately: `authorizeBranch(principal, capability, branchId)`. Admin has implicit access to all branches. Receptionist and Manager have access only through `StaffBranchAssignment` rows, loaded with the session principal on every request.
- Resource lookups are branch-checked after loading. A reservation in a branch the caller cannot access returns `404`, not `403`, so IDs do not reveal what exists. An explicit `branchId` parameter the caller cannot access returns `403`.
- **`EDITOR` (Q-01, decided):** it stays a CMS-only role with no reservation capabilities. Existing editor accounts keep working, and the CMS stays separate from reservations.

## Rationale

It reuses the tested capability model and the authorization sweep. Branch scope is a separate dimension, which keeps the role matrix small.

## Consequences

- `StaffPrincipal` gains `branchIds` (empty for Admin, who is all-branch). Every reservation use case calls `authorizeBranch`.
- The staff CLI (`npm run staff`) and the Admin staff screen gain branch assignment.
- The authorization sweep extends to every reservation command and query, across all roles and an unassigned branch.

## Risks

- A forgotten branch check on a new query. Mitigation: repositories require `branchId` arguments, and the sweep test enumerates use cases.
- Removing a branch assignment does not end live sessions. Mitigation: the principal is reloaded per request, so the change takes effect on the next request.
