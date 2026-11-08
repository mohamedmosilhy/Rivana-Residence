# M6: Inventory, date prices, and availability

Status: **In progress (1/10 tasks accepted)**, 2026-11-08. M6-T1 is accepted; M6-T2 through M6-T10 have not started. The milestone has not been accepted or merged.

Branch: `m6-inventory-and-availability`. The owner requested this spelling when accepting T1; the original local `m6-Inventory-and-availability` branch was renamed without changing its history. Build spec: [0003](../../specs/0003-m6-inventory-and-availability.md). Task status belongs to the [brief](../milestones/m6-inventory-and-availability.md#task-breakdown).

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M6-T1 | Critical | Owner, 2026-11-08 | `feat(domain): add M6-T1 shared reservation values` (this task commit) | [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md) | Check passed: 54 unit files / 1,070 tests and build; integration passed: 20 files / 243 tests; focused: 6 files / 157 tests | Shared values, public stay policy, explicit branch date conversion; independent review approved with no findings |

The commit is identified by its unique subject in the log row. Locate its hash with `git log --oneline --fixed-strings --grep='feat(domain): add M6-T1 shared reservation values'`.

## Outcome

T1 implements the shared domain foundation for later inventory, pricing, and reservation tasks. `LocalDate` performs exact Gregorian calendar arithmetic; `StayRange` provides positive ranges with exclusive checkout, lazy night iteration, and overlap. Public limits remain in a separate `StayPolicy`, with branch today supplied by the caller. `Occupancy` checks counts and per unit eligibility. `Money` handles USD integer cents and checked arithmetic.

`localDateAt` derives a branch date from an explicit instant and IANA zone. It reads no hidden clock and leaves the existing editorial time conversion helpers intact. Invalid input uses the existing `DomainValidationError` and field issues. Value instances are immutable.

## Scope delivered

- M6-T1: date, stay, public policy, occupancy, and money foundation, accepted by the owner.
- Date portion of milestone AC-3, with arithmetic foundations for AC-1.
- Inventory calculations, nightly price resolution, tables, transactions, locks, APIs, and screens remain future work. No later task started.

## Files by responsibility

- Domain: new `src/domain/shared/local-date.ts`, `stay-range.ts`, `stay-policy.ts`, `occupancy.ts`, and `money.ts`; additive helper in `zoned-time.ts`.
- Tests: five new suites in `tests/unit/domain/`, plus branch date cases in the existing `tests/unit/content/zoned-time.test.ts`.
- Evidence: independent review in `docs/reviews/2026-11-08-m6-t1.md`; topic documentation and progress summaries synchronized on owner acceptance.
- Durable context: one additive root `AGENTS.md` rule identifies the shared values and the separate public policy. No new area context file is needed for the existing shared domain folder.

## Architecture, migrations, and configuration

The change stays in the shared domain layer and its tests. No new dependencies, ports, use cases, database tables, migrations, API contracts, seed data, or environment variables. There is no persistence, authorization entry point, inventory mutation, or external call in T1.

Calendar arithmetic uses integer day numbers rather than instants. The supported wire format is strict `YYYY-MM-DD`, Gregorian AD years 0001 through 9999. The 30 night limit and 540 day arrival horizon are the accepted Q-09 defaults and are configurable inputs to the public validator. Long structural ranges are valid independently of that public policy.

Generic money permits nonnegative safe integer USD cents. The future authored rate boundary must separately enforce positive PostgreSQL `INTEGER` amounts; T1 does not impose a rate column limit on every money value. These choices follow ADR 020 and the approved spec and task card; no business rule was added during implementation.

## Commands and results

Verification before acceptance used Node **22.23.2**, npm **11.21.0**, and PostgreSQL **18.4** (Postgres.app). The shell default was Node 24, so commands used the pinned runtime wrapper below. No dependency manifest or lockfile was changed.

```sh
npm exec --yes --package=node@22.23.2 -- npm run check
```

Passed formatting, lint, typecheck, **54 unit files / 1,070 tests**, and production build. The unit suite took 4.56 seconds; build compilation took 2.1 seconds. These timings describe those stages, not the total aggregate command.

```sh
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- --reporter=dot
```

Passed **20 integration files / 243 tests**, 56.30 seconds. The existing harness recreated only disposable `rivana_test` and applied the existing migration history.

```sh
npm exec --yes --package=node@22.23.2 -- npm run test -- tests/unit/domain/local-date.test.ts tests/unit/domain/stay-range.test.ts tests/unit/domain/stay-policy.test.ts tests/unit/domain/occupancy.test.ts tests/unit/domain/money.test.ts tests/unit/content/zoned-time.test.ts --reporter=dot
```

Passed **6 files / 157 tests**. The independent reviewer reran these same files and obtained the same counts. The suite includes an independent UTC oracle at every month boundary over a full 400 year Gregorian cycle.

A separate temporary runtime runner passed **7 assertions**: three leap boundary nights, exclusive checkout, adjacency without overlap, the 30 versus 31 night policy boundary, Cairo today differing from UTC, and an exact sum of 26000 cents. This sum tests money arithmetic only, not the future nightly price resolver or P5 API. Equivalent durable cases are covered by the committed tests.

The reviewer additionally checked **10,000 seeded date offsets** across the supported range against an independent UTC oracle, parse round trips, iteration at the final supported date, and runtime immutability. All passed. No extra source files were written by that check.

E2E, inventory concurrency, and migration drift were not run for this task because it changes no route, inventory writer, or migration. They remain required when the corresponding later tasks reach their gates and at milestone close. Source and tests were unchanged during the acceptance documentation sync.

## Acceptance criteria and evidence

| Criterion | T1 evidence and remaining scope |
| --- | --- |
| AC-1 | Integer money addition and multiplication are covered. `NightlyPriceResolver` and the public worked example remain future tasks |
| AC-3 | T-DATE-1 through T-DATE-8 cover strict dates, leap and century rules, positive ranges, adjacency, partial and contained overlap, policy limits, branch today, and Cairo DST. Database block constraints arrive later |
| AC-2 and AC-4 through AC-8 | Not delivered by T1; remain in the brief's later tasks. No milestone completion is claimed |

## Independent review and owner acceptance

Author model confirmed by the owner: `gpt-6.1-sol`. Independent reviewer: `gpt-6-astra`, reviewing the real uncommitted T1 change from planning commit `55f9c4a`. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md).

The owner accepted M6-T1 on 2026-11-08 and authorized the documentation sync and task commit. That acceptance does not start T2 or authorize a push or merge.

## Known limitations and deferred work

The values are not yet wired into reservation use cases or public APIs. M6's remaining tasks still need their own plan approvals, implementation, verification, independent review, and owner acceptance. The sold adapter, lock proof, physical units, blocks, rates, and availability endpoints have not been built in T1.

## Next milestone

M7 has not started. M6-T2 has not started either; stop after the accepted T1 commit.
