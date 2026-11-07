# 0001. Backend foundations and branch data ownership (M4)

**Date**: 2026-11-06
**Status**: Accepted (owner, 2026-11-06; cross checked by a second model, fixes applied)

## Summary

This spec turns the M4 brief into exact build choices. It adds a shared HTTP layer for `/api/v1` (one way to parse bodies, validate, refuse cross site requests, report errors, and log), Zod contracts with a generated OpenAPI document, and a health endpoint. It also adds the Receptionist and Manager roles with branch scoped checks, an append only audit log, and one database migration that gives every room, facility, and page an owning branch. Nothing changes for visitors, Editors, or Admins. The spec records local choices only: business rules come from the brief, the ADRs, and the question register.

## Context

Rivana is one Next.js 16 application (ADR 001) with a working CMS that uses Server Actions. Reservations need a reusable REST API (ADR 014), branch owned data (ADR 017, extended by ADR 026), new staff roles with branch scope (ADR 018), and code that works with transaction scoped database primitives only (ADR 022). Today there is one Route Handler with JSON replies (`src/app/admin/(protected)/media/upload/route.ts`), and it builds its error bodies by hand. Every later milestone would copy that style unless a standard exists first.

The database is global: `Room`, `Facility`, and `Page` have no branch, and `Page.key` is unique on its own. Making them branch owned touches live content (rooms, facilities, pages with sections and media), the seeds, the E2E fixtures, and every content repository. The public site and the CMS must look and behave exactly as before (brief AC-1).

`User.role` is a Postgres enum `AdminRole` with `EDITOR` and `ADMIN`. Adding values with `ALTER TYPE … ADD VALUE` has a known limit: the new value cannot be used in the same transaction that adds it. Prisma runs each migration file in one transaction.

If you leave these choices to the build, each handler invents its own error shape and logging, branch checks get written per use case in different ways, and the migration risks breaking unique keys the seeds and CMS rely on.

## Requirements

**User stories**:
- As a future API client (the booking UI, staff screens), I want every `/api/v1` endpoint to answer with one documented JSON and error shape, so I can handle every failure the same way.
- As an Admin, I want to create Receptionist and Manager accounts and assign them to branches from the staff CLI, so front desk staff can sign in before their tools exist.
- As the owner, I want every room, facility, and page to belong to the New Cairo branch with no visible change, so branch websites (M5) can build on real data.

**Acceptance criteria** (from the brief, verbatim in meaning):
- **AC-1**: All existing unit, integration, and E2E suites pass (public and CMS behavior identical; visual baselines unchanged). Test call sites may change only mechanically for new repository signatures.
- **AC-2**: `GET /api/v1/health` returns `200 {"status":"ok","database":"ok"}` with the database up and `503` `application/problem+json` with it down.
- **AC-3**: The HTTP layer returns the documented status and problem body for non JSON (`415 UNSUPPORTED_MEDIA_TYPE`), oversize (`413 PAYLOAD_TOO_LARGE`), malformed JSON (`400 MALFORMED_JSON`), unknown field (`422 VALIDATION`), foreign `Origin` on a staff mutation (`403 CROSS_SITE_REQUEST`), and signed out (`401 UNAUTHENTICATED`).
- **AC-4**: Receptionist and Manager accounts created with the CLI can sign in, see no CMS destinations, and get the denied page (or a refused action) on every CMS route and action: pages, rooms, facilities, media, promotions, settings, staff. They see Overview and Enquiries only.
- **AC-5**: `authorizeBranch` allows Admin everywhere, allows Receptionist and Manager only on assigned branches, and refuses Editor; a principal with no assignment sees no branch data (enquiry lists are empty for them).
- **AC-6**: After migrating a copy of seeded data, one branch `new-cairo` exists with the settings' contact and map data, every room, facility, and page references it, and `prisma migrate diff` reports no drift.
- **AC-7**: A branch slug equal to a reserved segment (or ending in `.html`) is rejected by the domain schema (and by a database `CHECK`).
- **AC-8**: `docs/api/openapi.json` is committed and the freshness unit test passes.
- **AC-9**: No log line produced by the HTTP layer contains a body, cookie, token, or `Authorization` value (proved with captured logs).
- **AC-10**: The architecture rules D-1a and D-7 to D-12 are enforced by ESLint or architecture tests, and the old `booking scope` test is replaced (brief task 6).
- **AC-11**: Audit events can be appended inside a transaction; a rolled back transaction leaves no audit row (T-AUD-1).

## Options considered

### Option 1: Shared wrappers plus one problem serializer, enforced by tests (chosen)

Every handler is built with `publicRoute`, `staffRoute`, or `webhookRoute` from `src/app/api/v1/_http/`. The wrappers own body parsing, validation, CSRF, principal resolution, request ids, logging, and problem mapping. An architecture test fails any `route.ts` under `src/app/api/v1` that exports a method not built from a wrapper.

**Pros**:
- One place to fix security behavior (CSRF, size caps, error leakage).
- Handlers stay at a few lines (D-10), and tests can call them with plain `Request` objects.

**Cons**:
- A small framework of our own to learn and maintain.
- The wrapper signature must stay stable as M8 and M9 add idempotency and `If-Match`.

### Option 2: Helper functions each handler calls itself

Handlers call `parseJson`, `validate`, `checkCsrf`, and `problem` explicitly.

**Pros**:
- No indirection; each handler reads top to bottom.

**Cons**:
- A forgotten call (CSRF, logging) is silent; review is the only guard.
- Repeats the same 15 lines in every handler, against D-10.

### Option 3: Do it in `proxy.ts`

Put CSRF, request ids, and logging in the Next.js proxy.

**Pros**:
- Runs before every route.

**Cons**:
- The proxy cannot see the result status of the use case or the principal, so it cannot write the log line the brief asks for.
- The Next docs warn that matcher changes silently remove coverage; security must sit next to the handler.

For the migration, the choice is fixed by the brief and ADR 017: expand, backfill, then constrain, in one reviewed migration (plus a separate enum migration).

## Decision

**Chosen option**: Option 1: shared wrappers plus one problem serializer, enforced by tests (basis: ADR 014 consequences; `docs/api/rest-api-conventions.md`, handler anatomy).

Every `/api/v1` handler is built from one of three wrappers. Every error is serialized by one `problem()` function using one code to status table. Every branch check goes through `authorizeBranch`. The branch migration follows expand, backfill, constrain.

**Implementation skills**: `develop` (`JavaScript-Mastery-Pro/skills`, `.claude/skills/develop/`) · `test` (`JavaScript-Mastery-Pro/skills`, `.claude/skills/test/`)

## Rationale

The forces are: security must be uniform (CSRF and error leakage are the review focus for this milestone), handlers must stay thin (D-10), and later milestones (M8, M9) will add idempotency keys, `If-Match`, and webhook signatures. Wrappers put each of those in one place, and unit tests over `Request` objects prove them once. Option 2 relies on every author remembering every call. Option 3 cannot see the use case result or the principal.

Keeping authorization inside use cases (not a `capability` option on the wrapper) is deliberate. The brief says "Authorization stays in the use case", and the authorization sweep test only covers use cases. The wrapper only answers "is anyone signed in" (`401`). This differs from the illustrative `capability` field in the conventions document; the brief wins, and the docs update in step 11 will align the example.

For the migration, expand, backfill, then constrain keeps every statement safe on live data (basis: safe migration sequence for a running system), and a separate enum migration avoids the `ADD VALUE` transaction limit.

## Standard definition

**Canonical pattern** (every handler under `src/app/api/v1/**/route.ts`):

```ts
// src/app/api/v1/health/route.ts
import { publicRoute, json } from "@/app/api/v1/_http";
import { checkHealth } from "@/composition/api";

export const GET = publicRoute({ route: "/api/v1/health" }, async () => {
  const result = await checkHealth();
  return result.ok
    ? json(200, result.value)
    : result; // a failed Result is mapped by the wrapper through problem()
});
```

```ts
// Staff mutation, illustrative for M8+
export const POST = staffRoute(
  { route: "/api/v1/staff/things", body: createThingBody },
  async ({ staff, body, setBranch }) => {
    setBranch(body.branchId); // for the log line only
    return toHttp(await things().create(staff, body), {
      ok: (value) => json(201, toThingDto(value)),
    });
  },
);
```

Wrapper contract:

| Wrapper | Before the handler | Handler gets |
| --- | --- | --- |
| `publicRoute(options, handler)` | request id; optional rate limit (`options.rateLimit = { name, rule }`); body parse and validation when `options.body` is set | `{ request, requestId, params, body, query }` |
| `staffRoute(options, handler)` | request id; CSRF check on `POST`, `PUT`, `PATCH`, `DELETE`; principal from the session cookie (`401` when none); body parse and validation | the same plus `staff: StaffPrincipal` and `setBranch(id)` |
| `webhookRoute(options, handler)` | request id; reads the raw body as `Uint8Array` with the size cap; no session, no CSRF | `{ request, requestId, params, rawBody, headers }` |

Every wrapper also:
- Maps a returned failed `Result` through `problem()`, and maps a thrown error to `500 INTERNAL` with only `requestId`. `detail` only ever comes from a returned `ApplicationError` (messages written by our use cases and repositories); a thrown error never reaches the body. The thrown error goes to one `console.error` JSON line holding only `requestId`, the error `name`, and the stack frames with the first (message) line removed, because driver messages can embed query values.
- Refuses before any handler code runs: a `413`, `415`, `400`, or CSRF `403` never calls the handler.
- Sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `X-Request-Id` on every response.
- Writes one log line when the response is ready.

Fixed local choices:

| Concern | Choice |
| --- | --- |
| Body cap | 32 KB default (`options.maxBytes` may lower it). `Content-Length` over the cap is refused before reading; the stream is also counted, so a lying or missing length is still refused at the cap |
| Content type | A request with a body must send `application/json` (parameters such as `charset` allowed); otherwise `415`. A body is expected on `POST`, `PUT`, `PATCH` when `options.body` is set |
| Validation | Schemas are Zod `.strict()` objects. Issues become `422 VALIDATION` with `fieldErrors` keyed by the dotted path (`guest.email`; a root issue uses `_root`). Messages never echo the submitted value |
| Query | `options.query` (a strict schema over `URLSearchParams` entries); failure is `400 INVALID_QUERY` |
| CSRF | `isSameOriginRequest` (moved to `src/composition/http.ts`, re-exported from `composition/media.ts`): `Origin` must equal the `APP_URL` origin, and `Sec-Fetch-Site`, when present, must be `same-origin`. Refusal: `403 CROSS_SITE_REQUEST` |
| Request id | Keep an incoming `X-Request-Id` only if it matches `^[A-Za-z0-9._-]{1,64}$`; otherwise generate `crypto.randomUUID()` |
| Problem body | `type` is `https://rivanaresidence.com/problems/<code in lower case with hyphens>`; `title` is a fixed safe text per code; `detail` is the use case message when it is safe (application messages are written for users); `status`, `code`, `requestId`; `fieldErrors` for `422`; `context` when given |
| Status table | One `const` map from every `ApplicationErrorCode` plus the transport codes to a status, exactly as in `docs/api/error-model.md`. Existing codes without a row there: `INVALID_CREDENTIALS` → 401, `NOT_PUBLISHABLE` → 422, `REFERENCED` → 409. A unit test checks that every code has a row |
| `Retry-After` | Set for `429` and `503` (health uses 5 seconds; rate limits use the lock time left) |
| Log line | One JSON line via `console.info` with exactly `requestId`, `method`, `route` (the `options.route` pattern, never the raw URL), `status`, `durationMs`, `principal` (staff id or `public`), `branchId` (or `null`). The sink is injectable for tests. Nothing else is ever logged by the wrapper |
| Health probe | `SELECT 1` raced against a 2 second timeout; a timeout or error is `TRY_AGAIN` (503 with `Retry-After: 5`, as the error model requires for 503) |
| Rate limit | Kept because the brief lists it, although no M4 route uses it. Reuses `LoginThrottleStore` and the domain `recordFailure` rule: each request counts as one hit, and reaching `maxFailures` in the window locks the key for `lockMs` (a window limit with a lockout). Key: `rl:<name>:` plus an HMAC of the client address (`HmacThrottleKeys.namespaced`). When the client address is unknown (proxy headers not trusted), no per client limit applies, the same as sign in today. A locked key returns `429 RATE_LIMITED` |

**Replaces**:
- Hand built JSON error bodies such as `reply(status, { message })` in Route Handlers under `/api/v1` (the existing media upload route is outside `/api/v1` and stays as it is).
- Per handler status mapping chains (`code === "FORBIDDEN" ? 403 : …`).
- Logging request bodies or headers anywhere in the HTTP layer.

**Enforcement**:
- Architecture test `tests/unit/architecture/route-handlers.test.ts`: every `route.ts` under `src/app/api/v1` exports only wrapper results (the text `= publicRoute(`, `= staffRoute(`, or `= webhookRoute(` for each exported method), imports nothing from `@/infrastructure` or `@/generated/prisma`, and fails above 60 lines (D-10). The text match can be bypassed; review remains the backstop.
- Unit tests over `Request` objects for each refusal (T-HTTP-1 to 6) and for log redaction.
- Review checklist (D-10).

**Rollout**: New code immediately. No `/api/v1` code exists yet.

**Exceptions**: Routes outside `/api/v1` (`/admin/(protected)/media/upload`, `/media/[...key]`) keep their current shape. Moving them is not in M4 scope.

## Feature design

**Data model sketch** (migration target; types per `docs/database/data-model.md`):

| Table | Change |
| --- | --- |
| `AdminRole` enum | `+ RECEPTIONIST`, `+ MANAGER` (separate migration `…_staff_roles_enum`) |
| `BranchStatus` enum | `ACTIVE`, `INACTIVE` |
| `AccommodationType` enum | `ROOM`, `APARTMENT` |
| `Branch` (new) | `id VARCHAR(32)` PK; `slug VARCHAR(80)` unique; `name VARCHAR(120)`; `summary VARCHAR(300)?`; `status BranchStatus` default `ACTIVE`; `onlineBookingEnabled` default `false`; `timeZone VARCHAR(100)` default `Africa/Cairo`; `currency CHAR(3)` default `USD`; `phone`, `email`, `addressLine1`, `addressLine2`, `city`, `country`, `latitude DECIMAL(9,6)`, `longitude DECIMAL(9,6)` (same types as `SiteSettings`), all nullable; `checkInTime VARCHAR(5)?`, `checkOutTime VARCHAR(5)?`; `mapEmbedUrl VARCHAR(2048)?` (same as `SiteSettings`); `heroMediaId VARCHAR(32)?` FK `MediaAsset` RESTRICT; `syncReminderIntervalMinutes INT` default 30; `syncFollowUpMinutes INT` default 10; `sortOrder INT`; `createdAt`, `updatedAt`, `updatedById?` FK `User` RESTRICT |
| `StaffBranchAssignment` (new) | PK `(userId, branchId)`; `userId` FK `User` CASCADE; `branchId` FK `Branch` RESTRICT; `createdAt`; `createdById VARCHAR(32)?` (no FK, survives user removal); index `branchId` |
| `AuditEvent` (new) | as in data-model.md: `id`, `occurredAt`, `actorType VARCHAR(16)`, `actorId?` (no FK), `action VARCHAR(80)`, `entityType VARCHAR(40)`, `entityId VARCHAR(32)`, `branchId?` (no FK, history survives), `reason VARCHAR(500)?`, `changes JSONB?`; indexes `(entityType, entityId, occurredAt)` and `(branchId, occurredAt)`; `CHECK actorType IN ('STAFF','GUEST','SYSTEM')` |
| `Room` | `+ branchId NOT NULL` FK `Branch` RESTRICT; `@@unique([id, branchId])` (Prisma name `Room_id_branchId_key`); `@@index([branchId, status, sortOrder])`; `+ accommodationType` default `ROOM`; `+ bedroomCount SMALLINT?`, `+ bathroomCount SMALLINT?` with `CHECK (… IS NULL OR … >= 0)`; the SQL only partial unique index `Room_active_sortOrder_key` on `(sortOrder) WHERE status <> 'ARCHIVED'` is replaced by `Room_branch_active_sortOrder_key` on `(branchId, sortOrder) WHERE status <> 'ARCHIVED'` |
| `Facility` | `+ branchId NOT NULL` FK RESTRICT; `@@index([branchId, status, sortOrder])`; `Facility_active_sortOrder_key` replaced by `Facility_branch_active_sortOrder_key` on `(branchId, sortOrder) WHERE status <> 'ARCHIVED'` |
| `Page` | `+ branchId NOT NULL` FK RESTRICT; unique `key` (`Page_key_key`) becomes `@@unique([branchId, key])` (`Page_branchId_key_key`); unique `canonicalPath` (`Page_canonicalPath_key`) becomes `@@unique([branchId, canonicalPath])` (`Page_branchId_canonicalPath_key`); the existing `Page_canonicalPath_check` stays |
| `ContactEnquiry` | `+ branchId` nullable FK `Branch` RESTRICT; index `(branchId, createdAt)` |

SQL only `CHECK`s on `Branch` (comments in the migration): slug format `^[a-z0-9]+(-[a-z0-9]+)*$`; slug not in `('admin','api','media','reservations','book','sitemap.xml','robots.txt')` and `slug NOT LIKE '%.html'`; `checkInTime` and `checkOutTime` null or `^([01][0-9]|2[0-3]):[0-5][0-9]$`; sync interval 10 to 240, follow up 5 to 60, and follow up less than interval; `currency = 'USD'`.

**First branch**: id `cwiuqp6uf1q5i1ic4vhawnmw` (a CUID2 generated once and written into the migration, because SQL cannot generate CUID2; exported in code as `DEFAULT_BRANCH_ID` from the seed module), slug `new-cairo`, `sortOrder` 0, `status` `ACTIVE`, `onlineBookingEnabled` false. Values come from the `SiteSettings` row `default` when it exists: `name` from `siteName` (both `VARCHAR(120)`, so no truncation), `summary` from `tagline` cut to 300 characters, plus `timeZone`, phone, email, address lines, city, country, coordinates, `mapEmbedUrl`. Without that row: name `Rivana Residence` and the column defaults. The insert is `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM "Branch" WHERE slug = 'new-cairo')`, so it always yields exactly one branch, even on a fresh database. The seed (`prisma/seed-data.ts`) upserts the same branch by slug and returns its id to the page upserts.

**Accepted drift until M5**: the public site keeps reading contact, address, and map data from `SiteSettings`. Editing those settings in the CMS does not update the branch copy. M5 switches the site to `Branch`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/health` | GET | none | `{ status: "ok", database: "ok" }` | public, no rate limit | `503 TRY_AGAIN` problem with `Retry-After: 5` |

No other endpoint ships in M4. The wrappers are proved by unit tests with test only handlers.

**Contracts** (`src/contracts/api/v1/`, Zod only, D-7):
- `primitives.ts`: `Money` `{ amountMinor: int ≥ 0, currency: "USD" }`; `Stay` `{ checkIn, checkOut }` as `YYYY-MM-DD` strings; `Occupancy` `{ adults: int ≥ 1, children: int ≥ 0 }`; `Problem` (the RFC 9457 body above).
- `health.ts`: `HealthResponse`.
- `routes.ts`: a registry list `{ method, path, operationId, summary, security: "public" | "staff" | "webhook", request?, responses: { status: schema }, errors: code[] }`.
- `openapi.ts`: `buildOpenApiDocument()`, a pure function that returns the OpenAPI 3.1 object with `z.toJSONSchema()` for each schema (`info.title` "Rivana Residence API", `info.version` "1.0.0"). `scripts/openapi.mts` writes it to `docs/api/openapi.json` with two space indentation and a final newline; `npm run openapi` runs it. The freshness test compares `JSON.stringify(build(), null, 2) + "\n"` to the committed file.

**Value sourcing**:

| Action | Value produced / displayed | Source |
| --- | --- | --- |
| health | `database: "ok"` | `DatabaseProbe.ping()` running `SELECT 1` |
| any wrapper | `requestId` | incoming `X-Request-Id` when it matches the safe pattern, else `crypto.randomUUID()` |
| any wrapper | log `route` | `options.route` given by the handler file |
| staffRoute | `staff` | `resolveStaffSession(auth, directory, request.headers)` through `composition/api.ts` |
| staffRoute | log `branchId` | `setBranch()` called by the handler, else `null` |
| session | `StaffPrincipal.branchIds` | `StaffBranchAssignment` rows loaded by `StaffDirectory.findById`; forced to `[]` for Admin |
| CSRF | expected origin | `APP_URL` from the server environment |
| rate limit | client key | client address from `X-Forwarded-For` / `X-Real-IP` only when `AUTH_TRUST_PROXY_HEADERS` is true (same as today) |
| public queries (pages, rooms, facilities, sitemap) | branch | `BranchRepository.findDefaultActive()`: lowest `sortOrder` (then `id`) among `ACTIVE` branches. None found: the query returns the same empty result as an unpublished item today (`null` or `[]`, so the page 404s or the list is empty) |
| CMS commands and lists | branch | `BranchRepository.findDefault()`: lowest `sortOrder` (then `id`), any status. A branch sent by the form is ignored. None found: lists are empty and creates return `NOT_FOUND` "No branch exists. Run the seed." |
| admin overview, media usage | counts and usage rows | stay global in M4 (only roles with `content:edit` or media capabilities reach them) |
| CMS form | branch field text | branch name from `findDefault()`, shown read only |
| enquiry list | visible rows | `branchScope(staff)`: `"ALL"` for Admin and Editor; `branchIds` for Receptionist and Manager (rows with null branch are never in a list of ids) |
| audit append | `occurredAt` | the caller's `Clock`; `id` from CUID2 in the adapter |

**Key invariants**:
- Every room, facility, and page has a branch (`NOT NULL`, FK).
- A page key is unique within a branch; a room and facility slug stays globally unique (ADR 017, ADR 026).
- A reserved slug can never be stored (domain schema plus `CHECK`).
- `authorize` runs before any repository call in every use case; `authorizeBranch` runs `authorize` first.
- `AuditEvent` rows are only inserted by the adapter (`append` only). Revoking `UPDATE` and `DELETE` from the runtime role is a Phase 12 task.
- Audit `changes` holds only keys the domain event type lists for that action (for example `{ role: { from, to } }` or `{ branchId }`). Never free form dumps, personal data, passwords, or tokens.
- Room and facility `sortOrder` is unique per branch among non archived rows; new rows go to the end of their branch; a reorder list must hold exactly that branch's non archived ids.
- Every `PageRepository` method takes `branchId` and addresses a page by `{ branchId_key: { branchId, key } }`; no lookup by `key` alone remains. `findPublishedBySlug(branchId, slug)` also filters by branch, although slugs stay globally unique.
- Editors deliberately see every enquiry (`branchScope` is `"ALL"` for Editor) while `authorizeBranch` refuses them. Enquiries stay with Editors per Q-26 and the matrix; do not "fix" this.
- Staff `GET` handlers never change data, so CSRF checks apply only to `POST`, `PUT`, `PATCH`, `DELETE`.

**Security model**:
- Capabilities: the matrix in `docs/requirements/user-roles-and-permissions.md`, transcribed exactly into `src/domain/auth/capabilities.ts`. Editor and Admin keep every capability they have today. Admin holds every capability. `promotions:manage` stays (Editor, Admin) until M5. Receptionist and Manager get `enquiries:read` and `enquiries:manage` (Q-26), and the matrix's `inventory:manage` stays Manager and Admin only.
- `authorizeBranch(principal, capability, branchId)`: `UNAUTHENTICATED` when signed out; `FORBIDDEN` when the role lacks the capability; Admin passes; Editor gets `FORBIDDEN` (no branch scope); Receptionist and Manager pass only when `branchId` is in `branchIds`, else `FORBIDDEN`. Use cases that load a resource first map an out of scope resource to `NOT_FOUND` (ADR 018); that applies from M6.
- Enquiry archive: Receptionist or Manager archiving an enquiry outside their scope gets `NOT_FOUND`.
- CMS pages keep their existing capability guards (`requireStaff(path, capability)` and the `DeniedPage`); the new roles lack those capabilities, so they get the existing denied page, and CMS Server Actions return the existing `FORBIDDEN` result through `authorizeAction`.
- Overview (`/admin`): the page checks `roleHasCapability(staff.role, "content:edit")`. Without it, the page renders a minimal staff home (title "Overview", "Welcome back, {name}.", and one line: "Front desk tools will appear here in a later release.") with no CMS shortcuts, and `getAdminOverview()` is not called. The check lives in the page; the overview use case is unchanged.
- Enquiries (`/admin/enquiries`, existing): `ListEnquiries` passes `branchScope(staff)` to `listAdminPage`; the archive command loads the enquiry's `branchId` and returns `NOT_FOUND` when it is outside the scope.

**Staff CLI rules** (`scripts/staff-admin.ts`, `scripts/staff.mts`):
- `create --role RECEPTIONIST|MANAGER [--branch <slug>]…` accepts a repeatable `--branch`; `--branch` with `ADMIN` or `EDITOR` is refused.
- `assign-branch --email … --branch <slug>` and `unassign-branch --email … --branch <slug>` are idempotent (assigning twice or removing a missing assignment succeeds with a note), refuse an unknown slug, refuse Admin and Editor accounts, and allow an `INACTIVE` branch. `createdById` is null for the CLI.
- `set-role` to `ADMIN` or `EDITOR` removes the user's assignments in the same transaction; the last active Admin rule is unchanged.
- Role and assignment changes append an `AuditEvent` (`actorType` `SYSTEM`, actions `staff.role-changed`, `staff.branch-assigned`, `staff.branch-unassigned`, `entityType` `User`) in the same transaction.
- `list` prints email, name, role, active, and branch slugs (comma separated, `all` for Admin, `none` for an unassigned Receptionist or Manager).
- The staff list keeps its current database sort (`role` enum order), so existing accounts do not move.
- `StaffDirectory.findById` loads assignments with its own select; `listAccounts` keeps its current query.
- No CORS headers are added; the API is same origin only.

**Configuration required**: none. No new environment variables.

**Critical test scenarios**:
- Happy path: `GET /api/v1/health` with the test database answers `200` and the JSON body, verifies **AC-2**.
- Failure case: the health use case with a probe that throws answers `503` problem+json with `Retry-After`, and an integration test with an unreachable database URL does the same, verifies **AC-2**.
- Transport refusals: `text/plain` body → 415; 33 KB body with and without `Content-Length` → 413; `{bad` → 400; unknown field → 422 with `fieldErrors`; staff `POST` with `Origin: https://evil.example` → 403; staff `POST` signed out → 401, verifies **AC-3**.
- Redaction: a staff request with a cookie, an `Authorization` header, and a body containing a token string produces exactly one log line, and that line contains none of those values, verifies **AC-9**.
- Auth/permission: a Receptionist sees only Overview and Enquiries and gets the denied page on each CMS route; a CMS Server Action called as a Receptionist returns `FORBIDDEN`, verifies **AC-4**.
- Branch scope: an `authorizeBranch` table over Admin, Editor, assigned Receptionist, unassigned Manager, and signed out, verifies **AC-5**.
- Migration: on a scratch database at the M3 schema with seeded rows, the M4 migrations produce `new-cairo` with the settings data and the same row counts, all pointing at it, verifies **AC-6**.

## Migration plan

**Strategy**: expand, backfill, constrain, in one migration file after a separate enum migration. One deployment; no code freeze.

**Phases**:
1. `…_staff_roles_enum`: `ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'RECEPTIONIST'` and `… 'MANAGER'`. Nothing in this file uses the values.
2. `…_branches_and_staff_roles`:
   - Expand: create the enums and the tables `Branch`, `StaffBranchAssignment`, and `AuditEvent`; add nullable `branchId` columns and the accommodation columns.
   - Backfill: insert the first branch from `SiteSettings`; set `branchId` on every room, facility, and page.
   - Constrain: `SET NOT NULL` on the three `branchId` columns; drop the `Page_key_key` and `Page_canonicalPath_key` unique indexes and create the composite ones; drop `Room_active_sortOrder_key` and `Facility_active_sortOrder_key` and create their per branch replacements; add the foreign keys, the composite unique index on `Room (id, branchId)`, the new indexes, and the `CHECK`s.
   - Generate the file with `prisma migrate dev --create-only`, then hand edit the order and add the backfill and `CHECK`s with comments.
3. Run `prisma migrate diff` from the migrations to the schema on a migrated scratch database; it must report no difference.

**Rollback**: Before the deploy, take a backup (`scripts/backup.sh`). The migration is additive (no drops, no renames), so restoring the backup or running a written down migration that drops the new columns and tables restores the M3 state. The down SQL is recorded in the evidence report, not shipped as a migration.

**Risks**:
- `ADD VALUE` inside Prisma's transaction: handled by the separate file; verified on PostgreSQL 18 (Postgres.app).
- Composite unique indexes and `CHECK`s causing Prisma drift: verified by `migrate diff`.
- Page upserts keyed on `key` break: the seed moves to `branchId_key`, and the full integration suite runs.

## Build plan

Ordered by the brief's task order (data, domain, application, infrastructure, API, UI). Tests are written after each group.

1. Schema changes and the two migrations (including the per branch `sortOrder` partial indexes and Prisma index names); seed branch upsert and page upsert on `branchId_key` in `prisma/seed-data.ts`; branch ids passed through `prisma/seed-initial.mts`, `scripts/seed-demo.mts`, `tests/e2e/fixtures/public-content.mts`, and `tests/e2e/prepare-database.mts`; `resetDatabase` in `tests/integration/support/database.ts` recreates the branch with `DEFAULT_BRANCH_ID` and the support module exports `TEST_BRANCH_ID`; direct `room`, `facility`, and `page` creates in integration tests gain `branchId`; satisfies **AC-6**, **AC-1**.
2. Domain: `StaffRole` and `STAFF_ROLES` replace `AdminRole` and `ADMIN_ROLES` in every importer (`domain/shared/types.ts`, `domain/auth/capabilities.ts`, `application/auth/ports.ts`, `application/ports/repositories.ts`, `presentation/admin/navigation.ts`, `presentation/admin/staff/staff-table.tsx`, `presentation/admin/shell/admin-shell.tsx`, `infrastructure/auth/better-auth.ts` `additionalFields.role`, and tests); full capability matrix; `src/domain/branches` (schema with `RESERVED_BRANCH_SLUGS`, time, sync, map URL rules, `index.ts`); `src/domain/audit` (event shape with allowed `changes` keys per action, `index.ts`); unit tests T-AUTHZ-1 and reserved slugs; satisfies **AC-5**, **AC-7**.
3. Application: `StaffPrincipal.branchIds` (existing test literals gain `branchIds`, and a `staffPrincipal({ role, branchIds })` unit test builder is added); `authorizeBranch` and `branchScope`; `BranchRepository`, `AuditLog`, and `DatabaseProbe` ports; `CheckHealth`; `TRY_AGAIN` code; content ports and `PublicSite`, `CatalogCommands`, `CatalogQueries`, `PageCommands` take or resolve a `branchId` (every page method, room and facility slug lookups, sort order and reorder, sitemap); `ListEnquiries` and archive scoped; unit tests and the extended authorization sweep; satisfies **AC-5**, **AC-1**.
4. Infrastructure: branch and audit repositories (`repositories/branches/`, `repositories/audit/`), probe with timeout, content and enquiry repositories updated (`branchId_key` everywhere in `page-repository.ts`, per branch `nextSortOrder` and reorder in the room and facility repositories), staff directory loads assignments in `findById` only, `HmacThrottleKeys.namespaced`, `composition/api.ts` and `composition/http.ts`; integration tests T-DB-1, T-DB-2, T-AUD-1, principal `branchIds`, and a second branch whose rooms and facilities are untouched by the first branch's reorder; `provision(client, email, role, { branches })` helper in `tests/integration/support/auth.ts`; satisfies **AC-6**, **AC-11**, **AC-1**.
5. HTTP layer and API: `_http` modules, contracts, OpenAPI builder and script, health route, committed `openapi.json`; unit tests T-HTTP-1 to 6, problem table, redaction (including the `500` path and a thrown error whose message never reaches the body or the log), webhook raw body, OpenAPI freshness; health integration tests (up, and unreachable database within the timeout); satisfies **AC-2**, **AC-3**, **AC-8**, **AC-9**.
6. CLI and UI: staff CLI rules above with audit rows; role labels; minimal staff overview; read only branch field on room and facility forms; navigation tests; Receptionist and Manager accounts in the E2E setup; E2E-A-2 part 1; satisfies **AC-4**.
7. Boundaries: ESLint D-1a, D-7, D-8; architecture tests D-7, D-8, D-9, D-10, D-11, D-12 (replacing `booking scope`); satisfies **AC-10**.
8. Gates, `migrate diff`, `/check verify`, `/check review`, docs, evidence report; satisfies **AC-1** to **AC-11**.

Boundary rule details for step 7:
- D-1a: add `node:*` and bare Node built ins (`fs`, `crypto`, `path`, `http`, `https`, `net`) to the domain ESLint pattern.
- D-7: ESLint on `src/contracts/**`: only `zod` may be imported (a pattern that bans `@/*`, relative imports outside `src/contracts`, and `node:*`), plus an architecture test.
- D-8: for the module folders `branches`, `audit`, `health`, `inventory`, `pricing`, `reservations`, `guests`, `reporting`, `notifications` in domain and application, files outside the module may import only `@/<layer>/<module>` or `@/<layer>/<module>/index` (and, in application, `ports`); an architecture test checks it, and the ESLint pattern uses `"@/domain/<module>/*"` with a `"!@/domain/<module>/index"` negation. Existing CMS modules are not changed (no `index.ts` refactor), and this is recorded as a known limit.
- D-9: the reservation model list (`PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod`, `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings`, `Reservation`, `ReservationRoom`, `ReservationNight`, `ReservationService`, `CouponRedemption`, `BranchSyncCheckpoint`, `Payment`, `PaymentEvent`, `CancellationRequest`, `Guest`, `PhoneVerification`, `WhatsAppSettings`, `WhatsAppTemplate`, `Broadcast`, `NotificationOutbox`): Prisma accessor use (`.reservation.`) or quoted table names (`"Reservation"`) appear only under `src/infrastructure/db/prisma/repositories/reservations/` or `…/reporting/`. This also serves as the D-12 replacement for `booking scope`.
- D-11: no file with `"use server"` under `src/app` imports from `@/application/(reservations|inventory|pricing|guests)`; the allow list is empty.

## Consequences

**Positive**:
- Every later endpoint gets CSRF, size caps, safe errors, request ids, and redacted logs for free.
- Branch ownership is a database fact before any branch UI exists, so M5 only adds routes and screens.
- Receptionist and Manager accounts exist and are safe to create now.

**Negative / tradeoffs**:
- Content repository signatures change, so many test call sites change mechanically.
- The wrappers are a small in house framework that M8 and M9 must extend carefully (idempotency, `If-Match`).
- The rate limiter reuses the sign in counter table; it is coarse (fixed window) and gives no per client limit when proxy headers are not trusted.
- D-8 is enforced for the new modules only; the existing CMS modules keep deep imports.

**Neutral**:
- `SiteSettings` contact, address, and map columns stay in place and keep driving the public site until M5 switches it to `Branch`.
- The illustrative `capability` option in `rest-api-conventions.md` is replaced by "authorization in the use case" in the docs update.
- The `isSameOriginRequest` helper moves to `composition/http.ts`; the media upload route keeps working through a re-export.

## Follow-up

- [ ] Phase 12: the runtime database role gets no `UPDATE` or `DELETE` on `AuditEvent` (DB-10). Record it in the M4 report.
- [ ] M5: switch the public site from `SiteSettings` contact and map to `Branch`, qualify cache tags by branch, and record `ContactEnquiry.branchId` from the contact page.
- [ ] M6: add the `UnitOfWork` port (ADR 015) that binds the audit adapter and reservation repositories to one transaction.
- [ ] After merge: `/sync` creates `src/app/api/AGENTS.md` (Route Handler rules) with a sibling `CLAUDE.md` holding `@AGENTS.md` (brief).

## References

**Project sources**:
- `docs/delivery/milestones/m4-backend-foundations.md` (the brief, acceptance criteria, tasks)
- ADR 014 (REST through Route Handlers, `_http`, OpenAPI with `z.toJSONSchema()`), ADR 015 (layer first modules, contracts), ADR 017 and ADR 026 (branch ownership, page keys per branch, reserved slugs), ADR 018 (roles, `authorizeBranch`, `branchIds` reloaded per request), ADR 022 (transaction scoped primitives only)
- `docs/api/rest-api-conventions.md`, `docs/api/error-model.md`, `docs/requirements/user-roles-and-permissions.md`, `docs/database/data-model.md`, `docs/domain/branch-model.md`, `docs/architecture/dependency-rules.md`
- `docs/requirements/assumptions-and-open-questions.md`, Q-26 (enquiries for Receptionist and Manager, branch limited)
- Existing code: `src/composition/media.ts` (`isSameOriginRequest`), `src/infrastructure/auth/throttle-keys.ts`, `src/domain/auth/login-throttle.ts`, `src/infrastructure/auth/staff-session.ts`, `tests/unit/auth/authorization-sweep.test.ts`
- `AGENTS.md` rules (Next.js only, thin handlers, Prisma only in `src/infrastructure/db`)

**Practices & standards**:
- RFC 9457 Problem Details for HTTP APIs
- Expand, backfill, constrain for schema changes on live data
- Same origin checks with `Origin` and `Sec-Fetch-Site` as CSRF defence for cookie authenticated JSON APIs
- Logging with an allow list of fields (never log bodies, cookies, or credentials)
