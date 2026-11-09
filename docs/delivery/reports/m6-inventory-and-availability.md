# M6: Inventory, date prices, and availability

Status: **In progress (6/10 tasks accepted)**, 2026-11-09. M6-T1 through M6-T6 are accepted; M6-T7 through M6-T10 have not started. The milestone has not been accepted or merged.

Branch: `m6-inventory-and-availability`. The owner requested this spelling when accepting T1; the original local `m6-Inventory-and-availability` branch was renamed without changing its history. Build spec: [0003](../../specs/0003-m6-inventory-and-availability.md). Task status belongs to the [brief](../milestones/m6-inventory-and-availability.md#task-breakdown).

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M6-T1 | Critical | Owner, 2026-11-08 | `4334654` | [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md) | Check passed: 54 unit files / 1,070 tests and build; integration passed: 20 files / 243 tests; focused: 6 files / 157 tests | Shared values, public stay policy, explicit branch date conversion; independent review approved with no findings |
| M6-T2 | Critical | Owner, 2026-11-08 | `feat(domain): add M6-T2 inventory and pricing rules` (this task commit) | [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md) | Check passed: 57 unit files / 1,143 tests and build; integration passed: 20 files / 243 tests; focused: 3 files / 73 tests; runtime: 8 assertions | Pure availability, nightly price resolution, block and deactivation projection; independent review approved with no findings and 1,000 capacity oracle scenarios passed |
| M6-T3 | Critical | Owner, 2026-11-08 | `feat(db): add M6-T3 inventory and rates migration and demo seed` (this task commit) | [2026-11-08-m6-t3.md](../../reviews/2026-11-08-m6-t3.md) | Check passed: 57 unit files / 1,143 tests and build; integration passed: 21 files / 271 tests; migration rehearsal on M5 data and drift check inside that suite | Four tables, `BlockReason`, CHECKs, two GiST exclusion constraints, composite ownership FKs; guarded demo inventory seed; independent review (Opus) requested changes, one major docs finding and minors fixed before acceptance |
| M6-T4 | Critical | Owner, 2026-11-09 | `feat(inventory): add M6-T4 transaction guard foundation` (this task commit) | [2026-11-09-m6-t4.md](../../reviews/2026-11-09-m6-t4.md) | Check passed: 59 unit files / 1,157 tests and build; integration passed: 24 files / 289 tests; concurrency: 3 cases × 20 iterations | Transaction bound ports, `READ COMMITTED` unit of work, sorted room type lock, complete inventory reader, guard, and empty M6 consumption adapter; fresh model review approved with no open findings |
| M6-T5 | Critical | Owner, 2026-11-09 | `feat(inventory): add M6-T5 physical unit management and staff API` (this task commit) | [2026-11-09-m6-t5.md](../../reviews/2026-11-09-m6-t5.md) | Check passed: 60 unit files / 1,225 tests and build; integration passed: 25 files / 321 tests; concurrency: 6 cases (T5 adds 3 × 20 iterations); Chromium E2E: 163 passed, 30 skipped | Physical unit repository, catalog bridge, `ManagePhysicalRooms`, S21 to S23, audited and guarded deactivation; fresh model review (Opus) approved with nits, three minors fixed before acceptance |
| M6-T6 | Critical | Owner, 2026-11-09 | `feat(inventory): add M6-T6 block management and staff API` (this task commit) | [2026-11-09-m6-t6.md](../../reviews/2026-11-09-m6-t6.md) | Check passed: 61 unit files / 1,291 tests and build; integration passed: 26 files / 347 tests; concurrency: 14 cases (T6 adds 8 × 20 iterations); Chromium E2E: 167 passed, 30 skipped | Block repository, `ManageBlocks`, S24 to S27, audited and guarded create and end date change; fresh model review (Opus) changes requested (one major, no blockers), major and minors fixed before acceptance |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.

## Outcome

T1 implements the shared domain foundation for later inventory, pricing, and reservation tasks. `LocalDate` performs exact Gregorian calendar arithmetic; `StayRange` provides positive ranges with exclusive checkout, lazy night iteration, and overlap. Public limits remain in a separate `StayPolicy`, with branch today supplied by the caller. `Occupancy` checks counts and per unit eligibility. `Money` handles USD integer cents and checked arithmetic.

`localDateAt` derives a branch date from an explicit instant and IANA zone. It reads no hidden clock and leaves the existing editorial time conversion helpers intact. Invalid input uses the existing `DomainValidationError` and field issues. Value instances are immutable.

T2 implements the pure inventory and pricing rules. `AvailabilityCalculator` checks every requested night against capacity minus sold and reports the earliest insufficient night. `NightlyPriceResolver` chooses the covering active period, otherwise base, otherwise unpriced; its immutable ordered nightly values produce an exact accommodation subtotal multiplied by quantity, or a null total for any gap. The four night worked example resolves to 26000 cents.

`checkInventoryReduction` rejects overlapping blocks and consuming physical assignments, then compares sold with projected capacity on sparse supplied sold dates. Block replacement and inactive or already blocked units do not subtract capacity twice. Deactivation starts at an explicit branch date without a public horizon shortcut. Long block ranges never expand empty calendar dates. These functions perform no database access, authorization, locking, or writes.

T4 adds the transaction and locking foundation used by later inventory writers. `ReservationUnitOfWork` binds only the ports a use case needs to one Prisma transaction at `READ COMMITTED`. A failed result is converted into an internal abort so Prisma rolls back instead of committing it; unexpected exceptions still propagate to the redacted HTTP failure path. `InventoryLock` deduplicates and sorts room type ids, takes `FOR NO KEY UPDATE` locks with a five second PostgreSQL timeout, verifies complete branch ownership, and maps lock timeout to `TRY_AGAIN`.

The batched inventory reader returns every requested listing and night, including zero capacity, and merges checked sparse consumption contributions. M6's production consumption adapter intentionally returns none until reservation persistence arrives in M8. `InventoryGuard` enforces lock, reload, validation, mutation, and audit order inside the same unit of work. T4 provides the foundation and tests, but no production unit or block writer is composed before T5 and T6.

## M6-T6 (accepted)

Blocks: `PrismaBlockRepository`, `ManageBlocks`, composition, strict contracts, DTO, thin handlers, and OpenAPI for S24 to S27. Create and any end date change go through `InventoryGuard` (listing lock, then block row, reload, sparse sold read from the block start filtered to the range, validation with `replaceBlockId`, write, audit). Note edits and cancellation take only the block row lock. Audit actions `inventory-block.created|updated|cancelled` never store note bodies. Status: accepted by the owner, 2026-11-09. Independent review (Opus): [2026-11-09-m6-t6.md](../../reviews/2026-11-09-m6-t6.md), changes requested with one major (no test for the block row lock timeout) and six minors; the major and the actionable minors were fixed before acceptance, and the reviewer has not rechecked the fixes.

Owner decisions recorded 2026-11-09:

1. Blocks that start in the past are allowed; the spec does not prohibit them.
2. The consumption port is unchanged for M6. Block create and extension call `readFutureSold` from the block start and filter to the block range; a dedicated range method is deferred to M8 if needed.
3. Extending a block on a since deactivated unit is allowed (it affects no capacity) and is documented in the API contracts. Authorization and branch isolation still apply.
4. The hand built integration wiring in `tests/integration/reservations/support/blocks.ts` mirrors `src/composition/inventory.ts`; accepted as documented technical debt, no refactor in T6.

Remaining limitations: injected sold and assignment tests prove the guard's reduction logic, not real reservation consumption (M8). The reviewer's nits (unused exports, a second `isoDate` definition, no `setBranch` on PATCH and DELETE) are left as is.

## M6-T5 (accepted)

Status: accepted by the owner, 2026-11-09. Independent review (Opus): [2026-11-09-m6-t5.md](../../reviews/2026-11-09-m6-t5.md), approve with nits, no blockers or majors.

Delivered: `PhysicalRoomRepository`, the narrow `RoomTypeCatalog` bridge, `ManagePhysicalRooms`, composition, strict contracts, DTOs, thin handlers and OpenAPI for S21 to S23. Deactivation always goes through `InventoryGuard`; activation, creation, and label or notes edits take no listing lock. Audit actions `physical-room.created` and `physical-room.updated` record label and active before and after, and notes only as `notesChanged`.

Owner decisions recorded 2026-11-09:

1. Blank notes: empty and whitespace only notes are stored as `null`. Covered by unit tests (create and update, including the no-op case) and an HTTP integration test; documented in the input contract and API contracts.
2. Architecture guard: the D-9 textual check exempts only the exact audit `entityType` declarations for `PhysicalRoom` (an `entityType` property assigned that literal, or that literal as a union member of an `entityType` property type), found through the TypeScript AST. Regression tests prove Prisma access, raw SQL, and other uses of the name are still detected, including inside an `entityType` property.
3. The 503 `TRY_AGAIN` with `Retry-After: 5` is proven through the real Route Handlers on PostgreSQL (listing lock and unit row lock cases, including the problem content type and no leaked database detail), not in browser E2E.
4. Production consumption stays the empty adapter.

Remaining limitations:

- Injected sold and assignment tests prove the guard's reduction logic on a real database. They do not prove integration with real reservation consumption; that verification is M8's responsibility.
- No 20 iteration race of activation against deactivation yet (the code path is correct by inspection); suggested for T6.
- The integration test wiring (`tests/integration/reservations/support/physical-rooms.ts`) mirrors `src/composition/inventory.ts` by hand.
- Review minors fixed before acceptance: unit row lock timeout now maps to 503, plain edits set the same five second lock timeout, and the foreign key mapping ignores the `updatedById` key.

## Scope delivered

- M6-T1: date, stay, public policy, occupancy, and money foundation, accepted by the owner.
- M6-T2: pure availability, nightly price resolution, and inventory reduction rules, accepted by the owner.
- T2 covers the domain portions of AC-1, AC-3, AC-4, and AC-6. Later tasks still own concrete writers and endpoints.
- M6-T3: migration `20261108120000_inventory_and_rates` (`PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod`, constraints) and the guarded demo inventory seed, accepted by the owner.
- M6-T4: generic reservation unit of work, inventory lock and reader ports and Prisma adapters, inventory guard, safe conflict mapping, and deterministic concurrency harness, accepted by the owner.
- M6-T5: physical unit repository and catalog bridge, `ManagePhysicalRooms`, S21 to S23, accepted by the owner.
- M6-T6: block repository, `ManageBlocks`, S24 to S27, accepted by the owner.
- Concrete rate and availability use cases, composition, APIs, and screens remain future work. T7 through T10 have not started.

## Files by responsibility

- Domain (T1): `src/domain/shared/local-date.ts`, `stay-range.ts`, `stay-policy.ts`, `occupancy.ts`, and `money.ts`; additive helper in `zoned-time.ts`.
- Domain (T2): `src/domain/inventory/{availability-calculator,inventory-reduction,index}.ts` and `src/domain/pricing/{nightly-price-resolver,index}.ts`. Cross-module callers use the public exports.
- Tests (T1): five suites in `tests/unit/domain/`, plus branch date cases in `tests/unit/content/zoned-time.test.ts`.
- Tests (T2): `tests/unit/domain/{availability-calculator,inventory-reduction,nightly-price-resolver}.test.ts`, 73 tests.
- Application (T4): `src/application/reservations/ports.ts`, `src/application/inventory/{ports,inventory-guard}.ts`, and their public exports; typed inventory conflict context in `src/application/shared/result.ts`.
- Infrastructure and HTTP (T4): Prisma unit of work, inventory lock, batched reader, empty consumption adapter, SQLSTATE extraction, and the shared problem mapping.
- Tests (T4): unit guard and HTTP tests plus real PostgreSQL unit of work, inventory reader, and concurrency suites under `tests/integration/reservations/`.
- Evidence: independent task reports in `docs/reviews/`; topic documentation, test matrix, quality gates, and progress summaries synchronized on owner acceptance.
- Durable context: root rules point to the shared values, pure rules, and guard transaction boundary. `tests/integration/reservations/AGENTS.md` records the new concurrency test conventions.

## Architecture, migrations, and configuration

T1 stays in the shared domain layer and its tests; T2 adds the pure inventory and pricing modules and their public exports. Neither task adds dependencies, ports, use cases, database tables, migrations, API contracts, seed data, or environment variables. Neither task introduces persistence, an authorization entry point, an inventory writer, or an external call.

T4 adds application ports and orchestration plus transaction bound Prisma infrastructure. It adds no table, migration, dependency, environment variable, endpoint, production writer, authorization entry point, or external call. The shared HTTP layer now recognizes the typed inventory conflict, but no M6 endpoint uses it yet.

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

## M6-T3 commands and results

Verification used Node **22.23.2** (installed in a scratch directory because the shell default was Node 24), PostgreSQL **18.4**, and disposable `rivana_test`.

- `npm run check` exited 0: formatting, lint, typecheck, **57 unit files / 1,143 tests**, production build (the existing `StorageSecurityError` trace warning is unchanged).
- `TEST_DATABASE_URL=… npx vitest run --config vitest.integration.config.ts` passed **21 files / 271 tests**, including `inventory-constraints.test.ts` (23 tests: overlap matrix, adjacency, cancelled blocks, inactive periods, ranges, nonpositive and overflowing amounts, non-USD, duplicate labels, cross-branch ownership, `RESTRICT` behavior, and 20 race iterations per exclusion constraint on separate connections), the M5-copy migration rehearsal (every existing row identical, no new data, `btree_gist` installed), the Prisma drift check, and the seed tests (fresh, repeated, and upgraded demo runs; staff edits preserved; production refusal before any write through the real `seed.mts`).
- Findings from running them: `RESTRICT` reports SQLSTATE `23001`, not `23503`; two uncommitted overlapping inserts end as the exclusion violation `23P01` or a deadlock `40P01`, with exactly one commit. T4 supplies the lock that T6 block writers must use; rate periods take no lock, so M6-T7 must decide whether to map `40P01` or lock the listing.
- E2E not run: no routes or screens changed.

## M6-T4 commands and results

Verification used Node **22.23.2**, npm **11.21.0**, and disposable real PostgreSQL databases.

```sh
npm exec --yes --package=node@22.23.2 -- npm run check
```

Passed formatting, lint and architecture boundaries, typecheck, **59 unit files / 1,157 tests**, and the production build. The build retained the existing unrelated Turbopack dynamic filesystem tracing warning at `src/infrastructure/media/local-media-storage.ts:74`.

```sh
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- --reporter=dot
```

Passed **24 integration files / 289 tests**. Expected Better Auth warnings from negative authentication cases did not fail the suite.

```sh
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- --reporter=dot tests/integration/reservations/concurrency.test.ts
```

Passed **1 file / 3 tests**. Each case ran 20 iterations: reversed multi listing lock order without a deadlock, same listing wait followed by a fresh committed read, and independent locking across branches. The suite uses separate clients and observes real PostgreSQL lock waits instead of relying on sleeps.

Direct runtime verification additionally proved that a failed result rolls back writes, missing or foreign listings stay hidden as `NOT_FOUND`, a held row lock becomes `TRY_AGAIN` after the configured timeout, the serializer returns `503` with `Retry-After: 5`, and `INVENTORY_UNAVAILABLE` exposes only the typed safe context. The temporary verification script was removed. `git diff --check` passed. E2E, migration drift, and OpenAPI generation were not applicable because T4 adds no route, page, schema change, migration, or endpoint contract.

## Acceptance criteria and evidence

| Criterion | Accepted T1 through T4 evidence and remaining scope |
| --- | --- |
| AC-1 | T1 covers integer money arithmetic; T2's resolver produces 26000 cents for the worked example and 52000 cents for quantity 2. Public P5 proof remains T10 |
| AC-3 | T-DATE-1 through T-DATE-8 cover strict dates, leap and century rules, positive ranges, adjacency, partial and contained overlap, policy limits, branch today, and Cairo DST. T3 adds block range and overlap constraints; block write workflows remain T6 |
| AC-4 | T2 covers pure sold versus projected capacity refusal, earliest conflict date, overlapping blocks, and consuming assignments. T4 proves the shared guard order, transaction rollback, typed 409 mapping, and injected sold and assignment refusal. Concrete writers remain T5 and T6 |
| AC-5 | T4 proves sorted complete set locking, real waiting and fresh reads, five second timeout mapping, rollback of mutation and audit, and branch independent locking. Writer versus writer cases remain T5 and T6 |
| AC-6 | T2 covers zero or missing capacity, explicit unpriced nights, and null totals for gaps. T4's batched reader retains every requested zero capacity night and validates sparse consumption. Public response mapping remains T10 |
| AC-2, AC-7, AC-8 | Database constraints for AC-2 arrived in T3, while coherent rate writes, authorization, audit use cases, and public disclosure remain in later tasks. No milestone completion is claimed |

## Independent review and owner acceptance

Author model confirmed by the owner: `gpt-6.1-sol`. Independent reviewer: `gpt-6-astra`, reviewing the real uncommitted T1 change from planning commit `55f9c4a`. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md).

The owner accepted M6-T1 on 2026-11-08 and authorized the documentation sync and task commit. That acceptance does not start T2 or authorize a push or merge.

The owner accepted M6-T2 on 2026-11-08 after its review package. `gpt-6-astra` independently reviewed the nine-file uncommitted T2 change against accepted T1 commit `4334654`, with `gpt-6.1-sol` as the author. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md). The owner authorized documentation sync and the T2 commit, explicitly without starting the next task. No push or merge is authorized by that acceptance.

M6-T3 was independently reviewed by Opus (author: Sonnet; an earlier session began the implementation). Verdict: **Changes requested** (one major: `data-model.md` not reconciled; four minors; five nits). The major and the cheap minors were fixed and the gates rerun; the remaining minors (partial-upgrade rollback test strength, race barrier) and nits are accepted as is. Full report: [2026-11-08-m6-t3.md](../../reviews/2026-11-08-m6-t3.md). The owner accepted M6-T3 on 2026-11-08 and authorized the documentation sync and commit, without starting T4. No push or merge is authorized.

M6-T4 received a fresh model review against the approved critical risk task card. The first pass found two test coverage gaps: the audit rollback case did not exercise the real guard and persistence path, and several refusal paths lacked direct coverage. The tests were expanded for real guard rollback, foreign listings, invalid consumption contributions, failed loads, and assigned units. The reviewer reran the affected unit, architecture, and integration suites and then returned **Approve** with no open findings. Full report: [2026-11-09-m6-t4.md](../../reviews/2026-11-09-m6-t4.md). The owner accepted M6-T4 on 2026-11-09 and authorized this documentation sync and task commit, explicitly without starting T5. No push or merge is authorized.

## Known limitations and deferred work

The values and pure rules are not yet wired into concrete inventory use cases or public APIs. M6's remaining tasks still need their own plan approvals, implementation, verification, independent review, and owner acceptance. Persisted physical unit and block repositories, rate use cases, composition, and availability endpoints have not been built. The M6 reservation consumption adapter intentionally reports no sold or assigned rows; M8 replaces it with persisted consumption inside the same transaction context. T4's harness proves the shared lock protocol, not the later block versus block or block versus deactivation writer races. Rate authoring must enforce the positive PostgreSQL `INTEGER` bound; generic `Money` and the resolver remain calculation values. Persisted snapshot immutability and manual override authorization belong to M8.

## Next milestone

M7 has not started. M6-T5 has not started; stop after the accepted T4 commit.
