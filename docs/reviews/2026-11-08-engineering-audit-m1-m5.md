# Engineering audit: completed Phases 0–11 and milestones M1–M5

Date: 2026-11-08 (Africa/Cairo). Reviewed revision: **167610c**, main.

This is an assessment of the accepted implementation, rather than an implementation task. Application source, committed tests, package versions, schemas, migrations, ADRs, and task acceptance were not changed. This report is the only repository deliverable. Existing test setup applied migrations and created data only in disposable audit databases.

The owner confirmed that Claude models produced the implementation. A fresh Codex review covered three separate areas: security and identity, persistence and recovery, and public functionality and requirements. The primary reviewer examined the HTTP integration, reconciled findings, ran the gates available here, and reproduced important failures.

## 1. Executive Summary

**The architecture is worth retaining. Focused corrective work is warranted before extending the staff REST API. A restart, framework replacement, or broad refactor is not justified.**

The implementation contains substantial working functionality and meaningful tests. Layering, server authorization, branch ownership, public publication filters, and the preservation of existing content are generally well designed. The largest weaknesses occur where independently correct components meet: browser cookies and API routes, framework cache context and committed writes, concurrent media operations, deployment seeding, and backup snapshots.

There are **14 findings: 0 verified CRITICAL, 3 HIGH, 10 MEDIUM, and 1 LOW**. No account takeover, cross-branch authorization bypass, or reservation overselling defect was demonstrated. Reservation writes do not exist yet, so their future integrity cannot be certified.

| ID | Severity | Finding | When action is needed |
| --- | --- | --- | --- |
| F01 | HIGH | Installed dependencies include an applicable Next.js Server Actions denial of service advisory | Before an externally accessible deployment |
| F02 | HIGH | The staff session cookie does not reach the staff REST API | Before building further staff API consumers |
| F03 | HIGH | Branch REST writes commit, then return 500 because cache invalidation uses a Server Action only API | Before relying on or extending REST mutations |
| F04 | MEDIUM | Concurrent media attachment and deletion can create a reference to a deleted asset | Before production CMS operation |
| F05 | MEDIUM | A backup can report success with an inconsistent media archive and manifest | Before depending on scheduled backups |
| F06 | MEDIUM | Cleanup loses the record of an object orphaned during interrupted upload finalization | Before production media operation |
| F07 | MEDIUM | Initial seeding can create an active administrator with a known weak password | Before any exposed staging or production seed |
| F08 | MEDIUM | Fresh initial-content seeding leaves branch contact and location empty | Before a fresh deployment rehearsal |
| F09 | MEDIUM | Staff cannot read full enquiries or archive them in the product | Before launch and operational handover |
| F10 | MEDIUM | Changing a published catalog slug breaks old links without the required redirect workflow | Before launch or routine published-slug editing |
| F11 | MEDIUM | Navigation and branch switching target unpublished About and Contact pages | Before activating partially published branches |
| F12 | MEDIUM | CMS logo controls do not change the visible website logos | Before CMS handover |
| F13 | MEDIUM | The last active administrator rule is vulnerable to concurrent CLI operations, already recorded as debt | Before interactive staff management; serialize CLI changes meanwhile |
| F14 | LOW | Current documentation summaries contradict accepted M4/M5 implementation status | During the approved documentation sync |

Verification is mixed. Formatting, lint, the initial type check, **905 unit tests**, and **224 integration tests** passed. The normal Turbopack production build was blocked by a local worker-port permission error, including its escalated retry. A webpack fallback compiled but failed its distinct generated route type checks. That fallback result is not evidence that the configured Turbopack build has the same source defect. Full production E2E and performance certification remain unverified in this audit.

## 2. Overall Architecture Assessment

The single Next.js modular monolith fits the business and the approved ADRs. It avoids duplicating authentication, deployment, and database ownership. There is no evidence supporting a second backend.

| Boundary | Assessment and evidence |
| --- | --- |
| Domain and application | Pure rules and use cases are separated from framework adapters. Capability checks are centralized. See src/application/auth/authorize.ts, src/application/auth/authorize-branch.ts, and src/domain/auth/capabilities.ts. |
| Persistence | Prisma construction and database operations remain in infrastructure, reached through composition and application ports. The lint and architecture suites passed. |
| HTTP | The versioned handlers are thin and share parsing, origin checks, safe errors, and logging. The important defects are in integration with the browser and cache adapter, not misplaced business workflows. |
| Branch ownership | Content queries take branch ids; public routes resolve active branches on the server. Cross-branch listing lookup and enquiry scope have real database tests. |
| Transactions | Branch creation, page initialization, and audit append are atomic. Several older CMS invariants span operations without a common concurrency protocol, especially F04 and F13. |
| Public output | View models filter publication state and image rights, map URLs are allowlisted, and visitor text is rendered as text. No substantiated draft or unconfirmed-image leak was found. |

SOLID is applied pragmatically: infrastructure implements ports, composition chooses adapters, and application operations express business responsibilities. The generic catalog implementation shares room/facility lifecycle behavior without forcing a rewrite. No significant direct dependency violation or need for more abstraction was established.

F03 shows one important abstraction limitation: CacheInvalidator hides a framework execution-context requirement. Reusing an adapter across two transports is unsafe even though both satisfy its TypeScript interface. Fixing composition and verifying the real runtime is more appropriate than adding another framework.

Architecture tests are guardrails, not a proof system. Some inspect import text and route size; D-8 deliberately covers newer modules rather than every legacy CMS module. D-13 client-to-server enforcement is explicitly incomplete in docs/architecture/dependency-rules.md. Those limits should remain visible.

## 3. Milestone-by-Milestone Assessment

### Reservation milestones

| Milestone | What completion means | Assessment |
| --- | --- | --- |
| M1 | Requirements, business rules, traceability, and open questions | A substantive baseline exists. Later owner decisions and ADRs 024–028 supersede parts of the original PDFs. Current status summaries need correction, and several older CMS promises remain incomplete. |
| M2 | Domain, architecture, database, API, and security design | Coherent design for a modular monolith, PostgreSQL consistency, branch scope, and reusable REST. Planned reservation transactions and payment behavior have not yet been implemented or proven. |
| M3 | Agent instructions, engineering standards, and tooling | The repository has explicit boundaries and gates. The task-based workflow was adopted after M4/M5; its later per-task rule is not applied retroactively as a defect in those earlier milestones. |
| M4 | HTTP plumbing, roles, assignments, audit foundation, and branch data ownership | Most delivered behavior is supported by code and passing tests. The migration sequence preserves content and establishes branch keys. Browser authentication of the new API was not actually proved, exposing F02. |
| M5 | Branch websites, shared templates, chooser/switcher, catalog types, maps, redirects, APIs, and promotion removal | The public implementation is substantial and mostly matches the approved direction. Staff REST mutations fail in the actual Next runtime (F03). Fresh seeding and publication edge cases also need correction. |

M0 is included as historical context, through docs/delivery/reports/m0-repository-assessment.md. M1–M3 were design and configuration work, consolidated in commit **5eeb1ff**, not three missing application feature sets. M4 landed in **1ab42c1**, M5 in **d336367**, and the later workflow in **167610c**.

### Earlier phases

| Phase | Assessment of the current retained implementation |
| --- | --- |
| 0 | Requirements and ADRs provide useful constraints. Original external-PMS assumptions were deliberately superseded. |
| 1 | Strict TypeScript, exact dependencies, CI, and layer rules exist. Local Node 24 differs from the project's Node 22 pin, an already recorded verification limitation. |
| 2 | The content schema, foreign keys, checks, indexes, and repository mapping form a sound base. Transaction use alone does not prevent F04. |
| 3 | Closed staff sign-in, database sessions, revocation, capability policy, and throttling are substantive. The original admin-only cookie scope became incompatible with the later REST surface. F13 remains known CLI debt. |
| 4 | Admin shell, settings, pagination, and form behavior are implemented. The enquiries workflow deferred here was never fully completed (F09). |
| 5 | Catalog and controlled page editing are functional. Published slug changes lack their specified redirect guardrail (F10). |
| 6 | Upload validation, sanitized immutable files, usage checks, and deletion recovery are useful foundations. Concurrent references and crash recovery have gaps (F04, F06). |
| 7 | Public content, contact persistence, metadata integration, and honest disabled booking controls exist. Enquiry management is incomplete, and publication visibility is not consistently reflected in navigation. |
| 8 | The shared design system and static approved artwork are implemented. Editable logo controls remain misleading (F12). |
| 9 | Motion and interaction code includes reduced-motion and keyboard behavior. No new significant source defect was substantiated in this pass; full accessibility/browser certification was not rerun. |
| 10 | Branch-aware metadata, sitemap, structured data, and legacy redirects are present. CMS slug changes still break URL continuity. Historical Lighthouse numbers are not current audit measurements. |
| 11 | Security headers and failure tests materially improved the system. The earlier quiet restore drill does not establish backup correctness during CMS activity (F05). Historical dependency cleanliness is no longer current (F01). |

## 4. Requirements Compliance

The audit read the architecture and dependency rules, current requirements, role matrix, domain/data/API/security documents, M4/M5 briefs and specs, prior review responses, the phase reports, Git history, the original seven-page scope PDF, and the eleven-page version 2 scope PDF. PDF text was extracted locally with PDFKit. Documentation was treated as a contract to verify against source, not as evidence that code works.

The PDFs are historical inputs. ADRs 023–028 and the owner decision register change hosting, branch URLs, confirmation, payments, price composition, WhatsApp, and promotion behavior. The earlier PDFs' pending-request lifecycle and external integration must not be reintroduced as supposed missing requirements.

| Requirement area | Result at the completed boundary |
| --- | --- |
| FR-SITE-1/2/3/5/6/8, branch ownership and routes | Largely implemented; public query isolation and redirect intent are supported by tests. Fresh contact import is defective (F08). |
| FR-SITE-4 and FR-WEB-1, publication-aware navigation | Partial (F11). The detailed M5 switcher spec itself assumes About/Contact exist, conflicting with the broader requirement. |
| FR-SITE-7 and FR-WEB-6, branch map/contact | Implemented for correctly populated branch data; deployment seed does not populate that data (F08). |
| FR-CAT-1…5, rooms/apartments | Catalog type, facts, and labels are implemented. Inventory and prices are intentionally later work. |
| FR-IAM-1/3 and ADR 018 | Server capability and branch scope checks largely comply. Browser-to-REST session transport does not (F02). |
| API-A1…A3 | The handlers exist; normal browser authentication fails. An authenticated PATCH also fails after commit (F02/F03). These APIs should not be considered fully verified. |
| FR-CMS-2, managed logos | Partial (F12). |
| FR-CMS-5/8, safe media deletion | Sequential behavior is covered; concurrent behavior violates the invariant (F04). |
| FR-CMS-7, view/archive enquiries | Partial: preview list only, without full detail or archive (F09). |
| Published slug guardrails and SEO continuity | Partial (F10). |
| FR-AUD foundation | Append adapter and transactional events exist. Runtime-role immutability remains an explicitly deferred provisioning requirement. |
| Book Now and manual synchronization claims | Correctly conservative today: booking is disabled, and no PMS integration is fabricated. |
| Promotion popup removal | An approved M5 change under Q-47, not a regression. The retained table is intentional migration debt. |
| Inventory, rates, quotes, reservations, payments, refunds, guest verification, and operational screens | Planned M6 onward. Their absence is not a defect in M1–M5. |

Unexpected behavior found is described in the numbered findings. No unjustified new application framework or external hotel-system integration was found.

## 5. Security Findings

### F01. HIGH: Applicable security advisories remain in installed dependencies

**Status:** Installed affected versions verified; applicability of the Server Actions advisory verified from application configuration and the maintainer's conditions. No destructive exploit was run.

**Evidence:** package.json:43,46,47,52,53 pins Better Auth 1.7.6, Next.js 16.3.3, Nodemailer 10.0.10, sharp 0.35.4, and Zod 4.6.5. src/app/(marketing)/actions.ts:1 is a public Server Action; numerous CMS actions also exist. The successful online npm audit query returned 12 affected package entries: 2 critical, 4 high, 5 moderate, and 1 low. These are dependency graph labels, not twelve independently exploitable application defects.

Next.js's maintainer states that affected App Router applications with at least one Server Action can suffer unauthenticated CPU exhaustion. This application meets that condition; application-level authorization cannot be assumed to prevent framework parsing attacks. The affected 16.x range includes 16.3.3, and the advisory lists 16.4.1 as patched. See the [Next.js maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).

**Why it matters:** One process hosts the public site, CMS, and API, so process exhaustion affects all three.

**Recommendation:** Approve a bounded dependency security update, assess compatibility using the installed guides, and rerun the real gates. The registry currently suggests Next.js 16.4.5 and companion updates; that suggestion is not an approved migration decision.

**Immediate action:** Yes, before external exposure. Do not deploy using historical claims of zero production advisories.

**Critical advisory qualification:** The dependency scan also flags RCE advisories involving SVG image processing, next/og, and typed arrays returned by Cache Components. Their prerequisites were not demonstrated in Rivana. SVG uploads are disallowed and optimization is limited to local library paths; no next/og or relevant use-cache implementation was found. These controls reduce particular exposure, but do not justify retaining affected versions. The [SVG maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) identifies Linux/glibc and sharp version conditions; the [Cache Components advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) requires specific cache behavior. No reachable RCE is claimed.

Likewise, the [Better Auth critical advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm) requires Magic Link and OAuth features that this configuration does not enable. src/infrastructure/auth/better-auth.ts:42 enables password sign-in; the unused auth HTTP surface is not mounted. Zod, Nodemailer, sharp, and tooling advisories still merit updates and individual review; the complete npm response is retained temporarily at /tmp/rivana-audit-dependencies-20261108.json.

### F02. HIGH: Browser staff sessions cannot authenticate the REST API

**Status:** Reproduced with a real Chromium login against the isolated Next.js audit server.

**Evidence:** src/infrastructure/auth/cookie-config.ts:4 sets Path=/admin; src/infrastructure/auth/better-auth.ts:76 applies it. src/app/api/v1/_http/routes.ts:272 resolves the session from the API request's headers.

**Scenario and result:** After normal sign-in, Chromium held the session cookie at /admin. Its cookie selection for /api/v1/staff/branches contained zero cookies, and same-origin browser fetch returned **401 UNAUTHENTICATED**. A control HTTP request manually forwarding the same session cookie returned **200**, confirming that credentials and server authorization were otherwise valid.

**Why it matters:** API-A1…A3 cannot be used by the signed-in browser as designed. Future staff reservation screens would inherit this failure.

**Recommendation:** Approve a session-cookie transport scope that covers the actual protected surfaces. Preserve HttpOnly, Secure, SameSite, and origin checks, and verify old-cookie removal during any path migration. Add a real browser login-to-REST check.

**Immediate action:** Yes, before further staff API integration.

### F07. MEDIUM: The initial seed can create a known weak administrator password

**Status:** Verified source behavior; exposure is conditional, not evidence of compromise.

**Evidence:** prisma/seed-initial.mts:47–66 supplies a known default password and validates a supplied strong password only when NODE_ENV equals production. Lines 92–105 create an active ADMIN credential. docs/operations/deployment.md:53 explicitly allows the default locally and in staging, while docs/security/security-controls.md requires secure provisioning.

**Scenario:** An externally reachable staging deployment, or a production database seeded without the production environment flag, gets a predictable administrator credential. The target database URL does not independently establish the environment.

**Why it matters:** A seed convenience can bypass the normal staff password policy on a real account.

**Recommendation:** Require a strong explicitly supplied password for real bootstrap accounts, irrespective of NODE_ENV. Keep any disposable demo identity separate. Check existing exposed environments for accounts created through this path.

**Immediate action:** Yes before exposed staging/production provisioning; this is not a reason to stop isolated local domain work.

**Verified security strengths:** Active-user checks, immediate database session revocation, refreshed role and branch assignments, authorization before protected data access, strict REST origin checks, escaped visitor text, allowlisted map origins, image re-encoding, and nonce CSP are present. No live production credentials, host configuration, or runtime grants were inspected, so operational security is not certified.

## 6. Database and Data Integrity Findings

### F04. MEDIUM: Concurrent media attachment and deletion violate reference safety

**Status:** Reproduced using the actual repositories and PostgreSQL in a disposable database.

**Evidence:** src/infrastructure/db/prisma/repositories/media-repository.ts:580 checks usage, then line 587 marks the asset DELETED. src/infrastructure/db/prisma/repositories/room-repository.ts:315 checks eligibility separately, then line 326 inserts references. src/application/media/media-library.ts:258–262 subsequently deletes the stored file. The default transaction helper is src/infrastructure/db/prisma/transaction.ts:10.

**Reproduction:** Pause deletion immediately after the real usage query returns zero. Let room attachment commit, then resume deletion. Both operations return success, the asset is DELETED, and one RoomMedia reference remains. Actual result:

~~~json
{"attachmentOk":true,"deletionOk":true,"mediaStatus":"DELETED","referencingRows":1}
~~~

**Why it matters:** The foreign key protects row existence, not the soft-delete state. The deletion use case can remove bytes still referenced by content, violating FR-CMS-8 and making images disappear. This is a CMS consistency failure, not reservation overselling.

**Recommendation:** Use one coordinated database concurrency protocol for asset eligibility, attachment, and soft deletion. Merely wrapping each operation in its own transaction is insufficient. Add a controlled test with two database connections.

**Immediate action:** Yes before production CMS operation; it need not block independent inventory-domain work.

### F05. MEDIUM: Backup completion does not guarantee a restorable media snapshot

**Status:** Reproduced with the real backup script, disposable database, and temporary media.

**Evidence:** scripts/backup.sh:43 dumps the database, line 47 archives media, then lines 48–50 scan the live media tree independently for checksums. scripts/restore.sh:56 restores the database before lines 65–67 validate extracted media.

**Reproduction:** A wrapper ran the real tar command, then added a new immutable image before the checksum scan, simulating a concurrent upload. Backup exited **0** and reported completion. Its archive held one image, but its manifest listed two. The exact restore checksum check exited **1**, because the second file did not exist in the archive.

**Why it matters:** A nominally successful scheduled backup can fail recovery. A deletion between the database snapshot and media archive can also remove a file still needed by the dump; that additional interleaving was source-traced rather than separately reproduced. The Phase 11 quiet restore drill does not cover either concurrency condition.

**Recommendation:** Obtain a coordinated stable database/media view, or suspend the relevant media mutations while taking it. Build the manifest from that stable archived view. Verify media integrity before changing a recovery target.

**Immediate action:** Yes before relying on the Phase 12 backup procedure.

### F06. MEDIUM: Interrupted upload finalization can leave permanent orphan objects

**Status:** Verified implementation path and imported-code reproduction with in-memory storage/repository ports. A process-kill test on the real filesystem was not run.

**Evidence:** src/application/media/ingest-image.ts:129–135 stores the final object before marking the asset READY. src/application/media/cleanup-media.ts:44–47 only discards quarantine for abandoned pending rows; lines 68–70 purge failed rows without removing a final object. src/infrastructure/db/prisma/repositories/media-repository.ts:611–624 does not return storage keys for those categories.

**Scenario:** The process stops after storing an object but before the READY update. Cleanup marks the row failed; a later cleanup purges it, losing the object key while leaving the file. The reproduction ended with the database row gone and the object retained.

**Why it matters:** Repeated crashes or failed finalization can consume persistent storage and backups indefinitely, without an application record from which to clean up.

**Recommendation:** Make object removal idempotent for abandoned and failed uploads before purging their records, and retain enough information to retry failure safely. Test interruption specifically after the final object write.

**Immediate action:** Before production media operation; no immediate development stop.

### F08. MEDIUM: The documented fresh seed leaves public branch contact data empty

**Status:** Reproduced through the documented migration and initial-content commands.

**Evidence:** prisma/seed-initial.mts:335 initializes structural records first. prisma/seed-data.ts:36 preserves the existing default branch. The later import at prisma/seed-initial.mts:183–201 writes contact/location only into SiteSettings. Public branch mapping reads Branch at src/application/public/view-models.ts:163–185.

**Result:** On a new disposable database, all six migrations applied and the production-mode initial seed exited **0**, creating three rooms, three facilities, 33 READY images, and three published pages. Branch contact, address, city/country, coordinates, and map URL remained NULL. SiteSettings held the imported contact and coordinates.

**Why it matters:** A successful installation produces incomplete contact pages and directions, despite docs/operations/deployment.md:50 promising those inputs. Existing migrated data masks the problem.

**Recommendation:** Populate the branch-owned fields through the fresh-install seed without overwriting later CMS edits. Add a fresh deployment-path check. E2E fixtures at tests/e2e/fixtures/public-content.mts:108 explicitly populate Branch and therefore bypass this defect.

**Immediate action:** Before fresh deployment or content migration rehearsal.

### F13. MEDIUM: The last active administrator invariant is not concurrency safe

**Status:** Verified source path and an imported-code in-memory interleaving. Already acknowledged in docs/delivery/reports/m4-backend-foundations.md:224.

**Evidence:** scripts/staff-admin.ts:52 counts other active administrators. setStaffActive checks at line 213 before its mutation transaction at line 215; setStaffRole does the same at lines 231 and 234.

**Scenario:** Two commands target the only two active administrators. Each observes the other, then both deactivate or demote. The in-memory reproduction of the real function returned success for both deactivations and zero active administrators.

**Why it matters:** Administrative access can be lost even though each command appears protected. This requires concurrent operator changes, not an unauthenticated remote attack.

**Recommendation:** Serialize the invariant check and change in one locked transaction before reusing the path for interactive staff management. Add a real concurrent database test.

**Immediate action:** No new prerequisite for M6 if operator changes remain serialized. Preserve the explicit M12 debt and close it before the staff-management UI.

**Schema/migration assessment:** The six migrations establish branch ownership with backfill, NOT NULL foreign keys, per-branch page keys, per-branch active sort-order uniqueness, and the Room(id, branchId) composite target. Branch creation writes pages and audit in one transaction. UTC is configured on Prisma connections. No new reservation consistency claim can be made until M6+ introduces and tests its actual schema and locked transactions.

## 7. Testing Assessment

### Commands and actual results

Environment: macOS, Node **24.21.0**, npm **11.21.0**, PostgreSQL **18.4**. The repository pins Node 22; no pinned-runtime verification is claimed.

| Command/check | Actual audit result |
| --- | --- |
| npm run check | Exit 1 overall. Format, lint, initial typecheck, and unit stages passed; Turbopack build failed on worker-port EPERM. |
| Unit stage, npm run test | **45 files, 905 tests passed**. jsdom emitted a navigation-not-implemented diagnostic; no test failed. |
| TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_audit_20261108_test npm run test:integration | **17 files, 224 tests passed**, exit 0. This includes migration/schema checks and real PostgreSQL operations. |
| npm run build, escalated retry | Same Turbopack worker-port permission failure. No production build pass claimed. |
| npm run build -- --webpack | Compilation succeeded, then generated route type checks failed because the wrapper context is optional (src/app/api/v1/_http/routes.ts:34–38). |
| npm run typecheck immediately after the webpack fallback | Failed on generated webpack checks. Both production and development fallback-generated app type folders were subsequently moved to /tmp; normal next typegen succeeded, and the final npm run typecheck passed, exit 0. No source change was made. |
| Real Chromium login and HTTP probe against npm run dev -- --webpack on port 3100 | Reproduced F02 and F03, with real sessions and disposable data. Development runtime evidence, not production E2E certification. |
| Existing branch-roles.spec.ts, desktop-chromium, reused audit development server | Initial run: **3 passed, 2 failed** with ERR_ABORTED navigation at /admin/pages/home. |
| Same two failed browser cases, --grep 'denied every CMS route' --workers=1 | **2 passed**, exit 0. This does not turn the original parallel run or full production suite into a green gate. No authorization bypass was observed. |
| Fresh isolated db:deploy and db:seed:initial | Both exit 0; all six migrations apply, but F08 reproduced. |
| npm audit --omit=dev --json, online retry | Exit 1 with advisories. Twelve affected package entries; applicability assessed under F01. |
| Controlled media/backup reproductions | F04 and F05 reproduced; see their exact results above. |
| Full production E2E, cross-browser, Lighthouse, production content audit, hosted CI, and a complete production-sized restore drill | Not completed in this audit. Historical reports are not substituted for current results. |

The webpack type diagnostic is specific to that fallback validator. The default validator uses a different assignability check, and the normal build did not reach a conclusive result here. Treat this as a verification limitation and fallback compatibility observation, rather than asserting that the configured production build is broken. The audit server was stopped after the probes. Its generated webpack type files were set aside to leave the ordinary typecheck usable.

### What the suite proves well

There are useful behavior tests for publication readiness, capability refusal before repository access, branch isolation, scoped enquiries, transaction rollback, unique constraints, migration backfill, stale settings edits, image validation, and public metadata. These are substantially stronger than snapshot counts alone.

### Why green results missed important defects

1. **Authentication transport is mocked:** tests/integration/branch-api.test.ts:34–36 substitutes the session resolver. It cannot prove that the browser sends the cookie (F02).
2. **Framework context is mocked:** that same file's lines 22–32 replace updateTag with an unconstrained function. It cannot prove a Route Handler may call that API (F03). Current CMS branch E2E goes through Server Actions.
3. **Sequential media checks miss an interleaving:** tests/integration/constraints.test.ts:107 covers referenced deletion sequentially. It does not overlap eligibility checks, attachment, and soft deletion (F04).
4. **Stream abort is not process interruption:** the existing aborted-upload test does not cover the interval after final object creation and before READY (F06).
5. **Fixtures are not deployment:** E2E populates branch fields directly rather than executing the initial-content seed (F08).
6. **Persistence is not visible behavior:** storing a logo selection does not establish that the header uses it (F12).
7. **URL invalidation is not URL continuity:** the slug-change unit test checks cache tags, without following the old published URL (F10).
8. **A quiet backup is not a concurrent snapshot:** the earlier restore drill does not exercise normal media writes during backup (F05).

The useful next tests are these targeted boundary scenarios, rather than raising aggregate test counts. A fresh runtime gate should remain required after the approved fixes.

## 8. Code Quality Findings

### F03. HIGH: Branch REST writes commit and then fail in cache invalidation

**Status:** Reproduced through an authenticated HTTP PATCH and verified against the installed Next.js runtime.

**Evidence:** src/infrastructure/cache/next-cache-invalidator.ts:3,12 calls updateTag. src/composition/content.ts:72–79 injects that adapter into ManageBranches; src/composition/api.ts:70–79 reuses it for REST. src/application/branches/manage-branches.ts:163–179 commits the repository operation before invalidation.

The installed Next.js 16.3.3 guide, node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md:12, excludes Route Handlers. Its runtime at node_modules/next/dist/server/web/spec-extension/revalidate.js:54–63 throws for a route execution context.

**Result:** A request manually forwarding a valid audit session, to isolate F03 from F02, returned **500 INTERNAL**. A subsequent authorized staff query showed that the branch name had changed and its ACTIVE state was saved. The server stack identified updateTag inside NextCacheInvalidator. Therefore this is an actual false failure after commit, not a hypothetical network outage.

**Why it matters:** Clients receive an error for a successful mutation, retries can conflict, and the intended public cache tags are not invalidated. A branch status change can leave cached public visibility inconsistent with the saved state.

**Recommendation:** Compose a cache adapter valid for Route Handlers, with the approved freshness semantics; retain Server Action semantics where needed. Verify a real HTTP mutation, its database state, audit row, response, and public freshness without mocking Next cache behavior.

**Immediate action:** Yes before extending or relying on staff REST writes.

### F09. MEDIUM: Enquiries have no full detail or archive workflow

**Status:** Verified source and route inventory.

**Evidence:** src/presentation/admin/enquiries/enquiry-table.tsx:7,47–49 truncates messages at 120 characters. src/app/admin/(protected)/enquiries contains only page.tsx. No detail/expansion or read/archive command exists. docs/requirements/functional-requirements.md:39 promises viewing and archiving; docs/frontend/admin-dashboard.md specifies detail/status behavior. The Phase 4 report deferred those controls to Phase 7.

**Scenario:** A long message is stored, including one whose email notification failed. Staff can see its preview and delivery status, but cannot read its complete contents or archive it through the product.

**Why it matters:** The contact intake path works, but the staff workflow for handling those enquiries is incomplete.

**Recommendation:** Complete a scoped detail and status workflow with the existing enquiry capabilities and branch checks. Test long messages, failed delivery, and cross-branch refusal.

**Immediate action:** Before launch and handover; does not block inventory implementation.

### F10. MEDIUM: Published slug edits silently break URL continuity

**Status:** Verified source behavior and absence of a redirect history/workflow.

**Evidence:** src/presentation/admin/content/catalog-form.tsx:222 keeps the slug editable with a hint. src/application/content/catalog-commands.ts:109–120 saves it and invalidates old/new tags. src/infrastructure/db/prisma/repositories/room-repository.ts:121 and facility-repository.ts:117 persist the change. docs/domain/content-model.md:115 requires confirmation and a redirect plan; docs/frontend/seo.md:27 requires a redirect record or deployment-managed redirect.

**Scenario:** A published listing slug changes. The previous detail URL no longer resolves. Any hardcoded legacy mapping to the old slug also becomes ineffective.

**Why it matters:** Existing links and search traffic break despite the explicit editorial guardrail.

**Recommendation:** Prevent published slug changes without an approved redirect path, or implement a confirmed redirect workflow after owner approval. Test both the former branch URL and affected legacy URL.

**Immediate action:** Before public launch or normal published-slug editing.

### F11. MEDIUM: Navigation and branch switching ignore page publication state

**Status:** Verified source path and direct execution of the pure navigation functions.

**Evidence:** src/presentation/site/site-links.ts:22–23 always emits About and Contact. src/domain/branches/switch-target.ts:20–22 preserves those page types without checking publication. src/app/(marketing)/[branch]/about/page.tsx:28 and contact/page.tsx:45 return notFound for an unpublished page.

**Scenario:** Activate a branch with draft pages, or unpublish its Contact page. Navigation still advertises the unavailable page, and switching from another branch's Contact targets a 404 instead of an available fallback.

**Why it matters:** FR-WEB-1 and FR-SITE-4 are only partially met. The detailed M5 spec also assumes these pages exist, so this is a spec/requirements inconsistency, not simply careless implementation of an unambiguous contract.

**Recommendation:** Resolve the expectation with the owner, then include publication availability in navigation and switch-target decisions, or enforce an approved activation prerequisite.

**Immediate action:** Before activating partially published branches; no inventory-development stop.

### F12. MEDIUM: Editable logo settings do not drive visible branding

**Status:** Verified rendering and settings data paths.

**Evidence:** src/presentation/admin/media/site-images-form.tsx:23–24 promises a header Logo and scrolling Compact logo. src/presentation/site/brand-logo.tsx:3–4 imports static artwork and line 24 always selects it. Header/footer render that component without configured media. The configured primary logo is used for structured data, while the compact logo is absent from PublicSettings.

**Scenario:** An administrator saves a different logo successfully. The visible header, scrolled header, and footer retain the checked-in artwork.

**Why it matters:** FR-CMS-2 and the actual form promise content control the product does not provide.

**Recommendation:** Use configured images with the approved artwork as fallback, or obtain an explicit decision retiring the nonfunctional settings and correct the form. The approved visual artwork alone does not resolve the misleading controls.

**Immediate action:** Before CMS handover.

No broad refactor is recommended for these defects. Most are missing end-to-end behavior or narrow adapter responsibilities, not a general code readability crisis.

## 9. Technical Debt

### F14. LOW: Current documentation summaries misstate implemented status

**Status:** Verified documentation drift.

**Evidence:** docs/overview.md:10 calls branch websites planned; docs/architecture/overview.md:5 labels the branch/API/audit foundations planned; docs/requirements/functional-requirements.md:5 says none of the recent decisions is implemented; docs/testing/quality-gates.md:53 concludes there are no pre-existing failures using an older baseline. These conflict with the accepted M4/M5 reports and current code.

**Why it matters:** A later agent can repeat work, wrongly classify scope, or treat historical verification as current evidence.

**Recommendation:** Surgically update present-tense status summaries and link to current evidence during the approved sync. Preserve historical phase reports and superseded ADRs as historical records.

**Immediate action:** No. Fold this into the accepted remediation sync rather than creating more status documents.

### Existing decisions and explicit deferrals

These are tracked limitations or later milestone responsibilities, not additional newly discovered defects:

- The Promotion table and retired SiteSettings contact/map columns remain for a future contract migration.
- Inventory, pricing, bookings, payments, WhatsApp, outbox processing, and their concurrency tests are future work.
- Audit append-only runtime grants and separate migration/runtime privileges still need Phase 12 provisioning and verification.
- The approximate rate limiter and expired counter cleanup are already recorded for the first public rate-limited reservation endpoint.
- Deep module boundaries are only partially automated for legacy CMS modules.
- Manual PMS synchronization remains an accepted operational limitation. No amount of local locking guarantees consistency with reservations absent from Rivana.
- Real HTTPS admin tests, current cross-browser/accessibility checks, production email delivery, content/privacy/media approval, and a production-sized recovery rehearsal remain launch work.

No significant unused direct dependency was demonstrated merely because a package appears in the lockfile. Transitive tooling advisories should be assessed in their actual execution context. There is no justification for deleting dependencies or historical tables indiscriminately.

## 10. Prioritized Remediation Plan

These are recommendations for owner approval, not approved implementation tasks or new architecture decisions.

| Priority | Proposed bounded task | Completion evidence |
| --- | --- | --- |
| 1 | Resolve staff cookie transport (F02) | Real sign-in followed by browser staff GET/mutation; signed-out, wrong-role, cross-branch, and foreign-origin requests still refused; cookie migration covered. |
| 1 | Correct REST cache composition (F03) | Real POST/PATCH returns the correct response, commits once, writes audit, and updates the affected branch's public views. No mock of the critical Next cache boundary. |
| 1 before exposure | Patch affected dependencies (F01) | Reviewed version changes, current advisory triage, pinned-runtime build, integration, and production E2E. |
| 1 before exposure | Remove unsafe bootstrap behavior (F07) | Fresh provisioning requires a supplied strong credential, and existing accounts are not silently reset. |
| 2 before launch | Coordinate media reference/deletion and crash cleanup (F04/F06), as separate reviewable tasks | Deterministic two-connection integrity test and interruption-after-put recovery test. No referenced bytes deleted; orphan objects remain discoverable until removed. |
| 2 before launch | Stabilize backup/restore snapshots (F05) | Recovery from a backup taken during controlled uploads and deletions, with verified files and matching database references. |
| 2 before deployment rehearsal | Correct branch-owned initial data (F08) | Run the documented commands on a fresh database; public contact/directions are complete; a repeat seed preserves intended edits. |
| 3 before handover | Complete enquiry management and correct CMS/public promises (F09–F12), one behavior per task | Full long-message handling, scoped status changes, old URL continuity, unpublished-page fallback, and visible logo behavior. |
| Existing M12 responsibility | Enforce the final-administrator invariant in one locked transaction (F13) | Two concurrent changes cannot eliminate all active administrators. |
| After accepted repairs | Sync current summaries and evidence (F14) | Current implementation/planned status agrees across the entry documents without rewriting historical records. |

**Recommendation on continuing:** Approve small repairs for F02/F03 before new staff REST consumers are built, and resolve F01 before any external exposure. Independent M6 design or domain work can proceed once those dependencies are understood; the remaining medium findings should receive explicit prelaunch tasks rather than forcing a restart of completed milestones.

**Required revalidation:** Run the normal build and complete production E2E on the pinned Node runtime in an environment where Turbopack can run. Preserve the distinction between the development smoke results above and release evidence. The user should accept each corrective task under the current workflow before the next begins.

**Audit stop:** No fixes, refactors, schema changes, commits, or pushes were made. Approval is required before remediation begins.
