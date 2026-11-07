# Quality gates

The checks every change must pass, the exact commands, and the most recent recorded results. A change is green only when format, lint, typecheck, unit, integration, build, and the Chromium E2E suites all pass on the final tree.

## Commands

| Gate | Command | Notes |
| --- | --- | --- |
| Formatting | `npm run format:check` | Prettier; `docs/`, `design/`, `.claude/`, `.agents/` are ignored |
| Lint (incl. boundary rules) | `npm run lint` | ESLint 9 flat config |
| Type check | `npm run typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Unit and component tests | `npm run test` | Vitest, jsdom, `tests/unit/**` |
| Integration tests | `TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration` | Drops, recreates, and migrates the `*_test` database |
| Production build | `npm run build` | |
| Aggregate | `npm run check` | format, lint, typecheck, unit, build (not integration or E2E) |
| E2E (Chromium projects) | `E2E_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_e2e_test npm run test:e2e` | Builds and starts on :3100 |
| E2E cross-browser | `CROSS_BROWSER=1 npx playwright test --project=webkit-*` | Firefox cannot start on macOS 27 locally; run it in Linux CI |
| Lighthouse | `CHROME_PATH=… npm run lighthouse` / `lighthouse:mobile` | |
| OpenAPI freshness (planned M4) | part of `npm run test` | |

A milestone is green only when format, lint, typecheck, unit, integration, build, and the Chromium E2E suites all pass on the final tree.

## Gates per task

Each task runs the gates for its risk tier ([agent-workflow.md](../engineering/agent-workflow.md#risk-classification)) before its independent review. Milestone close always runs the full set above.

| Task touches | Gates |
| --- | --- |
| Any code (every tier) | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` |
| Domain rules, application, repositories, database, or API (medium and critical) | plus `npm run test:integration` |
| A migration | plus the `prisma migrate diff` drift check ([migrations-and-seeding.md](../database/migrations-and-seeding.md)) |
| Locking, inventory, or concurrent writes | plus the concurrency suite alone, 20 iterations (see the milestones README) |
| Routes, pages, components, or `next.config` / `proxy` | plus `npm run build` and `npm run test:e2e` |
| Critical tier | all of the above that apply, and `npm run build` |

Record exact commands and counts in the review package. If a gate cannot run, say so and why; never report it as passed.

## Latest recorded results (2026-10-24)

Local: macOS 27, Node **24.21.0** (project pins 22.23.2; the known deviation recorded in Phase 1), npm 11.21.0, PostgreSQL via Postgres.app on 5432.

| Gate | Result |
| --- | --- |
| `npm run format:check` | **Failed at first:** 51 files, all inside the newly installed `.agents/skills/` (Codex copy of the skills). Fixed by adding `.agents` to `.prettierignore`, matching the existing `.claude` entry. Re-run: **pass** |
| `npm run lint` | **Pass** (0 problems) |
| `npm run typecheck` | **Pass** |
| `npm run test` | **Pass**: 37 files, 524 tests |
| `npm run test:integration` | **Pass**: 12 files, 155 tests |
| `npm run build` | **Pass**: all routes dynamic, proxy active |
| `npm run test:e2e` (Chromium projects) | **Pass**: 141 passed, 30 skipped (designed viewport scoping), 0 failed (1.2 min) |
| Cross-browser, Lighthouse | Not run in this baseline |

These match the Phase 11 report (524 / 155 / 141), so there are no pre-existing failures.

