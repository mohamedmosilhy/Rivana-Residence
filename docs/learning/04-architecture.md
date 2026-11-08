# 4. Architecture and request flow

## Clean Architecture mapping
| Textbook | Here | Example |
| --- | --- | --- |
| Domain (entities, rules, errors) | `src/domain/<module>` | `domain/branches/branch.ts` |
| Use cases | `src/application/<module>`, one class each | `ListBranches`, `ManageBranches` |
| Repository ports | `ports.ts` per module + `application/ports/` | `BranchRepository` |
| Port implementations | `src/infrastructure/db/prisma/repositories/` | `PrismaBranchRepository` |
| Mappers | `infrastructure/db/prisma/mappers/` | `content-mappers.ts` |
| Service adapters | `infrastructure/email, media, auth, cache` | `NextRouteCacheInvalidator` |
| Controllers | Route Handlers `src/app/api/v1/**/route.ts`, Server Actions (CMS), Server Component pages | |
| DTOs | `src/contracts/api/v1` (Zod, public API shapes) + `src/app/api/v1/_dto` (result -> response mapping) | |

Differences: a hand-written **composition root** (`src/composition`) builds use cases + repos; shared **`_http` wrapper** (`publicRoute`, `staffRoute`, `webhookRoute`); **authorization inside the use case**; use cases return `Result` instead of throwing; Server Components call use cases directly (never their own REST API).

## Traced request: `POST /api/v1/staff/branches`
1. `app/api/v1/staff/branches/route.ts`: ~10 lines, `staffRoute({ body: BranchInput }, ...)`.
2. `_http/routes.ts` `staffRoute`: request id, CSRF (same-origin), resolve session (401), parse body with Zod (422). Does NOT authorize.
3. `composition/api.ts` `createBranch`: builds `ManageBranches`, calls `.create`.
4. `application/branches/manage-branches.ts`: `authorize(staff,"branches:manage")`, domain validation, hero image check, default pages, repository create with audit-event factory (same transaction), conflict mapping, cache invalidation.
5. `domain/branches/branch.ts`: reserved slugs, time format, time zone, cross-field checks.
6. `PrismaBranchRepository`: insert branch + pages + audit in one transaction; DB errors -> `CONFLICT`.
7. Back up as `Result`; `toHttp` -> `201` or `problem+json`.

## Modules
Built: Identity & access, Content/CMS, Branches, Audit. Planned: Inventory (M6), Pricing (M7), Reservations (M8), Payments (M9), Guests, Notifications, Marketing, Reporting. A module's tables are written only by its own repositories; modules talk via ports. Only exception: the booking unit of work (Reservations) may read inventory/pricing, lock the coupon, insert payment/audit/outbox rows.

## Enforced rules (ESLint + architecture tests)
Domain imports nothing from other layers (no Next/React/Prisma/Node I/O); application imports only domain + ports; Prisma only in `infrastructure/db`; `src/app` never imports infrastructure (uses composition); `src/contracts` is Zod-only; route handlers <= 60 lines; Server Actions never call reservation mutation use cases; inject `Clock`/`IdGenerator`.

## Key ADRs
001/009 one Next app, Server Components; 002/003 PostgreSQL, Prisma isolated; 004 Better Auth closed staff sessions; 013 self-managed reservations; 014 versioned REST via Route Handlers, problem+json, OpenAPI from Zod; **016 inventory: row lock + count in one transaction + exclusion constraint**; 017/026 branch-owned data and `/{slug}` sites; 018 roles = capabilities + assignments; 020 date-only stays, cents; 024 immediate confirmation; 025 Paymob holds and verified callbacks; 023 Hostinger VPS.

## Remember
Route -> wrapper -> composition -> use case -> domain/repository -> `Result`. Auth and audit live in the use case. When reviewing, read use case + domain closely; route and repository are mostly mechanical.
