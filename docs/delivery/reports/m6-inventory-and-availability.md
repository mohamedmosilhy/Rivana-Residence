# M6: Inventory, date prices, and availability

Status: **In progress (2/10 tasks accepted)**, 2026-11-08. M6-T1 and M6-T2 are accepted; M6-T3 through M6-T10 have not started. The milestone has not been accepted or merged.

Branch: `m6-inventory-and-availability`. The owner requested this spelling when accepting T1; the original local `m6-Inventory-and-availability` branch was renamed without changing its history. Build spec: [0003](../../specs/0003-m6-inventory-and-availability.md). Task status belongs to the [brief](../milestones/m6-inventory-and-availability.md#task-breakdown).

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M6-T1 | Critical | Owner, 2026-11-08 | `4334654` | [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md) | Check passed: 54 unit files / 1,070 tests and build; integration passed: 20 files / 243 tests; focused: 6 files / 157 tests | Shared values, public stay policy, explicit branch date conversion; independent review approved with no findings |
| M6-T2 | Critical | Owner, 2026-11-08 | `feat(domain): add M6-T2 inventory and pricing rules` (this task commit) | [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md) | Check passed: 57 unit files / 1,143 tests and build; integration passed: 20 files / 243 tests; focused: 3 files / 73 tests; runtime: 8 assertions | Pure availability, nightly price resolution, block and deactivation projection; independent review approved with no findings and 1,000 capacity oracle scenarios passed |

The current task commit is identified by its unique subject in the log row. Locate its hash with `git log --oneline --fixed-strings --grep='feat(domain): add M6-T2 inventory and pricing rules'`.

## Outcome

T1 implements the shared domain foundation for later inventory, pricing, and reservation tasks. `LocalDate` performs exact Gregorian calendar arithmetic; `StayRange` provides positive ranges with exclusive checkout, lazy night iteration, and overlap. Public limits remain in a separate `StayPolicy`, with branch today supplied by the caller. `Occupancy` checks counts and per unit eligibility. `Money` handles USD integer cents and checked arithmetic.

`localDateAt` derives a branch date from an explicit instant and IANA zone. It reads no hidden clock and leaves the existing editorial time conversion helpers intact. Invalid input uses the existing `DomainValidationError` and field issues. Value instances are immutable.

T2 implements the pure inventory and pricing rules. `AvailabilityCalculator` checks every requested night against capacity minus sold and reports the earliest insufficient night. `NightlyPriceResolver` chooses the covering active period, otherwise base, otherwise unpriced; its immutable ordered nightly values produce an exact accommodation subtotal multiplied by quantity, or a null total for any gap. The four night worked example resolves to 26000 cents.

`checkInventoryReduction` rejects overlapping blocks and consuming physical assignments, then compares sold with projected capacity on sparse supplied sold dates. Block replacement and inactive or already blocked units do not subtract capacity twice. Deactivation starts at an explicit branch date without a public horizon shortcut. Long block ranges never expand empty calendar dates. These functions perform no database access, authorization, locking, or writes.

## Scope delivered

- M6-T1: date, stay, public policy, occupancy, and money foundation, accepted by the owner.
- M6-T2: pure availability, nightly price resolution, and inventory reduction rules, accepted by the owner.
- Domain portions of AC-1, AC-3, AC-4, and AC-6. HTTP and database parts of those criteria remain planned.
- Tables, transactions, locks, APIs, and screens remain future work. T3 through T10 have not started.

## Files by responsibility

- Domain (T1): `src/domain/shared/local-date.ts`, `stay-range.ts`, `stay-policy.ts`, `occupancy.ts`, and `money.ts`; additive helper in `zoned-time.ts`.
- Domain (T2): `src/domain/inventory/{availability-calculator,inventory-reduction,index}.ts` and `src/domain/pricing/{nightly-price-resolver,index}.ts`. Cross-module callers use the public exports.
- Tests (T1): five suites in `tests/unit/domain/`, plus branch date cases in `tests/unit/content/zoned-time.test.ts`.
- Tests (T2): `tests/unit/domain/{availability-calculator,inventory-reduction,nightly-price-resolver}.test.ts`, 73 tests.
- Evidence: independent T1 and T2 reports in `docs/reviews/`; topic documentation, test matrix, quality gates, and progress summaries synchronized on owner acceptance.
- Durable context: additive root `AGENTS.md` rules point to the shared values and pure inventory/pricing exports and preserve sparse reduction checks. No new nested context file is needed for these small domain modules.

## Architecture, migrations, and configuration

T1 stays in the shared domain layer and its tests; T2 adds the pure inventory and pricing modules and their public exports. Neither task adds dependencies, ports, use cases, database tables, migrations, API contracts, seed data, or environment variables. Neither task introduces persistence, an authorization entry point, an inventory writer, or an external call.

Calendar arithmetic uses integer day numbers rather than instants. The supported wire format is strict `YYYY-MM-DD`, Gregorian AD years 0001 through 9999. The 30 night limit and 540 day arrival horizon are the accepted Q-09 defaults and are configurable inputs to the public validator. Long structural ranges are valid independently of that public policy.

Generic money permits nonnegative safe integer USD cents. The future authored rate boundary must separately enforce positive PostgreSQL `INTEGER` amounts; T1 does not impose a rate column limit on every money value. These choices follow ADR 020 and the approved spec and task card; no business rule was added during implementation.

## M6-T1 commands and results

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

## M6-T2 commands and results

Verification before acceptance used the same Node **22.23.2**, npm **11.21.0**, and PostgreSQL **18.4** environment. The author ran:

```sh
npm exec --yes --package=node@22.23.2 -- npm run check
```

Passed formatting, lint and architecture boundaries, typecheck, **57 unit files / 1,143 tests**, and the production build. The build retained the existing warning at unchanged `src/infrastructure/media/local-media-storage.ts:74`, where dynamic filesystem access traces the whole project. Evidence log: `/tmp/rivana-m6-t2-check.log`.

```sh
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- --reporter=dot
```

Passed **20 integration files / 243 tests**, 54.10 seconds. This is regression coverage against the disposable database and existing migrations, not a test of future inventory persistence. Evidence log: `/tmp/rivana-m6-t2-integration.log`.

```sh
npm exec --yes --package=node@22.23.2 -- npm run test -- tests/unit/domain/availability-calculator.test.ts tests/unit/domain/inventory-reduction.test.ts tests/unit/domain/nightly-price-resolver.test.ts --reporter=dot
```

Passed **3 files / 73 tests**. The independent reviewer reran the three files and confirmed the same counts. They cover missing and oversold inventory, positive quantities and count validation, chronological failures, half open overlaps and adjacency, assignments, block replacement and shortening, inactive and already blocked units, explicit deactivation dates, sparse long ranges, active rate boundaries and overlap rejection, unpriced gaps, checked totals, and immutable values.

```sh
npm exec --yes --package=node@22.23.2 -- npm exec tsx -- /tmp/rivana-m6-t2-smoke.ts
```

The temporary direct runtime runner passed **8 assertions**: the 52000-cent two-unit worked example and per-unit nightly prices, a null total for a gap, missing inventory refusal and its first night, and sparse long-range reduction refusal with its date and one projected record. The scratch runner is not a durable repository artifact; the committed tests cover these behaviors.

The reviewer independently checked **1,000 generated reduction scenarios** against a separate capacity oracle, including active and inactive units, existing blocks, replacement, deactivation, shuffled dates, and different sold counts. Allowed decisions and earliest conflict dates matched in every case. Malformed base rate probes returned `DomainValidationError`.

E2E and migration drift were not applicable because no routes or migration changed. Real database concurrency proof remains T4 through T6, where the guard, writers, and concurrency harness are built. T2 is a pure calculation slice and makes no concurrency claim. Source and tests were unchanged during the acceptance documentation sync; only documentation and durable context were synchronized.

The acceptance documentation sync passed `npm run format:check`, `git diff --check`, and local link and task-state checks. The full application gates above were not repeated for documentation-only edits.

## Acceptance criteria and evidence

| Criterion | Accepted T1/T2 evidence and remaining scope |
| --- | --- |
| AC-1 | T1 covers integer money arithmetic; T2's resolver produces 26000 cents for the worked example and 52000 cents for quantity 2. Public P5 proof remains T10 |
| AC-3 | T-DATE-1 through T-DATE-8 cover strict dates, leap and century rules, positive ranges, adjacency, partial and contained overlap, policy limits, branch today, and Cairo DST. Database block constraints arrive later |
| AC-4 | T2 covers pure sold-versus-projected-capacity refusal, earliest conflict date, overlapping blocks, and consuming assignments. Database locking, writes, and HTTP 409 mapping remain later tasks |
| AC-6 | T2 covers zero/missing capacity, explicit unpriced nights, and null totals for gaps. Persistence and public response mapping remain later tasks |
| AC-2, AC-5, AC-7, AC-8 | Remain in the brief's later tasks; pure calculations alone do not satisfy database, concurrency, authorization, audit, or public disclosure requirements. No milestone completion is claimed |

## Independent review and owner acceptance

Author model confirmed by the owner: `gpt-6.1-sol`. Independent reviewer: `gpt-6-astra`, reviewing the real uncommitted T1 change from planning commit `55f9c4a`. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md).

The owner accepted M6-T1 on 2026-11-08 and authorized the documentation sync and task commit. That acceptance does not start T2 or authorize a push or merge.

The owner accepted M6-T2 on 2026-11-08 after its review package. `gpt-6-astra` independently reviewed the nine-file uncommitted T2 change against accepted T1 commit `4334654`, with `gpt-6.1-sol` as the author. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md). The owner authorized documentation sync and the T2 commit, explicitly without starting the next task. No push or merge is authorized by that acceptance.

## Known limitations and deferred work

The values and pure rules are not yet wired into reservation use cases or public APIs. M6's remaining tasks still need their own plan approvals, implementation, verification, independent review, and owner acceptance. The sold adapter, lock proof, persisted physical units, blocks, rates, and availability endpoints have not been built. Callers must eventually enforce branch scope and load reduction inputs under the listing lock. Rate authoring must enforce the positive PostgreSQL `INTEGER` bound; generic `Money` and the resolver remain calculation values. Persisted snapshot immutability and manual override authorization belong to M8.

## Next milestone

M7 has not started. M6-T3 has not started either; stop after the accepted T2 commit.
