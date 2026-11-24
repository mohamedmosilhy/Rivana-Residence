# Quality gates

The checks for each risk tier, the commands, and the most recent recorded results. Each task runs its applicable gates. Milestone close runs the full set.

## Commands

| Gate | Command | Notes |
| --- | --- | --- |
| Formatting | `npm run format:check` | Prettier; `docs/`, `design/`, `.claude/`, `.agents/` are ignored |
| Lint (incl. boundary rules) | `npm run lint` | ESLint 9 flat config |
| Type check | `npm run typecheck` | `tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Unit, component, and adapter contract tests | `npm run test` | Vitest with jsdom or Node, `tests/unit/**` and `tests/contract/**` |
| Integration tests | `TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration` | Drops, recreates, and migrates the `*_test` database |
| Production build | `npm run build` | |
| Aggregate | `npm run check` | Format, lint, typecheck, unit and contract tests, and build |
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

## Latest accepted task results (2026-11-24, M9-T5)

`npm run check` passed formatting, lint, typecheck, 2,409 unit and contract tests across 111 files, and the production build. `npm run test:integration -- --reporter=dot --silent` passed 904 PostgreSQL tests across 59 files, including the callback suite with five parallel duplicates and two 20 round C-12 races. `npm run test:e2e -- --reporter=dot` passed 214 Chromium tests with 33 intentional skips. The scan of the client chunks found none of the four checked server markers. Claude Opus 5.5 reviewed the change, found no blockers, and its one major finding was resolved. [Task log](../delivery/reports/m9-payments-and-cancellations.md#task-log) · [Independent review](../reviews/2026-11-24-m9-t5.md)

## Previous accepted task results (2026-11-24, M9-T4)

`npm run check` passed formatting, lint, typecheck, 2,403 unit and contract tests across 111 files, and the production build. `npm run test:integration -- --reporter=dot --silent` passed 879 PostgreSQL tests across 57 files. The isolated C-14 test observed contention in 20 last unit races. Six additional retry and contention cases passed 20 repetitions each. `npm run test:e2e -- --reporter=dot` passed 214 Chromium tests with 33 intentional skips. Live verification covered A3, P6, P7, fake hosted checkout, and delivery of the “payment not completed” notices with held confirmations left untouched. GPT-6.2 Astra independently passed 19 contract and 31 PostgreSQL tests and approved the recheck. [Task log](../delivery/reports/m9-payments-and-cancellations.md#task-log) · [Independent review](../reviews/2026-11-24-m9-t4.md)

## Previous accepted task results (2026-11-23, M9-T3)

`npm run check` passed formatting, lint, typecheck, 2,399 unit and contract tests across 111 files, and the production build. `npm run test:integration -- --reporter=dot --silent` passed 864 PostgreSQL tests across 55 files. `npm run test:e2e -- --reporter=dot` passed 214 Chromium tests with 33 intentional skips. A development browser run exercised signed callbacks over HTTP, including a delayed failure and a success from distinct refund attempts on the same charge. Both simulator routes returned 404 in production. GPT-6.2 Astra approved the recheck with zero open findings after independently running 58 focused tests. [Task log](../delivery/reports/m9-payments-and-cancellations.md#task-log) · [Independent review](../reviews/2026-11-23-m9-t3.md)

## Previous accepted task results (2026-11-23, M9-T1)

`npm run check` passed formatting, lint, typecheck, 2,266 unit and contract tests across 105 files, and the production build. `npm run test:integration -- --reporter=dot --silent` passed 864 PostgreSQL tests across 55 files. Both new partial unique indexes passed 20 rounds of competing inserts with observed lock waits. Prisma reported no drift on a fresh database or a populated M8 upgrade. `npm run test:e2e` passed 212 tests with 33 intentional skips. The running app returned 201 for pay at hotel, 409 for `ONLINE`, and 422 for `PAYMOB`. GPT-6.2 Astra approved after two minor fixes, with zero open findings. [Task log](../delivery/reports/m9-payments-and-cancellations.md#task-log) · [Independent review](../reviews/2026-11-23-m9-t1.md)

## Previous accepted task results (2026-11-23, M9-T0b)

`npm run check` passed formatting, lint, typecheck, 2,266 unit and contract tests across 105 files, and the production build. `npm run test:integration -- --reporter=dot` passed 855 PostgreSQL tests across 53 files. The outbox CLI check verified both fake adapters and payload scrubbing. Production smoke checks rejected each fake flag, and the client bundle scan found none of the provider markers checked. GPT-6.2 Astra approved with zero findings after independently running 46 tests. [Task log](../delivery/reports/m9-payments-and-cancellations.md#task-log) · [Independent review](../reviews/2026-11-23-m9-t0b.md)

## Previous accepted task results (2026-11-22, M8-T12)

`npm run check` passed formatting, lint, typecheck, 2,240 unit tests across 101 files, and the production build. `npm run test:integration -- --reporter=dot` passed 855 tests across 53 files. The dedicated checkpoint test passed 20 rounds of overlapping writes. `npm run test:e2e` passed 212 tests with 33 intentional skips. The live two-session check confirmed the shared deadline, the S20 completion timestamp, the S13 backlog change, and both `400 INVALID_QUERY` refusals. GPT-6.2 Astra approved the recheck with zero open findings. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-22-m8-t12.md).

## Previous accepted task results (2026-11-22, M8-T11)

`npm run check` passed formatting, lint, typecheck, 2,226 unit tests across 100 files, and the production build. PostgreSQL integration passed 846 tests across 52 files. Parallel blocks, a block waiting on a held guest lock, and a real code confirmation racing a block each passed 20 rounds, with the overlap observed as PostgreSQL lock waits. The audit failure rollback test passed. Full Playwright passed 210 tests with 33 intentional skips, including the guest access scenario on desktop and mobile. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-22-m8-t11.md).

## Previous accepted task results (2026-11-22, M8-T10)

`npm run check` passed formatting, lint, typecheck, 2,197 unit tests across 99 files, and the production build. PostgreSQL integration passed 834 tests across 51 files. C-7 (double assignment), assignment against a block, concurrent link rotation and C-9 each passed 20 rounds. Full Chromium passed 208 tests with 33 intentional skips, including the live seven endpoint staff operations scenario on desktop and mobile. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-22-m8-t10.md).

## Earlier accepted task results (2026-11-21, M8-T9b)

`npm run check` passed formatting, lint, typecheck, 2,178 unit tests across 99 files, and the production build. PostgreSQL integration passed 812 tests across 50 files. Five dedicated concurrency scenarios passed at 20 rounds each. The unfiltered Chromium rerun passed 206 tests with 33 intentional skips, including the S6 service flow and the admin keyboard case on desktop and mobile. The keyboard test now opens a fresh authenticated document to check the first Tab. Earlier unit and contact-map failures cleared on rerun. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-21-m8-t9b.md).

## Earlier accepted task results (2026-11-21, M8-T9)

`npm run check` passed formatting, lint, typecheck, 2,176 unit tests across 99 files, and the production build. PostgreSQL integration passed 804 tests across 50 files. The four dedicated change concurrency scenarios passed 20 rounds each. The populated upgrades and Prisma drift check passed. Full Chromium passed 204 tests with 33 intentional skips, including the new staff reservation change case on desktop and mobile. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-21-m8-t9.md).

## Previous accepted task results (2026-11-21, M8-T8)

`npm run check` passed formatting, lint, typecheck, 2,154 unit tests across 98 files, and the production build. `npm run test:integration` passed 761 tests across 49 files. The dedicated staff reservation concurrency run passed five scenarios at 20 rounds each. The populated upgrade and Prisma drift check passed. The full `npm run test:e2e` run exited 0 with 201 passed, 33 skipped and one flaky mobile admin keyboard focus test. The new reservation API tests passed on both Chromium projects. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-21-m8-t8.md).

## Previous accepted task results (2026-11-20, M8-T7)

Format, lint, typecheck and build passed. 96 unit files / 2,115 tests passed. All 732 PostgreSQL integration tests passed (47 files), with the new races repeated 20 rounds. E2E was not run (no route or UI). [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-20-m8-t7.md).

## Previous accepted task results (2026-11-20, M8-T6)

Format, lint, typecheck and build passed. 95 unit files / 2,099 tests passed. All 693 PostgreSQL integration tests passed (45 files). The `outbox` and `expire-tokens` commands ran against the local database. E2E was not run. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-20-m8-t6.md).

## Earlier accepted task results (2026-11-20, M8-T5b)

All eight focused Chromium cases passed without retries. Full Chromium passed 199 with 32 intentional skips. The six focused WebKit cases passed. Firefox stopped at browser launch on this Mac. The aggregate check and all 683 PostgreSQL integration tests passed. [Task log](../delivery/reports/m8-reservations.md#task-log) and [independent review](../reviews/2026-11-20-m8-t5b.md).

## Earliest listed task results (2026-11-18, M8-T5)

The owner accepted M8-T5 with its aggregate E2E limitation recorded. [Exact commands and results](../delivery/reports/m8-reservations.md#m8-t5-verification); [independent review](../reviews/2026-11-18-m8-t5.md): Approve, all six findings resolved. This acceptance does not make the full browser gate green.

| Gate | Result |
| --- | --- |
| `npm run check` | Passed format, lint, typecheck, 94 unit files / 2,090 tests, build |
| Full PostgreSQL integration | 44 files / 683 tests passed |
| Dedicated concurrency | 3 files / 40 tests passed; new observed races repeat 20 times |
| Final aggregate Chromium E2E | Exit 1: 185 passed, 36 skipped, one existing branch-title timeout, nine unrun; dependency rerun reproduced it. All four T5 cases passed |
| Isolated branch project | All 15 passed, including the title and nine previously unrun cases |
| Live proof | Fake WhatsApp: request 201, wrong code 422, confirmation 200, replay 410; hashes, lifetimes and redacted logs checked |

The existing persistence architecture test hit its five second timeout under concurrent load, then passed in isolation and the final aggregate check. The branch-title E2E timeout remains unresolved; no unrelated timeout or assertion was changed.

## Previous accepted task results (2026-11-17, M8-T3)

The owner accepted M8-T3 after the review package. [Exact evidence](../delivery/reports/m8-reservations.md#m8-t3-verification) and [independent review](../reviews/2026-11-17-m8-t3.md).

| Gate | Result |
| --- | --- |
| `npm run check` | Passed format, lint, typecheck, 88 unit files / 1,886 tests, production build |
| Full PostgreSQL integration | Passed 41 files / 626 tests |
| Dedicated concurrency | Passed 4 files / 35 tests; relevant races repeated 20 times |
| Independent review | Approve after coupon snapshot and captured-output tests; no open findings |
| Live proof | Production P5 reflected persisted consumption and its release; transaction rollback and branch isolation verified |
| E2E / migration drift | Not run: no routes, UI, or schema changes |

## Previous accepted task results (2026-11-15, M8-T2)

The owner accepted the reservation and guest domain on 2026-11-15. Local runtime: Node 26.13.0, PostgreSQL 18.7. [Task evidence and exact commands](../delivery/reports/m8-reservations.md#m8-t2-verification) and [independent review](../reviews/2026-11-15-m8-t2.md). M8-T1 results are in [its evidence](../delivery/reports/m8-reservations.md#m8-t1-verification).

| Gate | Result |
| --- | --- |
| Final `npm run check` | **Pass:** format, lint, typecheck, **88 unit files / 1,886 tests** (7 new domain files / 145 tests), production build |
| Full PostgreSQL integration | **Pass:** **38 files / 588 tests**, 167.14 s, run alone. An earlier run alongside `npm run check` had 33 fixture-setup failures in 4 files that do not exercise T2 code |
| Independent review | **Changes requested**, gpt-6-astra: 2 Majors (Q-76 external services and coupon, Q-73 consent versions), both fixed with regression tests and a mutation check; the reviewer did not re-review the fixes |
| Diff hygiene | **Pass:** `git diff --check` |
| Concurrency / E2E / browser / Lighthouse | Not run: no locks, writes, routes, or UI |

These results cover pure domain rules only. Persistence, token handling, authorization, transactions, and endpoints remain later tasks.

## Previous milestone results (2026-11-13, M7 milestone close)

M7 (booking quote: services, coupons, VAT) was accepted by the owner on 2026-11-13. Full evidence: [M7 report](../delivery/reports/m7-booking-quote.md#commands-and-results-exact-commands-counts-durations) and [runtime verification ledger](../delivery/reports/m7-verification.json). Results are for the final tree.

| Gate | Result |
| --- | --- |
| `npm run check` | **Pass** in 26 s: format, lint (no warnings), typecheck, **80 unit files / 1,728 tests**, production build |
| `TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration` | **Pass** in 143 s: **35 files / 534 tests** |
| `vitest run --config vitest.integration.config.ts tests/integration/reservations/concurrency.test.ts` | **Pass**: 1 file / 14 tests (races repeat 20 times inside the suite) |
| `E2E_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_e2e_test npm run test:e2e` | **Pass** in 75 s: Chromium **179 passed / 30 intentional skips** |
| Migration drift | **No difference detected** after `prisma migrate deploy` of 8 migrations on a scratch database (`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`) |
| Runtime verification (`/check verify`) | **42 of 43 behaviours verified live**; 1 not exercised live by design (coupon reasons `LIMIT_REACHED` and `PHONE_LIMIT_REACHED` need persisted redemptions from M8) |
| WebKit / Lighthouse | Not run: no UI or public page changes in M7 |

## Previous accepted task results (2026-11-11, M7-T3)

Owner accepted M7-T3, commercial storage and demo seed. Local runtime: Node **26.13.0**, PostgreSQL **18.6**. Evidence: [M7 task log](../delivery/reports/m7-booking-quote.md#task-log) and [independent review](../reviews/2026-11-11-m7-t3.md).

| Gate | Result |
| --- | --- |
| `npm run check` | **Pass**: format, lint, typecheck, **73 unit files / 1,568 tests**, production build |
| `TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration -- --reporter=dot` | **Pass**: **32 files / 454 tests** on a recreated disposable database |
| Independent review | **Approve**, zero findings, gpt-6-astra (author configured as gpt-6.1-sol); independently reran five focused integration files, **53 tests passed** |
| Migration rehearsal and drift | **Pass**: populated M6 upgrade preserved every existing row; `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` reported no difference on fresh and upgraded disposable databases |
| Real seed CLI | **Pass**: `npm run db:seed -- --demo` twice on a fresh disposable database; the second run preserved edited prices, disabled services/coupons, and VAT 0% exactly. Scratch database and media removed afterward |
| `npx prisma validate`, `git diff --check` | **Pass** |
| E2E / additional concurrency repeat | Not run: no route, UI, or locking workflow changes. Existing 20-iteration M6 races ran within the full integration suite |

These historical results cover the accepted T3 scope; the later T4 and T5 task evidence records management APIs, and quote integration remains T6. No production deployment is claimed.

## Previous accepted results (2026-11-10, M6-T10)

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

