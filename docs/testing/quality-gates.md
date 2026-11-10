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

## Node 26 runtime alignment verification (accepted 2026-11-10)

The owner selected Node **26.13.0 LTS** for the Mac, CI, and hosting. On macOS with npm **11.20.0**, clean `npm ci --no-audit` and `npm run check` passed (format, lint, typecheck, **67 unit files / 1,373 tests**, production build). The full PostgreSQL integration suite passed **29 files / 391 tests**; full Chromium E2E passed **175 tests**, with **30 intentionally skipped**. Independent review by `gpt-6-astra` approved with zero findings. The [runtime report](../delivery/reports/node-26-runtime-alignment.md) records exact commands, unchanged development audit findings, and the nonfatal upstream Tailwind loader deprecation under Node 26. Those Tailwind and media tracing warnings were subsequently resolved in M6-T10. These results do not replace the historical task acceptance evidence below or claim remote Linux CI has run.

## Latest accepted task results (2026-11-10, M6-T10)

Local: Node **26.13.0**, npm **11.20.0**, PostgreSQL **18.4**. The owner accepted M6-T10 after the public API review package, conditional on resolving the Tailwind deprecation and media tracing warnings; both fixes are verified. Exact commands and evidence are in the [M6 report](../delivery/reports/m6-inventory-and-availability.md#m6-t10-accepted).

| Gate | Result |
| --- | --- |
| Clean `npm ci --no-audit` | **Pass**, including Prisma generation, with final Tailwind/PostCSS 4.3.5 |
| `npm run check` | **Pass**: format, lint, typecheck, 68 unit files / 1,385 tests, production build; neither targeted warning remains |
| `npm run test:integration -- --reporter=dot` | **Pass**: 30 files / 425 tests on disposable `rivana_test` |
| `npm run test:e2e` | **Pass**: full Chromium suite, 176 passed / 30 intentionally skipped; includes the live public P5 proof and existing media/visual journeys |
| Focused concurrency suites | **Pass**: 2 files / 28 tests; inventory and limiter races retain their 20 repetitions |
| P5 runtime proof | **Pass**: separate live browser run, 1 test, four future nights total 26000 cents; [captured HTTP response](../delivery/reports/m6-t10-worked-example.json) |
| Independent review | Initial review **Approve**, zero findings; 67 unit/architecture and 34 P5 PostgreSQL tests rerun. Warning-fix recheck by `claude-sonnet-5-5`: **Approve**, zero findings ([recheck](../reviews/2026-11-10-m6-t10-warning-recheck.md)) |
| Audit | Zero production findings; 26 pre-existing development findings retained, with no newly flagged packages |
| Migration drift | Not applicable: no schema or migration change |

The final aggregate, integration, and E2E logs contain neither `DEP0205` nor the dynamic filesystem tracing warning. The media path check still canonicalizes both the media root and application boundary and rejects symlink aliases inside the checkout. Build tracing no longer expands the whole checkout: the largest manifest fell from 1,320 to 339 files. These task results do not claim milestone-close verification or acceptance.

## Historical baseline (2026-10-24)

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

