# M4 — Backend foundations and branch data ownership

Status: **Not started.** Branch: `m4-backend-foundations`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Lay the plumbing every later milestone uses (REST layer, error model, contracts, OpenAPI, roles, branch-scoped authorization, audit) and give existing content an owning branch in the database, **without any visible change to the public site or the CMS**.

## Read first

- ADRs [014](../../adr/014-rest-api-route-handlers.md), [015](../../adr/015-reservation-module-structure.md), [017](../../adr/017-multi-branch-data-ownership.md), [018](../../adr/018-staff-roles-and-branch-scope.md), [022](../../adr/022-deployment-transaction-compatibility.md), [026](../../adr/026-branch-websites-and-accommodation.md)
- [api/rest-api-conventions.md](../../api/rest-api-conventions.md), [api/error-model.md](../../api/error-model.md)
- [requirements/user-roles-and-permissions.md](../../requirements/user-roles-and-permissions.md)
- [database/data-model.md](../../database/data-model.md) (changes to existing tables; `Branch`, `StaffBranchAssignment`, `AuditEvent`)
- [architecture/dependency-rules.md](../../architecture/dependency-rules.md) (D-1a, D-7…D-12)
- Next.js guides for Route Handlers and `proxy` in `node_modules/next/dist/docs/`

## Blocking questions

- Q-26 (receptionist and manager access to enquiries): recommendation accepted unless the client says otherwise. Nothing ★ blocks M4.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`CROSS-CUTTING` for the HTTP layer and error model; `ENHANCEMENT` for the migration) | One spec `docs/specs/NNNN-m4-backend-foundations.md` covering both parts |
| Build | `/develop` (logic track) | No UI track except the CMS navigation tweak |
| Tests | `/test` | Unit and integration as listed; the existing E2E suites must stay green |
| Failures | `/debug` | Expect enum `ADD VALUE` and backfill quirks |
| Proof | `/check verify` | Call `/api/v1/health`; sign in as Receptionist and Manager; inspect backfilled rows |
| Review | `/check review` | Focus: CSRF, error leakage, authorization before data access |
| After merge | `/sync` | Create `src/app/api/AGENTS.md` (Route Handler rules) with a sibling `CLAUDE.md` containing `@AGENTS.md` |

## In scope

1. Shared HTTP layer for `/api/v1`.
2. Contracts folder, OpenAPI generation, health endpoint.
3. Roles, capabilities, branch assignments, `authorizeBranch`.
4. One additive migration giving rooms, facilities, pages, and enquiries a branch, plus the accommodation type columns.
5. Architecture boundary rules for the new modules.

## Out of scope (binding)

- Any public route change, branch chooser, or `/{branch}` URL (M5).
- Branch admin screens, staff role editing screens (M5, M12).
- Inventory, prices, reservations, payments (M6+).
- Removing the promotion popup (M5).

## Tasks

### 1. HTTP layer (`src/app/api/v1/_http/`)

1. `parseJson(request, { maxBytes })`: rejects non-JSON content types with `415 UNSUPPORTED_MEDIA_TYPE`, bodies over the cap with `413 PAYLOAD_TOO_LARGE`, broken JSON with `400 MALFORMED_JSON`.
2. `validate(schema, value)`: Zod `.strict()` schemas; failures become `422 VALIDATION` with `fieldErrors` keyed by path.
3. CSRF check for cookie-authenticated mutations: reuse `isSameOriginRequest`; refuse with `403 CROSS_SITE_REQUEST`.
4. Wrappers:
   - `publicRoute(handler, { rateLimit? })` — no principal; optional rate limit using `LoginThrottle` with a namespaced HMAC key.
   - `staffRoute(handler)` — resolves `getCurrentStaff()`; `401` when signed out. Authorization stays in the use case.
   - `webhookRoute(handler)` — no CSRF and no session; passes the **raw body bytes** and headers to the handler for signature checks (used by M9).
5. `problem(code, …)` serializer producing RFC 9457 bodies; a single mapping table from `ApplicationErrorCode` to HTTP status ([error-model.md](../../api/error-model.md)). Unexpected errors return `500 INTERNAL` with only `requestId`.
6. Request id (header `X-Request-Id`, generated when absent) and a redacting logger: one line per request (method, route pattern, status, duration, principal id or `public`, branch id). Never bodies, tokens, cookies, or `Authorization`.

### 2. Contracts, OpenAPI, health

1. `src/contracts/api/v1/primitives.ts`: `Money`, `Stay`, `Occupancy`, `Problem`; Zod only, no other imports.
2. `scripts/openapi.mts` builds `docs/api/openapi.json` with `z.toJSONSchema()`; a unit test regenerates in memory and fails if the committed file differs.
3. `GET /api/v1/health` → `200 { status: "ok", database: "ok" }` after a `SELECT 1`; `503` with a problem body when the database is unreachable. No version or environment details.

### 3. Roles, capabilities, branch scope

1. Add `RECEPTIONIST` and `MANAGER` to the `AdminRole` enum (own migration if Prisma's SQL needs it outside a transaction); rename the TypeScript type `StaffRole`.
2. Extend `src/domain/auth/capabilities.ts` with every capability in the matrix in [user-roles-and-permissions.md](../../requirements/user-roles-and-permissions.md), including `reservations:pms-entry`, `reservations:cancel-paid`, `cancellations:decide`, `coupons:manage`, `services:manage`, `tax:manage`, `marketing:broadcast`. Remove nothing that existing code uses; `promotions:manage` stays until M5 retires it.
3. `authorizeBranch(principal, capability, branchId)` in `src/application/auth/`: Admin passes for every branch; Receptionist and Manager only for assigned branches; Editor never (no reservation capabilities).
4. `StaffPrincipal.branchIds` loaded with the session on every request.
5. Staff CLI (`scripts/staff-admin.ts`): `--role RECEPTIONIST|MANAGER`, `assign-branch --email … --branch <slug>`, `unassign-branch`; the last active Admin rule unchanged.
6. Admin navigation (`src/presentation/admin/navigation.ts`): Receptionist and Manager see no CMS destinations (they already lack the capabilities; this is a convenience).

### 4. Migration `branches_and_staff_roles`

Expand, backfill, then constrain, in one reviewed migration (plus a separate enum migration if needed):

1. `Branch` table with the attributes in [branch-model.md](../../domain/branch-model.md): slug (unique; check against the reserved list `admin, api, media, reservations, book, sitemap.xml, robots.txt` and the legacy `*.html` paths), name, summary, status, `onlineBookingEnabled` (false), time zone, currency `USD`, contact and address, coordinates, `mapEmbedUrl`, `checkInTime`, `checkOutTime`, `heroMediaId`, sync interval and follow-up columns with their checks, `sortOrder`, audit columns.
2. Insert the first branch from `SiteSettings` (name, contact, address, coordinates, map embed URL, time zone). Slug `new-cairo`.
3. `Room.branchId` (backfilled, then `NOT NULL`), `@@unique([id, branchId])`, index `(branchId, status, sortOrder)`.
4. `Room.accommodationType` enum `ROOM | APARTMENT` default `ROOM`; `Room.bedroomCount`, `Room.bathroomCount` nullable small integers with `CHECK (… IS NULL OR … >= 0)`.
5. `Facility.branchId` (backfilled, `NOT NULL`), index `(branchId, status, sortOrder)`.
6. `Page.branchId` (backfilled, `NOT NULL`); replace unique `key` with unique `(branchId, key)`; `canonicalPath` uniqueness becomes `(branchId, canonicalPath)`.
7. `ContactEnquiry.branchId` nullable (existing rows stay null).
8. `StaffBranchAssignment`, `AuditEvent` as in the data model.
9. No renames, no drops. `Promotion` untouched.

### 5. Repositories and queries

1. Content repositories accept a `branchId` for rooms, facilities, and pages. Public queries resolve the single active branch internally in M4, so `/`, `/rooms`, `/about`, and the rest render exactly as before.
2. CMS room and facility forms get a branch field that is preselected and read-only while only one branch exists.
3. `AuditLog` port and Prisma adapter (`append` only); the runtime role grant to forbid `UPDATE`/`DELETE` is a Phase 12 task, recorded in the report.

### 6. Boundaries

1. ESLint rules and architecture tests D-1a, D-7…D-12 ([dependency-rules.md](../../architecture/dependency-rules.md)).
2. Replace the `booking scope` test in `tests/unit/architecture/persistence-boundaries.test.ts` with a test that reservation-module tables are referenced only from allowed infrastructure folders.

## Database impact

Migration(s): `…_staff_roles_enum` (if required) and `…_branches_and_staff_roles`. Additive only. Data preserved: every existing room, facility, page, and enquiry keeps its content; rooms, facilities, and pages get the first branch.

## API impact

`GET /api/v1/health`. The OpenAPI document exists and is tested.

## Acceptance criteria

1. All existing unit, integration, and E2E suites pass unchanged (public and CMS behavior identical; visual baselines unchanged).
2. `GET /api/v1/health` returns `200` with the database up and `503` problem+json with it down.
3. The HTTP layer returns the documented status and problem body for: non-JSON (`415`), oversize (`413`), malformed JSON (`400`), unknown field (`422`), foreign `Origin` on a staff mutation (`403 CROSS_SITE_REQUEST`), signed out (`401`).
4. Receptionist and Manager accounts created with the CLI can sign in, see no CMS destinations, and are refused (`403` or denied page) on every CMS route and action.
5. `authorizeBranch` allows Admin everywhere, allows Receptionist and Manager only on assigned branches, and refuses Editor; a principal with no assignment sees no branch data.
6. After migrating a copy of seeded data: one branch `new-cairo` exists with the settings' contact and map data, and every room, facility, and page references it; `migrate diff` reports no drift.
7. A branch slug equal to a reserved segment is rejected by the domain schema.
8. `docs/api/openapi.json` is committed and the freshness test passes.
9. No log line produced by the HTTP layer contains a body, cookie, token, or `Authorization` value (test with captured logs).

## Tests

- Unit: capability matrix table test (T-AUTHZ-1); `authorizeBranch` cases; problem mapping table; each wrapper's refusal paths (T-HTTP-1…6 as unit tests over `Request` objects); reserved branch slugs; OpenAPI freshness (T-ARCH-4); boundary rules (T-ARCH-1…3).
- Integration (real PostgreSQL): migration backfill on seeded data (T-DB-1, T-DB-2); unique `(branchId, key)` on pages; audit append in a transaction rolled back leaves no row (T-AUD-1); health handler with database up.
- E2E: Receptionist denied on CMS routes (E2E-A-2, first part); existing suites unchanged.

## Evidence for the report

Gate counts; the migration SQL with comments; before and after row counts for rooms, facilities, and pages; OpenAPI excerpt; a log sample showing redaction; screenshots of the Receptionist's empty dashboard.

## Risks

- `ALTER TYPE … ADD VALUE` inside Prisma's transaction: split the migration.
- Changing `Page`'s unique key can break upserts in seeds and CMS writes: run the full integration suite.
- Prisma drift with SQL-only checks: verify with `migrate diff`.

## Handoff

Report, then stop. M5 has not started.
