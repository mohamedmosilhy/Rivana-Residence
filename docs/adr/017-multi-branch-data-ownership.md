# ADR 017 — Branch as an explicit owner of catalog, inventory, prices, and reservations

Status: **Accepted** (2026-10-24). **Extended by [ADR 026](./026-branch-websites-and-accommodation.md) (2026-11-06):** pages and facilities become branch-owned, and branch websites use `/{branchSlug}/…` paths (Q-03 and Q-04 answered). The ownership and composite-key decisions below are unchanged.

## Context

Rivana runs one property today (New Cairo). The scope PDF (section 8) requires multiple branches, each with its own information, images, rooms, prices, offers, contact details, and content, and gives branch subdomains as an example. The existing `Room` table is global with a globally unique `slug`.

## Problem

How do branches own data, and how do we stop one branch's inventory or staff from touching another's?

## Options considered

1. **SaaS-style multi-tenancy** (tenant column on every table, row-level security, per-tenant config). Disproportionate for one hotel business.
2. **Shared room types with per-branch configuration** (a global "Studio" type plus a branch link table). Implies the same product exists everywhere. The prompt forbids assuming that, and it makes prices and inventory harder to scope.
3. **Branch-owned room types.** Each `Room` row belongs to exactly one branch. Inventory, prices, and reservations hang off branch-owned rows. Composite foreign keys enforce same-branch relationships.

## Decision

Option 3.

- New `Branch` table. The migration creates one branch from today's site settings, and every existing `Room` gets its `branchId` (expand, backfill, then `NOT NULL`, within one migration; data is preserved).
- `Room` gains `@@unique([id, branchId])`. `PhysicalRoom(roomId, branchId)`, `ReservationRoom(roomId, branchId)`, and `Reservation(branchId)` reference it through composite foreign keys. The database then rejects a reservation line in branch A pointing at a room type in branch B.
- Room slugs stay globally unique. `/rooms/[slug]` URLs stay stable (SEO, existing redirects), and a slug resolves to exactly one branch.
- Branch selection is path-based in the booking journey (`/book/[branchSlug]`). Subdomains (PDF example) are deferred. They need DNS in a Cloudflare zone the client cannot currently access, plus TLS, cookie scope, CSP, and canonical work, and a path prefix can be mapped to a subdomain later. **Needs approval** (Q-03).
- Facilities, pages, and promotions stay global in this release. Branch-specific website content is listed as a later candidate (Q-04).
- Staff are assigned to branches (`StaffBranchAssignment`); see ADR 018.

## Rationale

The simplest model that makes "never use another branch's inventory" a database invariant rather than a convention.

## Consequences

- Every reservation query is branch-scoped. Repositories take a `branchId` and never default it.
- The public site shows a branch selector only when more than one branch is active, so today's single-branch experience is unchanged.
- A deactivated branch disappears from public listings and accepts no new reservations. Its existing reservations stay visible and manageable for authorized staff ([branch-model.md](../domain/branch-model.md)).

## Risks

- A room type that really is shared later (one product sold across branches). Mitigation: duplicate it per branch; it is cheap and keeps the invariant.
