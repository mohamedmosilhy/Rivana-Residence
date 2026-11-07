# M4 — Backend foundations and branch data ownership

Status: Accepted (2026-11-07). Ready for review 2026-11-06.

## Outcome

M4 lays the plumbing every later milestone uses, and gives existing content an owning branch. The public site and the CMS behave exactly as before for visitors, Editors, and Admins.

- **API layer:** a shared HTTP layer for `/api/v1` (CSRF, body caps, Zod validation, RFC 9457 problems, request ids, redacted one-line logs) and `GET /api/v1/health`.
- **Contracts:** Zod contracts with a generated, tested OpenAPI 3.1 document.
- **Roles:** Receptionist and Manager roles, the full capability matrix, `authorizeBranch` and `branchScope`, and branch assignments reloaded with every session.
- **Audit:** an append-only `AuditEvent` table and port.
- **Migration:** one additive migration, plus a separate enum migration. It creates `Branch` `new-cairo` from the site settings and moves every room, facility, and page to it without losing a row.
- **Staff CLI:** the new roles and branch assignment, with audit rows.
- **Boundaries:** rules D-1a and D-7 to D-12, enforced by ESLint and architecture tests.

Build spec: [docs/specs/0001-m4-backend-foundations.md](../../specs/0001-m4-backend-foundations.md). It was accepted by the owner after a second-model cross check.

## Scope delivered

Brief tasks:

1. **HTTP layer**
   - [x] `parseJson` (415, 413, 400)
   - [x] `validate` (422 with `fieldErrors`)
   - [x] CSRF (`isSameOriginRequest`, 403 `CROSS_SITE_REQUEST`)
   - [x] `publicRoute` with an optional rate limit, `staffRoute`, and `webhookRoute` (raw bytes)
   - [x] `problem()` with a single status table; a thrown error gives `500` with only `requestId`
   - [x] `X-Request-Id`, and the redacting one-line logger
2. **Contracts, OpenAPI, health**
   - [x] `primitives.ts` (`Money`, `Stay`, `Occupancy`, `Problem`)
   - [x] `scripts/openapi.mts` and `npm run openapi`, plus a freshness test
   - [x] `GET /api/v1/health`: `200` when the database answers, `503` otherwise
3. **Roles, capabilities, branch scope**
   - [x] `RECEPTIONIST` and `MANAGER` in their own enum migration; the TypeScript type is now `StaffRole`
   - [x] Every capability in the matrix (`promotions:manage` kept)
   - [x] `authorizeBranch`
   - [x] `StaffPrincipal.branchIds` loaded per request
   - [x] Staff CLI: the new roles, `assign-branch`, `unassign-branch`, and `--branch` on `create`
   - [x] Navigation: the new roles see only Overview and Enquiries
4. **Migration `branches_and_staff_roles`**
   - [x] `Branch` with its checks; the first branch created from `SiteSettings`
   - [x] `Room.branchId`, the `(id, branchId)` composite key, and the index; `accommodationType`, `bedroomCount`, `bathroomCount`
   - [x] `Facility.branchId`
   - [x] `Page` unique `(branchId, key)` and `(branchId, canonicalPath)`
   - [x] `ContactEnquiry.branchId`, nullable
   - [x] `StaffBranchAssignment` and `AuditEvent`
   - [x] No renames, no drops; `Promotion` untouched
5. **Repositories and queries**
   - [x] Content repositories take a `branchId`; the public site resolves the single active branch
   - [x] A read-only branch field on the room and facility forms
   - [x] `AuditLog` port and Prisma adapter (`append` only); the role grant is deferred to Phase 12 (below)
6. **Boundaries**
   - [x] ESLint rules and architecture tests for D-1a and D-7 to D-12
   - [x] The `booking scope` test is replaced by the reservation-table boundary test

Owner decisions applied (from the approved plan):

- Receptionists and Managers get `enquiries:read` and `enquiries:manage`, limited to their branches (Q-26).
- Roles without `content:edit` get a minimal staff home on `/admin`.
- The first branch comes from `SiteSettings`.
- Test call sites changed only mechanically.

## Files added, changed, removed

79 tracked files changed (+1,568 −364, excluding `openapi.json` and your own `docs/delivery/milestones/README.md` edit, which was left untouched). 54 files added. None removed.

- **Database:**
  - `prisma/schema.prisma`
  - `prisma/migrations/20261106120000_staff_roles_enum/`, `…20261106120100_branches_and_staff_roles/`
  - `prisma/seed-data.ts` (exports `DEFAULT_BRANCH_ID`), `prisma/seed-initial.mts`
- **Domain:** `src/domain/branches/`, `src/domain/audit/`, `src/domain/auth/capabilities.ts`, `src/domain/shared/types.ts` (`StaffRole`), `src/domain/settings/site-settings.ts` (shared map URL rule)
- **Application:**
  - New modules `src/application/{branches,audit,health}/`
  - `auth/authorize-branch.ts`, `shared/rate-limit.ts`
  - Content, page, public, and enquiry use cases made branch aware
  - `admin/get-overview.ts` now authorizes `content:edit` (review fix)
- **Infrastructure:**
  - New: `repositories/branches/`, `repositories/audit/`, `database-probe.ts`
  - Changed: the room, facility, page, enquiry, and staff directory repositories, the mappers, `staff-session.ts`, `throttle-keys.ts`, and `better-auth.ts`
- **Composition:** new `api.ts` and `http.ts` (`isSameOriginRequest` moved here and is re-exported from `media.ts`); `auth.ts`, `content.ts`, `public.ts`
- **HTTP and contracts:** `src/app/api/v1/_http/` (body, problem, logger, routes, index), `src/app/api/v1/health/route.ts`, `src/contracts/api/v1/`, `scripts/openapi.mts`, `docs/api/openapi.json`
- **UI:**
  - `src/app/admin/(protected)/page.tsx` (staff home)
  - The room and facility new and edit pages
  - `catalog-form.tsx` (read-only branch field)
  - Role labels in `format.ts` and `staff-table.tsx`
- **CLI:** `scripts/staff-admin.ts`, `scripts/staff.mts`
- **Lint and package:** `eslint.config.mjs`, `package.json` (`openapi` script), `test-preferences.json` (test skill preferences)
- **Tests:**
  - New unit: `tests/unit/api/http-layer.test.ts`, `application/health-rate-limit.test.ts`, `architecture/{module-boundaries,route-handlers,openapi}.test.ts`, `auth/authorize-branch.test.ts`, `domain/branches-audit.test.ts`
  - New integration: `tests/integration/{branches-migration,branches,staff-branches,health-route}.test.ts`
  - New E2E: `tests/e2e/branch-roles.spec.ts`
  - Shared helper: `tests/support/reservation-models.ts`
  - Existing tests updated mechanically for the new signatures
- **Docs:**
  - New: spec 0001, `docs/reviews/m4-verify.md`, `docs/reviews/2026-11-06-m4-backend-foundations.md`
  - Status updates: REST conventions, error model, API contracts, user roles, branch model, data model, migrations and seeding, dependency rules, test matrix, roadmap, and the M4 brief

## Migrations and configuration

**`20261106120000_staff_roles_enum`** adds `RECEPTIONIST` and `MANAGER` to `AdminRole`. It is kept separate so no statement uses a value in the same transaction that adds it.

**`20261106120100_branches_and_staff_roles`** runs three commented phases.

Expand:
- Create `BranchStatus`, `AccommodationType`, `Branch`, `StaffBranchAssignment`, and `AuditEvent`.
- Add nullable `branchId` columns, plus the accommodation columns.

Backfill:
```sql
INSERT INTO "Branch" (…) SELECT 'cwiuqp6uf1q5i1ic4vhawnmw', 'new-cairo', COALESCE(s."siteName", 'Rivana Residence'), LEFT(s."tagline", 300), …
FROM (SELECT 1) AS one LEFT JOIN "SiteSettings" AS s ON s."id" = 'default'
WHERE NOT EXISTS (SELECT 1 FROM "Branch" WHERE "slug" = 'new-cairo');
UPDATE "Room" SET "branchId" = 'cwiuqp6uf1q5i1ic4vhawnmw' WHERE "branchId" IS NULL;   -- same for Facility, Page
```

Constrain:
- `SET NOT NULL`.
- Replace `Page_key_key` and `Page_canonicalPath_key` with per-branch unique keys.
- Replace the global `Room_active_sortOrder_key` and `Facility_active_sortOrder_key` partial indexes with per-branch ones.
- Add `Room (id, branchId)` and the foreign keys (deletes restricted; assignment → user cascades).
- Add the checks: slug format and reserved slugs (`admin`, `api`, `media`, `reservations`, `book`, `sitemap.xml`, `robots.txt`, `*.html`), name, currency `USD`, `HH:MM` times, sync ranges, coordinates, bedroom and bathroom counts ≥ 0, and audit actor type.

No environment variables changed.

**To apply to your development database:** back it up, then run `npm run db:deploy` (or `npm run db:migrate`). The verification used a copy, so `rivana` itself is still at the M3 schema. A backup taken before M4 is at `/private/tmp/claude-501/-Users-mohamedmosilhy-dev-rivana-Rivana-Residence/5348807b-3be1-4f0a-96c8-2bad54e6d33e/scratchpad/rivana-before-m4.dump`.

**Before and after** on a copy of the development data (`rivana_m4_verify_test`):

| | rooms | facilities | pages | sections | enquiries | migrations |
| --- | --- | --- | --- | --- | --- | --- |
| Before | 5 | 3 | 3 | 15 | 1 | 3 |
| After | 5 | 3 | 3 | 15 | 1 | 5 |

After migrating:
- One branch, `new-cairo`: name "Rivana Residence", the tagline as summary, phone `+20 2 1234 5678`, coordinates 30.013100 / 31.491300.
- All 5 rooms, 3 facilities, and 3 pages reference it. 0 rows have a null `branchId`. The enquiry keeps a null branch.

`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` reports "No difference detected." on that copy, and on the integration database inside T-DB-1.

## Decisions made during the milestone

Local implementation choices only; every one is recorded in spec 0001.

- **Wrapper options:** wrappers take `(options, handler)`, and `options.route` gives the logged route pattern. There is no `capability` option, because authorization stays in the use case. The REST conventions example is updated to match.
- **Request ids:** an incoming `X-Request-Id` is kept only if it matches `^[A-Za-z0-9._-]{1,64}$`; otherwise one is generated with `crypto.randomUUID()`.
- **Body cap:** 32 KB, checked against `Content-Length` and by counting the stream.
- **Errors in the log:** a thrown error logs only its name and stack frames, never its message, because driver messages can contain data.
- **Health:** the probe has a 2 second timeout, and a `503` carries `Retry-After: 5`.
- **Rate limit:** the limiter reuses the sign-in counter store with namespaced keys. No route uses it yet.
- **First branch id:** a CUID2 written into both the migration and the seed, because SQL can't generate CUID2.
- **Default branch:** the public site uses the first active branch, and the CMS the first branch of any status.
- **Repository signatures:** room and facility repositories take `branchId` as an argument (`create(branchId, input, actor)`), and the input types are unchanged. CMS forms never submit a branch.
- **CLI audit rows** use actor `SYSTEM`.
- **Enquiry archiving:** there is no archive use case or action in the app, so only the list is scoped.

Business questions raised: none. Q-26 applied as recommended.

## Commands and results

All results are on the final tree, after the review fix.

| Gate | Command | Result |
| --- | --- | --- |
| Format, lint, typecheck, unit, build | `npm run check` | exit 0 in 16.6 s. Prettier clean, ESLint 0 problems, `tsc` 0 errors, **unit 44 files / 858 tests passed**, production build compiled |
| Integration (PostgreSQL 18) | `TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration` | exit 0 in 19.6 s. **16 files / 204 tests passed** |
| E2E (Chromium desktop and mobile, visual, axe, promotions) | `E2E_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_e2e_test npm run test:e2e` | exit 0 in 1 min 17 s. **151 passed, 0 failed, 0 flaky**; 30 viewport-scoped skips, as designed since Phase 11. Visual baselines unchanged |
| Drift | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` | "No difference detected." |
| Cross-browser WebKit | `npm run test:e2e:browsers` | **Not run.** M4 changes no public page, and the brief asks for it only when public pages change |
| Concurrency (20 iterations) | n/a | Starts in M6 |

Before M4 the counts were: unit 37 files / 652 tests; integration 12 files / 155 tests; E2E 141 passed (Phase 11 record).

OpenAPI excerpt (`docs/api/openapi.json`):

```json
"/api/v1/health": { "get": { "operationId": "getHealth", "security": [],
  "responses": { "200": { "content": { "application/json": { "schema": { "$ref": "#/components/schemas/HealthResponse" } } } },
                 "default": { "description": "Problem details. Codes: INTERNAL, TRY_AGAIN.", "content": { "application/problem+json": { … } } } } } }
```

Log sample from the running server. The request carried a session cookie, a bearer token, a query token, and a JSON body, each with a marker string; `grep -c SECRET` on the log gives 0:

```json
{"event":"http","requestId":"verify-redaction","method":"GET","route":"/api/v1/health","status":200,"durationMs":1,"principal":"public","branchId":null}
```

## Acceptance criteria → evidence

| AC | Evidence | Result |
| --- | --- | --- |
| 1. Existing suites unchanged | The gates above; visual baselines unchanged | met |
| 2. Health 200 / 503 | Live: `200 {"status":"ok","database":"ok"}`; with an unreachable database, `503` `application/problem+json`, `Retry-After: 5`, no connection details ([m4-verify.md](../../reviews/m4-verify.md)) | met |
| 3. 415 / 413 / 400 / 422 / 403 / 401 | `tests/unit/api/http-layer.test.ts` (T-HTTP-1 to 6 over `Request` objects, as the brief specifies; no staff mutation endpoint exists yet) | met |
| 4. Receptionist and Manager see no CMS | Live, with CLI-created accounts: navigation `Overview, Enquiries`; all 10 CMS routes denied. E2E `branch-roles.spec.ts` covers the same plus a refused CMS Server Action. The sweep refuses every CMS command, and now the overview read | met |
| 5. `authorizeBranch` | `authorize-branch.test.ts`; live enquiry scoping (scoped roles 0, Admin 1); per-request reload in `staff-branches.test.ts` | met |
| 6. Seeded data migrated, no drift | Counts table above; `branches-migration.test.ts` (T-DB-1) | met |
| 7. Reserved slugs rejected | Domain schema tests; the database `Branch_slug_check` | met |
| 8. OpenAPI committed and fresh | `openapi.test.ts` | met |
| 9. No secrets in logs | Live log sample; unit redaction tests, including the `500` path | met |
| 10. Boundary rules | Probe files trip D-1a, D-7, and D-8; the D-9 test catches a probe query; 24 architecture tests | met |
| 11. Audit rollback | `branches.test.ts` (T-AUD-1) | met |

Code review: [2026-11-06-m4-backend-foundations.md](../../reviews/2026-11-06-m4-backend-foundations.md), by Claude Sonnet (the code was written by Opus). Verdict: changes requested, with 0 blockers, 1 major, 5 minor, and 5 nits. The major (the overview use case authorized only `admin:access`) is fixed, and the gates were rerun. Every minor finding is answered in the file.

## Screenshots

- Receptionist staff home: [desktop 1280](./screenshots/m4/receptionist-overview-desktop.png), [mobile 390](./screenshots/m4/receptionist-overview-mobile.png)
- Manager staff home: [desktop 1280](./screenshots/m4/manager-overview-desktop.png), [mobile 390](./screenshots/m4/manager-overview-mobile.png)
- Admin overview, unchanged: [desktop](./screenshots/m4/admin-overview-desktop.png)
- Admin "Add room" with the read-only branch field: [desktop](./screenshots/m4/admin-new-room-branch-desktop.png)

## Known limitations, risks, deferred work

- **Phase 12:** the runtime database role must have no `UPDATE` or `DELETE` on `AuditEvent` (DB-10). Until then, append-only is a convention enforced by the adapter.
- **M5:**
  - The contact form records the branch. Until then, Receptionists and Managers see no enquiries.
  - The public site moves from `SiteSettings` contact and map data to `Branch`. Until then, editing the settings does not update the branch copy.
  - Cache tags become branch-qualified.
  - The CMS gets a branch selector, including the rule for which branch it edits once one can be deactivated.
  - Decide whether assignments to an inactive branch still count.
- **M8 (before the first public rate-limited route):** a cleanup job for expired counter rows (sign-in rows included). The limiter is approximate under concurrent bursts, and that is documented.
- **M12:** the in-app Staff screen must enforce the last-active-Admin rule in one locked transaction. The CLI's existing check runs before its write, and was kept unchanged as the brief says.
- **The first list endpoint:** repeated query parameters keep only the last value. An unsupported method gives Next's plain `405`, with no problem body.
- **D-8 coverage:** applies to the reservation-era modules only. The older CMS modules have no `index.ts`.
- **Local environment:** Postgres.app refuses a database client started detached (`nohup`), and every query hangs until the 2 s probe timeout. Start servers attached, as Playwright does. This is noted in the verification notes.
- **Your edit:** `docs/delivery/milestones/README.md` (yours) was not changed by M4. It is committed separately, as you wrote it.
- **Test database:** the `rivana_m4_verify_test` copy (with three verification accounts, `*.verify@example.test`) can be dropped any time.

## Next milestone: not started

M5 (branch websites) has not started. Branch `m5-branch-websites` was created from the accepted M4 commit; the work waits for your go-ahead.
