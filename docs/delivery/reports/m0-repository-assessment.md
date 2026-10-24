# Repository assessment (M0)

Date: 2026-10-24. Branch `main` at `4fc94e5`. Labels: **[Fact]** verified in the repo or by running a command; **[Assumption]**; **[Recommendation]**; **[Decision needed]** (see [requirements/assumptions-and-open-questions.md](../../requirements/assumptions-and-open-questions.md)).

## 1. Structure and verified stack

- **[Fact]** One Next.js 16.3.3 App Router application with React 19.2, TypeScript 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Tailwind CSS 4.3, `motion` 13.4 (Framer Motion's successor), Zod 4.6, Better Auth 1.7.6, Prisma 7.10 with `@prisma/adapter-pg` on PostgreSQL, sharp, and Nodemailer. Package manager npm 11.7 (`save-exact`).
- **[Fact]** Node is pinned to 22.23.2 (`.nvmrc`, engines). This workstation runs Node 24.21.0, a known deviation recorded in Phase 1.
- **[Fact]** Clean-architecture layering: `src/domain`, `src/application` (use cases plus ports), `src/infrastructure` (Prisma, auth, media, email, http, cache), `src/composition` (the only wiring point), `src/presentation` (components), and `src/app` (routes). It is enforced by ESLint `no-restricted-imports` and `tests/unit/architecture/persistence-boundaries.test.ts`.
- **[Fact]** `src/proxy.ts` (Next 16's proxy, formerly middleware) sets a per-request nonce CSP and optimistically redirects unauthenticated `/admin` requests.
- **[Fact]** CI (`.github/workflows/ci.yml`): quality (format, lint, typecheck, unit, build), integration (PostgreSQL 18 service), and E2E (Chromium).

## 2. Marketing and CMS functionality to preserve

- **[Fact]** Public routes: `/`, `/about`, `/rooms`, `/rooms/[slug]`, `/facilities`, `/facilities/[slug]`, `/contact`, `sitemap.xml`, `robots.txt`, legacy `.html` redirects, `/media/[...key]`.
- **[Fact]** CMS at `/admin`: overview, pages (typed sections), rooms, facilities, media library (upload Route Handler, replace, rights, usage-safe delete), promotions (popup code campaigns), enquiries, settings, staff, and account (sessions, password).
- **[Fact]** Every Book Now control is an inert `aria-disabled` button with an explanation, driven by `DisabledBookingProvider` through the `BookingProvider` port.
- **[Fact]** Roadmap Phases 0–10 are accepted; Phase 11 (release candidate) is ready for review; Phase 12 (launch) has not started; Phase 13 (external module) was blocked by the provider and is now superseded.

## 3. Database, migrations, and authentication

- **[Fact]** 18 Prisma models: auth (`User`, `Session`, `Account`, `Verification`, `LoginThrottle`), content (`SiteSettings`, `SocialLink`, `Page`, `PageSection`, `PageSectionMedia`, `Room`, `RoomFeature`, `RoomMedia`, `Facility`, `FacilityMedia`, `MediaAsset`, `Promotion`), and `ContactEnquiry`. 3 additive migrations. SQL `CHECK` constraints live in migrations.
- **[Fact]** `Room` is a marketing room type with `maxAdults` and `maxChildren`, a globally unique slug, and **no branch, price, or inventory**.
- **[Fact]** Every PrismaPg connection forces `-c TimeZone=UTC` (a Phase 5 fix).
- **[Fact]** Auth: Better Auth email and password, database sessions, public sign-up disabled, HMAC-keyed login throttling, provisioning through `npm run staff`. Roles `EDITOR` and `ADMIN`. A role-to-capability map lives in `src/domain/auth/capabilities.ts`. `authorize()` is called inside every use case, and an authorization sweep test covers all protected commands.
- **[Fact]** A test deliberately forbids booking, price, guest, reservation, and similar words in the schema (`booking scope`). It must be replaced in M4.

## 4. Reusable code

| Existing | Reuse for |
| --- | --- |
| `Result`/`ApplicationErrorCode`, `DomainValidationError` | Use-case results and the HTTP error mapping |
| Capability model plus `authorize()` and the authorization sweep | New roles, capabilities, and branch checks |
| `getCurrentStaff()` / `resolveStaffSession` | Staff API authentication |
| `isSameOriginRequest` (media upload) | CSRF check for staff REST |
| Upload Route Handler pattern | Template for `/api/v1` handlers |
| `LoginThrottle` store (HMAC keys, atomic counters) | Public rate limits |
| `Clock`, `IdGenerator` (CUID2), `Hasher` ports | Deterministic reservation logic |
| `zoned-time.ts` | Branch "today" and display |
| `ContactDelivery` SMTP adapter and outbox mode | Reservation email sender |
| `BookingProvider` port + `BookNowButton` | Per-branch internal booking launch |
| Admin shell, capability-filtered navigation, data table, confirm dialog, toasts, forms | Staff reservation screens |
| `withTransaction`, `translatePrismaWriteError` | Unit of work and conflict mapping |
| Integration and E2E harnesses with disposable databases | Concurrency and journey tests |
| `scripts/backup.sh`/`restore.sh` | Covers new tables automatically (`pg_dump`) |

## 5. Scope PDF summary

**[Fact]** Read in full on 2026-10-24 (7 pages; text extracted with `pypdf` because no PDF tools are installed). Version 1.0, dated 15 August 2026, status "For Client Review & Approval", with signature blocks unsigned. It covers:

1. the public website (including Terms and Cancellation pages, and a booking flow);
2. rooms and pricing with date-based prices;
3. offers with validity periods, and loyalty;
4. the reservation flow through the hotel's PMS API, with online payment and pay on arrival;
5. email and WhatsApp verification;
6. customer accounts and loyalty;
7. one dashboard with Receptionist, Manager, and Admin permissions;
8. multi-branch support (subdomain example);
9. role permissions and action records;
10. statistics;
11. open points to confirm.

## 6. PDF API plan versus the self-managed plan

**[Fact]** Classification is in [requirements/scope-traceability-matrix.md](../../requirements/scope-traceability-matrix.md). In short: availability through the PMS API, pushing reservations to the PMS, and admin "manage the external integration" are **replaced** by Rivana-owned inventory plus manual synchronization. Payment, accounts, loyalty, WhatsApp, and subdomains are **deferred**. Roles, branches, pricing, statistics, and audit are **retained with modifications**. Manual-sync procedures, external-reservation recording, blocks, physical rooms, and front-desk transitions are **new**.

## 7. Proposed domain model

**[Recommendation]** Branch-owned room types (the existing `Room` gains `branchId`). Physical rooms per room type. Room-type inventory counted per night with optional physical-room assignment. Base rates plus seasonal and offer periods. Reservations with lines and per-night price snapshots. Request-to-book lifecycle. Append-only audit. Email outbox. See [domain/domain-model.md](../../domain/domain-model.md) and [database/data-model.md](../../database/data-model.md).

## 8. Proposed architecture

**[Recommendation]** The same modular monolith. New modules in the existing layer folders (ADR 015). REST under `/api/v1` through thin Route Handlers, with a shared `_http` layer and Zod contracts in `src/contracts` generating OpenAPI (ADR 014). Server Components read through use cases. Client Components mutate through the typed API client. See [architecture/overview.md](../../architecture/overview.md).

## 9. Integrity and concurrency risks

- **[Fact]** Nothing in the current schema can count or lock inventory.
- **[Recommendation]** Room-type row lock (`FOR NO KEY UPDATE`) in `READ COMMITTED`, then count and insert in one transaction, for every availability-reducing write. Composite FKs keep data same-branch. GiST exclusion constraints cover assignments, blocks, and rate periods (`btree_gist`). Idempotency keys and optimistic `version`s. Proof by real-database concurrency tests (ADR 016, 021).
- **[Fact]** Hosting limits: CloudLinux Passenger may run several processes, the account PostgreSQL is v10, and an external managed database is needed. Only transaction-scoped primitives are used (ADR 022).
- **[Fact, permanent]** Cross-system overbooking cannot be prevented technically without an integration ([operations/known-limitations.md](../../operations/known-limitations.md)).

## 10. Security and authorization risks

Guest personal data is new to the system. The main threats are cross-branch IDOR, reference enumeration, CSRF on cookie-authenticated REST (Server Actions' built-in checks do not apply to Route Handlers), price and branch tampering, inventory squatting by bots, and log leakage. Controls are in [security/threat-model.md](../../security/threat-model.md). **[Recommendation]** TOTP for Admin and Manager before go-live.

## 11. Open business questions

26 questions with recommendations in [requirements/assumptions-and-open-questions.md](../../requirements/assumptions-and-open-questions.md).

Decided by the owner on 2026-10-24:

- Q-01: keep `EDITOR` as CMS-only.
- Q-02: request to book.
- Q-07: guests cancel only pending requests online.
- Q-16: launch the website and reservations together.

**[Decision needed]**, still consequential:

- Q-05: taxes and fees in prices.
- Q-13: guest data retention.

## 12. Documentation created or updated

Created: `requirements/` (7), `discovery/` (3), `domain/` (5), `architecture/` (4), `database/` (3), `api/` (3), `security/` (1), `frontend/` (1), `testing/` (1), `operations/` (3), `implementation/milestones.md`, ADRs 013–022, `engineering-standards.md`, `agent-workflow.md`, `project-overview.md`, this file, root `AGENTS.md` (project section), and `CLAUDE.md`. Updated with "superseded/planned" notes: `README.md`, `requirements.md`, `booking-integration.md`, `architecture.md`, `architecture-decisions.md`, `domain-model.md`, `database.md`, `security.md`, `testing.md`, `roadmap.md` (Phase 13), and ADR 008. Not created, to avoid empty or duplicate documents: separate `erd.md`, `openapi.md`, `test-matrix.md`, `quality-gates.md`, `backup-and-recovery.md`, `implementation-status.md`, and `release-checklist.md`. Their content lives in the files above, in [deployment.md](../../operations/deployment.md#backups-and-recovery), or is written at M11.

Later the same day, `docs/` was reorganized into one topic-based tree (requirements, domain, architecture, database, api, security, frontend, testing, operations, delivery, engineering). Paths above are as originally created; the current map is [../../README.md](../../README.md).

## 13. Milestones

M0–M3 were accepted on 2026-10-24. M4–M12 are planned with dependencies in [roadmap.md](../roadmap.md).

## 14. Baseline results (run 2026-10-24)

| Gate | Result |
| --- | --- |
| format:check | Fail only on the newly installed `.agents/skills` (51 files). Fixed by ignoring `.agents` like `.claude`; then pass |
| lint | Pass |
| typecheck | Pass |
| unit (`npm run test`) | Pass: 37 files, 524 tests |
| integration | Pass: 12 files, 155 tests |
| build | Pass |
| E2E (Chromium projects) | Pass: 141 passed, 30 skipped by design, 0 failed |
| Cross-browser, Lighthouse | Not run |

## 15. Skills

The user supplied `JavaScript-Mastery-Pro/skills`. **[Fact]** It was already installed for Claude Code in `.claude/skills/` (9 skills, `skills-lock.json`). It is now also installed for Codex in `.agents/skills/` with `npx skills@latest add JavaScript-Mastery-Pro/skills -a codex -s '*' -y --copy`; the copies are identical, and `npx skills list` shows Claude Code and Codex. Not yet verified from inside a Codex session. Details: [agent-workflow.md](../../engineering/agent-workflow.md#agent-skills-javascript-mastery).

## Changes made during M0–M3

Only documentation, agent configuration, `.prettierignore` (`.agents`), and the Codex skill install. No application code, schema, or test was changed.
