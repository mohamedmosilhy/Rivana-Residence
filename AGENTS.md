<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rivana Residence

Hotel marketing website, CMS, and (in progress) a self-managed multi-branch reservation system. It is one Next.js application. Start with [docs/README.md](./docs/README.md).

## Stack

- **Language / Runtime**: TypeScript 5.9 (strict), Node 26.13.0 LTS (local, CI, and hosting; `.nvmrc`, `.node-version`)
- **Framework**: Next.js 16.4 App Router, React 19.2. Next.js is the **only** application framework (frontend and backend)
- **Key dependencies**: Prisma 7.10 + `@prisma/adapter-pg` on PostgreSQL 17+/18, Better Auth 1.7, Zod 4, Tailwind CSS 4.3, `motion` 13, sharp, Nodemailer
- **Tests**: Vitest 5 (unit + jsdom, integration on real PostgreSQL), Playwright 1.63 (+ axe), Lighthouse CI
- **Package manager**: npm 11 (`save-exact`)

## Build approach

Milestones (M4–M15 in [docs/delivery/roadmap.md](./docs/delivery/roadmap.md), replanned 2026-11-06; one brief per milestone in [docs/delivery/milestones/](./docs/delivery/milestones/README.md)) are delivered as **small tasks** (the brief's Task breakdown), each planned, verified, independently reviewed, and accepted by the owner before the next begins (task-based workflow, 2026-11-07). Backend rules and the API land before the screens that use them.

## Commands

```bash
# Install (runs prisma generate)
npm ci

# Dev server (one per checkout)
npm run dev

# Build
npm run build

# Test
npm run check                     # format:check, lint, typecheck, unit, build
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration
E2E_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_e2e_test npm run test:e2e

# Database
npm run db:migrate                # dev migrations; production uses npm run db:deploy
npm run staff -- create --email … --name … --role ADMIN   # passwords via prompt or --password-stdin

# Maintenance (hourly app-user cron; bounded availability buckets only)
npm run throttles -- cleanup-public
```

## Specs

- Architecture decisions: `docs/adr/NNN-title.md` (index: `docs/adr/README.md`).
- Project documentation is one topic-based tree (index: `docs/README.md`): `requirements/`, `domain/`, `architecture/`, `database/`, `api/`, `security/`, `frontend/`, `testing/`, `operations/`, `delivery/` (roadmap and phase or milestone reports), `engineering/`. Each document marks what is implemented and what is planned.
- Evidence for each finished phase or milestone goes in `docs/delivery/reports/`.
- Source material (brief, scope PDF): `docs/source/`.
- Skill-generated build specs, if used: `docs/specs/NNNN-title.md`. They must cite and not contradict the ADRs.

## Rules

- **Next.js only.** Do not introduce NestJS, Express, Fastify, or any second backend or application server.
- **REST APIs are Next.js Route Handlers** under `src/app/api/v1`, kept thin: parse, call one use case, map the result. Server Actions are fine for CMS forms but **never replace the reservation REST API**.
- **Business logic lives in `src/domain` and `src/application`** (per-module folders). Never put complex workflows in Route Handlers, pages, components, or Server Actions.
- **Reuse the shared reservation values** in `src/domain/shared/{local-date,stay-range,stay-policy,occupancy,money}.ts`. Keep public stay limits separate from structural date ranges; derive branch today with `localDateAt(clock.now(), branch.timeZone)` from `src/domain/shared/zoned-time.ts`.
- **Reuse the pure inventory and nightly pricing rules** through `src/domain/inventory/index.ts` and `src/domain/pricing/index.ts`. Reduction checks use sparse sold dates and assignment ranges, without expanding empty dates or imposing the public booking horizon. These calculations do not acquire locks; availability-reducing writes must run through `InventoryGuard` and load their inputs under `InventoryLock` inside `ReservationUnitOfWork`.
- **Follow [docs/architecture/dependency-rules.md](./docs/architecture/dependency-rules.md).** Prisma only in `src/infrastructure/db`; infrastructure is constructed only in `src/composition`; presentation never imports infrastructure; domain imports no framework.
- **Server-only code stays out of client bundles** (`import "server-only"`; the lint rules).
- **Enforce authentication, capabilities, and branch scope on the server**, inside use cases (`authorize`, `authorizeBranch`). Hidden buttons are not security.
- **Public pages live under `src/app/(marketing)/[branch]/`** (spec 0002). Resolve the branch on the server with `requireBranch(params)` (active branches only, else 404) and pass its id to queries; never trust a client branch value. Every internal link carries `/{branch}`, every cache key and tag names the branch (`CACHE_TAGS` in `src/application/cache/cache-tags.ts`), and old URLs redirect through `src/infrastructure/http/legacy-redirects.ts` to the default branch `new-cairo`, which cannot be deactivated.
- **Protect reservation consistency in PostgreSQL**: room-type row lock plus count in one transaction, and constraints (ADR 016). No in-memory locks, no frontend-only checks.
- **Never fabricate an external hotel-system integration.** Synchronization with the hotel's system is manual and must never be described as real-time.
- **Keep docs and tests in sync with the code.** Run the gates and report exact results; never claim a check passed without running it.
- Detailed coding standards are in [docs/engineering/engineering-standards.md](./docs/engineering/engineering-standards.md). The working loop is in [docs/engineering/agent-workflow.md](./docs/engineering/agent-workflow.md).

## Workflow for agents

**Mandatory: [docs/engineering/agent-workflow.md](./docs/engineering/agent-workflow.md)** (task lifecycle, approval gates, risk tiers, reviewer duties, review package, scope changes). In short:

1. Work one task at a time (`M<N>-T<K>` in the brief's Task breakdown). Never implement a whole milestone in one step.
2. **Plan first** and wait for the owner's approval (task card: objective, scope, behavior, architecture, files, dependencies, acceptance criteria, tests, risk tier). Contract, schema, port, or architecture decisions need approval too.
3. Implement only the approved task. Unexpected requirement, missing decision, or architectural problem: stop, explain, recommend, wait. Preserve unrelated user changes.
4. Test and run the gates for the risk tier ([quality-gates.md](./docs/testing/quality-gates.md#gates-per-task)), then an independent review on a different model (`/check review uncommitted`).
5. Present the Engineering Review Package (critical code paths to review deeply, with `file:line`) and **wait for acceptance** before the next task. Then sync the docs and the task status, and commit.

The owner makes engineering decisions and accepts every task; a reviewer's approval never replaces that. Never claim a check passed without running it, and never hide unresolved issues.

## Agent skills

- [scope](.agents/skills/scope/): `JavaScript-Mastery-Pro/skills`, living feature scope in `docs/scope/`
- [architect](.agents/skills/architect/): `JavaScript-Mastery-Pro/skills`, decision discovery and build specs in `docs/specs/`
- [audit](.agents/skills/audit/): `JavaScript-Mastery-Pro/skills`, `AGENTS.md` gap-fill (never overwrite this file's curated text)
- [develop](.agents/skills/develop/): `JavaScript-Mastery-Pro/skills`, build from a spec (UI and logic tracks)
- [test](.agents/skills/test/): `JavaScript-Mastery-Pro/skills`, tests for changed code (Vitest/Playwright)
- [check](.agents/skills/check/): `JavaScript-Mastery-Pro/skills`, runtime verify and fresh-model review (`docs/reviews/`)
- [debug](.agents/skills/debug/): `JavaScript-Mastery-Pro/skills`, root-cause debugging loop
- [sync](.agents/skills/sync/): `JavaScript-Mastery-Pro/skills`, keep `AGENTS.md` and scope current after a change
- [document](.agents/skills/document/): `JavaScript-Mastery-Pro/skills`, PR text, changelog, release notes

Claude Code loads the same skills from `.claude/skills/`. Project rules above override any skill guidance.

## Git

- integration: on
- branch prefix: `m<N>-` for reservation milestones (existing phases used `phase-<N>-`)
- commit: one commit per accepted task on the milestone branch (the owner's acceptance is the request to commit); the branch is pushed, merged into `main`, and `main` pushed when the milestone is accepted (owner rule, 2026-11-07); the next milestone branches from `main`; otherwise never push without being asked

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

- [src/app/api/AGENTS.md](src/app/api/AGENTS.md): Route Handler rules for `/api/v1` (wrappers, thin handlers, contracts and OpenAPI)
- [tests/integration/reservations/AGENTS.md](tests/integration/reservations/AGENTS.md): real PostgreSQL transaction and concurrency test conventions
