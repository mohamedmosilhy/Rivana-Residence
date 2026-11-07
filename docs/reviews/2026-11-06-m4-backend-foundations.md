# Review, m4-backend-foundations, 2026-11-06

**Reviewed by**: Claude Sonnet 5.5 (fresh reviewer; author model not stated)
**Scope**: 67 tracked files changed plus about 45 untracked source, test, and doc files, uncommitted vs HEAD (docs/delivery/milestones/README.md excluded)
**Verdict**: Changes requested

## Summary
M4 adds the shared `/api/v1` HTTP layer (request id, CSRF, 401, 413/415/400/422 parsing, problem mapping, redacted logging), a health endpoint, Zod contracts with OpenAPI, the Receptionist and Manager roles with `authorizeBranch` and `branchScope`, an audit port and adapter, a staff CLI with branch rules, and an expand, backfill, constrain migration that gives rooms, facilities, and pages an owning branch. The code is careful and closely follows the spec. Migration SQL, CSRF, error leakage, log redaction, and the parsing paths all hold up. The one headline issue is that the admin overview use case still authorizes on `admin:access` alone, which Receptionists and Managers now hold, so the branch-scope rule lives only in a page guard.

## Major
### 🟠 Overview use case is not branch or capability scoped, `src/application/admin/get-overview.ts:21`
**Problem**: `GetAdminOverview` authorizes `admin:access`. Receptionist and Manager now have that capability (`src/domain/auth/capabilities.ts`). The use case therefore returns CMS content counts, draft names, promotion internal names, and global enquiry counts (`new`, `deliveryFailed` across every branch) to them. The only protection is the `content:edit` check in `src/app/admin/(protected)/page.tsx:18`. The authorization sweep (`tests/unit/auth/authorization-sweep.test.ts`) exempts `overview.read`, so nothing would catch a second caller.
**Why it matters**: AGENTS.md says authorization is enforced inside use cases, and hidden pages are not security. The enquiry counts are exactly the cross-branch data Q-26 says Receptionists and Managers must not see. Today the page guard prevents the leak. It is latent, and the next reuse (an API endpoint, a staff-home widget) would expose it.
**Suggested fix**: Require `content:edit` in the use case, or split it into a content overview and a branch-scoped enquiry count that takes `branchScope`. Update the sweep test so a Receptionist and a Manager are refused.

## Minor
### 🟡 New public enquiries get no branch, so scoped roles never see them, `src/application/enquiries/submit-enquiry.ts` (unchanged), `src/infrastructure/db/prisma/repositories/enquiry-repository.ts:41`
**Problem**: Scoping uses `branchId IN (...)`, and `submit-enquiry` is untouched, so every enquiry created after M4 also has a null branch. Receptionists and Managers will list zero enquiries, including ones received tomorrow (m4-verify.md confirms "Receptionist lists 0, Admin lists 1").
**Why it matters**: It matches the spec text for legacy rows, but the Enquiries destination is useless for those roles until M5, and it is easy to miss.
**Suggested fix**: Stamp new enquiries with the default active branch, or record explicitly in the docs and the M5 brief that scoped roles see no enquiries until then.

### 🟡 Last-administrator check is outside the transaction, `scripts/staff-admin.ts:53-62`, `:177-192`, `:206-210`
**Problem**: `assertAnotherActiveAdmin` counts before the write transaction opens. Two concurrent demotions or deactivations of the two remaining admins can both pass.
**Why it matters**: Low likelihood (operator CLI), but the rule is stated as an invariant.
**Suggested fix**: Run the count and the update in one transaction, ideally locking the admin rows (`SELECT ... FOR UPDATE`).

### 🟡 CMS and public site can pick different default branches, `src/infrastructure/db/prisma/repositories/branches/branch-repository.ts:19-31`
**Problem**: The public site uses `findDefaultActive` and the CMS uses `findDefault` (any status). If the first branch is made INACTIVE and a second exists, staff edit content that the public site does not show.
**Why it matters**: Not reachable until branches can be deactivated (M5), but it is a silent edit-the-wrong-branch trap.
**Suggested fix**: Use one definition (or make the CMS explicit about the branch it edits) and add a test with an inactive first branch.

### 🟡 Audit log is append-only by convention only, `prisma/migrations/20261106120100_branches_and_staff_roles/migration.sql` (AuditEvent table)
**Problem**: Nothing at the database level prevents UPDATE or DELETE of audit rows.
**Why it matters**: The migration comment and spec defer the REVOKE to Phase 12, so this is acknowledged. It is worth tracking because role changes are already being logged.
**Suggested fix**: Add a trigger rejecting UPDATE and DELETE now (cheap), or keep a tracked task for the REVOKE.

### 🟡 RateLimiter is shipped but used by no route, and is not atomic, `src/application/shared/rate-limit.ts:36-40`
**Problem**: `get` then `recordFailure` is a read-then-write across two calls, so concurrent bursts can overshoot the limit. No route passes `rateLimit` yet (health does not), and the `rl:` keys are never pruned.
**Why it matters**: Dead code with a subtle semantic until M5 or M6 adopts it.
**Suggested fix**: Either wire it where it is needed or note the approximation in the doc comment, and confirm the counter store prunes expired rows.

## Nits
- ⚪ `src/app/api/v1/_http/routes.ts:213`, `Object.fromEntries(searchParams)` keeps only the last value of a repeated key, so array query parameters cannot be expressed. Document it or switch to a multi-value reader before the first list endpoint.
- ⚪ `scripts/staff-admin.ts:161-190`, `create`, `activate`, and `deactivate` write no audit row (only role and branch changes do). Fine per spec, but worth stating in the audit docs.
- ⚪ `src/application/public/public-site.ts:46`, every public query does an extra branch lookup. Negligible now, and cached under content tags.
- ⚪ Unsupported methods on API routes return Next's bare 405 without a problem body (already noted in m4-verify.md).
- ⚪ `src/infrastructure/db/prisma/repositories/staff-directory.ts:50`, `listBranchIds` includes assignments to INACTIVE branches. Decide the rule when M5 adds deactivation.

## Strengths
- The migration is safe on live data: expand, backfill (column sizes fit SiteSettings, idempotent `NOT EXISTS`, fixed branch id shared with the seed), then constrain. The enum value is in its own migration, and the partial unique indexes and CHECKs are mirrored by the domain schema.
- The HTTP layer is tight: the CSRF check runs before authentication and body reading, the order 401, 415, 413, 400, 422 is correct, the stream is byte-counted when `Content-Length` is missing or false, and `X-Request-Id` is validated. Logs use an allow-list of fields, error messages are dropped in favor of stack frames, and thrown errors never reach the body.
- `authorizeBranch` and `branchScope` are small, correct, and explicit about Editor behavior. An empty assignment yields an empty list. Roles and assignments are reloaded per request.
- The staff CLI enforces role and branch rules, is idempotent, writes audit rows inside the same transaction, and clears assignments when moving to ADMIN or EDITOR.
- Editor and Admin behavior is preserved: content repositories are branch-keyed through the default branch only, and the full suites pass (E2E visual baselines unchanged).

## Test coverage
Strong. Unit tests cover the HTTP layer (40 cases over `Request` objects, including redaction and the 500 path), `authorizeBranch`, the capability matrix and authorization sweep, domain branch and audit schemas, health with a failing and slow probe, the OpenAPI freshness check, and the architecture rules (D-7 to D-12). Integration tests cover the migration on seeded data, branches and audit rollback (T-AUD-1), staff branch assignment reload, and the health route against a real and an unreachable database. E2E covers the Receptionist and Manager denied pages and a refused Server Action. Gaps: the overview use case with a Receptionist or Manager (see the Major finding), a concurrent last-admin race, an inactive first branch, and the RateLimiter against the real counter store.

## Responses (implementer, 2026-11-06)

| Finding | Response |
| --- | --- |
| 🟠 Overview use case not capability scoped | **Fixed.** `GetAdminOverview` now authorizes `content:edit` (Editor and Admin hold it, so their overview is unchanged). The authorization sweep lists `overview.read` under `content:edit`, and now refuses Receptionist and Manager before any data access. The only command those roles may run is the branch-scoped enquiry list. All gates were rerun: check exit 0 (858 unit tests), integration 204, E2E 151 passed |
| 🟡 New enquiries get no branch | **Deferred to M5 by the brief.** Task 5 of the M5 brief records `ContactEnquiry.branchId` from the contact page, and M4's "Out of scope" list excludes public route changes. Until then, scoped roles see no enquiries. This is stated in `docs/requirements/user-roles-and-permissions.md` and the evidence report |
| 🟡 Last-admin check outside the transaction | **Known limitation.** The rule predates M4, and the brief keeps it unchanged. Its scope is the operator CLI. Recorded for M12, where the in-app Staff screen must enforce the rule in one locked transaction |
| 🟡 CMS and public pick different default branches | **Not reachable in M4.** Nothing can deactivate a branch yet. M5 adds the CMS branch selector and deactivation, so recorded as an M5 follow-up |
| 🟡 Audit append-only by convention | **Tracked.** The spec and the brief defer the REVOKE to Phase 12 (DB-10). Listed in the evidence report |
| 🟡 RateLimiter unused and approximate | **Documented.** The brief requires the `publicRoute` option. The doc comment now states the approximation and that the counter rows (sign-in ones included) need a cleanup job before the first public route uses it (M8) |
| ⚪ Nits | Noted. The multi-value query parameters, the bare `405`, and assignments to an inactive branch are recorded as follow-ups for the first list endpoint and for M5. Audit coverage of `create`, `activate`, and `deactivate` matches the spec |
