# M6: Inventory, date prices, and availability

Status: **In progress (9/10 tasks accepted)**, 2026-11-10. M6-T1 through M6-T9 are accepted; M6-T10 has not started. The milestone has not been accepted or merged.

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
| M6-T7 | Critical | Owner, 2026-11-10 | `feat(pricing): add M6-T7 base rates, date periods, and staff API` (this task commit) | [2026-11-10-m6-t7.md](../../reviews/2026-11-10-m6-t7.md), recheck [2026-11-10-m6-t7-recheck.md](../../reviews/2026-11-10-m6-t7-recheck.md) | Check passed: 63 unit files / 1,334 tests and build; integration passed: 27 files / 368 tests; concurrency: 5 rate races × 20 iterations (T7) plus S32 and period row lock timeout cases; Chromium E2E: 171 passed, 30 skipped | Rate repository, `ManageRates`, `GetRateCalendar`, S30 to S34; first review (GPT) changes requested (four majors, all fixed), recheck (Opus) changes requested (one major, `TRY_AGAIN` on the wrong route, fixed) and two minors fixed before acceptance |
| M6-T8 | Critical | Owner, 2026-11-10 | `feat(inventory): add M6-T8 availability search and staff grid` (this task commit) | [2026-11-10-m6-t8.md](../../reviews/2026-11-10-m6-t8.md) | Check passed: 65 unit files / 1,363 tests and build; integration passed: 28 files / 377 tests; Chromium E2E for S20: 2 passed (the full E2E suite was not rerun); `npm run openapi` regenerated, no drift | `GetAvailabilityGrid`, S20, `SearchAvailability` (no route yet), three read ports; review (Opus) approve with nits, four minors fixed before acceptance, five nits left |
| M6-T9 | Medium | Owner, 2026-11-10 | `feat(security): add M6-T9 atomic public limiter and cleanup` (this task commit) | [2026-11-10-m6-t9.md](../../reviews/2026-11-10-m6-t9.md) | Check passed: 67 unit files / 1,373 tests and build; integration passed: 29 files / 391 tests; 3 limiter race cases × 20 iterations; reviewer reruns: 22 unit and 21 integration tests | Atomic public admission, shared anonymous fallback, safe bounded expiry cleanup and operator command; independent review approved with zero findings |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.

## Outcome

T1 implements the shared domain foundation for later inventory, pricing, and reservation tasks. `LocalDate` performs exact Gregorian calendar arithmetic; `StayRange` provides positive ranges with exclusive checkout, lazy night iteration, and overlap. Public limits remain in a separate `StayPolicy`, with branch today supplied by the caller. `Occupancy` checks counts and per unit eligibility. `Money` handles USD integer cents and checked arithmetic.

`localDateAt` derives a branch date from an explicit instant and IANA zone. It reads no hidden clock and leaves the existing editorial time conversion helpers intact. Invalid input uses the existing `DomainValidationError` and field issues. Value instances are immutable.

T2 implements the pure inventory and pricing rules. `AvailabilityCalculator` checks every requested night against capacity minus sold and reports the earliest insufficient night. `NightlyPriceResolver` chooses the covering active period, otherwise base, otherwise unpriced; its immutable ordered nightly values produce an exact accommodation subtotal multiplied by quantity, or a null total for any gap. The four night worked example resolves to 26000 cents.

`checkInventoryReduction` rejects overlapping blocks and consuming physical assignments, then compares sold with projected capacity on sparse supplied sold dates. Block replacement and inactive or already blocked units do not subtract capacity twice. Deactivation starts at an explicit branch date without a public horizon shortcut. Long block ranges never expand empty calendar dates. These functions perform no database access, authorization, locking, or writes.

T4 adds the transaction and locking foundation used by later inventory writers. `ReservationUnitOfWork` binds only the ports a use case needs to one Prisma transaction at `READ COMMITTED`. A failed result is converted into an internal abort so Prisma rolls back instead of committing it; unexpected exceptions still propagate to the redacted HTTP failure path. `InventoryLock` deduplicates and sorts room type ids, takes `FOR NO KEY UPDATE` locks with a five second PostgreSQL timeout, verifies complete branch ownership, and maps lock timeout to `TRY_AGAIN`.

The batched inventory reader returns every requested listing and night, including zero capacity, and merges checked sparse consumption contributions. M6's production consumption adapter intentionally returns none until reservation persistence arrives in M8. `InventoryGuard` enforces lock, reload, validation, mutation, and audit order inside the same unit of work. T4 provides the foundation and tests, but no production unit or block writer is composed before T5 and T6.

## M6-T9 (accepted)

The owner accepted M6-T9 on 2026-11-10 and authorized documentation synchronization and its commit, explicitly without starting M6-T10. Independent reviewer `gpt-6-astra` reviewed the actual uncommitted change authored by `gpt-6.1-sol`: **Approve**, zero findings ([review](../../reviews/2026-11-10-m6-t9.md)).

Delivered: a dedicated `PublicRateLimitStore` port, application admission policy and cleanup use case, `PrismaPublicRateLimitStore`, API composition, and `npm run throttles -- cleanup-public`. The existing `LoginThrottle` table and HMAC key derivation are reused. Public admission allows 60 requests per 60 second fixed window; request 61 is denied with the remaining window in `Retry-After`. Missing trusted addresses share an anonymous bucket across branch paths. Staff sign-in retains its original store, use case, and policy.

Admission upserts and locks the bucket, samples decision time after locking, and checks and counts in the same short transaction. Cleanup locks and skips busy candidates and deletes at most 1,000 expired availability rows per invocation. Active windows, active locks, staff rows, and other namespaces remain intact. The command loads `.env`, reports safe outcomes and failure statuses, and disconnects before exit. Hourly app-user cron and trusted-proxy rehearsal are documented in [deployment](../../operations/deployment.md#public-throttle-cleanup-m6-t9); actual provisioning remains deployment work. There are no new dependencies, environment variables, migrations, seeds, endpoint contracts, or public routes.

Verification used Node **22.23.2**, npm **11.21.0**, and PostgreSQL **18.4**:

```sh
npm exec --yes --package=node@22.23.2 -- npm run check
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- --reporter=dot
```

Passed formatting, lint, typecheck, **67 unit files / 1,373 tests**, production build, and **29 integration files / 391 tests**. The build retained the existing media-storage tracing warning. The initial parallel aggregate run hit the existing architecture boundary test's five second timeout; its focused rerun passed 10 tests and the full aggregate rerun passed. Focused concurrency alone is covered by the reviewer's public limiter rerun below: 80 concurrent requests admit exactly 60, and both admission/cleanup orderings run 20 iterations each with independent database clients and observable lock waits where applicable.

The reviewer independently reran:

```sh
npm exec --yes --package=node@22.23.2 -- npm run test -- tests/unit/application/public-rate-limit.test.ts tests/unit/application/health-rate-limit.test.ts tests/unit/composition/public-client-address.test.ts tests/unit/auth/sign-in.test.ts
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm exec --yes --package=node@22.23.2 -- npm run test:integration -- tests/integration/public-rate-limit.test.ts tests/integration/login-throttle.test.ts --reporter=dot
```

Passed **4 unit files / 22 tests** and **2 integration files / 21 tests**, including unchanged staff sign-in behavior and all public limiter race repetitions. A temporary direct runtime runner also passed using the real subsystem and existing proxy extraction: 60 admissions across changing branch paths and spoofed headers with trust disabled, denial 61 with remaining retry time, exactly 60 persisted admissions, the real npm cleanup invocation, and preservation of staff and other namespace rows. This was subsystem proof, not a live P5 route. `git diff --check` passed. E2E, schema drift, and OpenAPI regeneration were not applicable to T9. P5 exposure and its full response proof remain T10.

## M6-T8 (accepted)

Availability reads: `GetAvailabilityGrid` with API-S20, and the `SearchAvailability` use case (no HTTP route until M6-T10). Both are reads: no lock, no write, no cache. New read ports `AvailabilityCatalog`, `LastSyncCheckpointReader` (null adapter, M8 replaces it) and `RateBatchReader` (one base rate query and one period query for every listing). The grid lists every listing of the branch in any publication status with every requested night. Search lists published listings of an active branch and applies the public stay policy in the branch time zone, the quantity cap of 5, and the refusal order `UNPRICED`, `OCCUPANCY`, `SOLD_OUT`.

Decisions recorded 2026-11-10:

1. Sold above capacity makes the grid fail as a redacted server error. It is never clamped or shown as a negative number.
2. `SearchAvailability` applies the public stay policy now, not in T10, and takes numbers only. Query string coercion belongs to the P5 contract.
3. A listing deleted between the listing read and the inventory read is retried once with a fresh listing read, so it drops out instead of making a 404 (`read-listing-nights.ts`).

Review: Opus ([2026-11-10-m6-t8.md](../../reviews/2026-11-10-m6-t8.md)), approve with nits. Fixed: `INVALID_QUERY` listed for S20 (and added to S24 and S30), an occupancy test with free units, a database level test of one rate query pair, and the deleted listing race.

Evidence: `EXPLAIN (ANALYZE, BUFFERS)` of the capacity query on the demo seed (5 listings, 61 nights, 122 rows): about 1.7 ms, 662 shared buffers, almost all cached. There is no reservation query plan until M8, because the consumption adapter is empty. The S20 route was also proved in a real browser session by `tests/e2e/availability-api.spec.ts`.

Remaining limitations:

- Five nits are left as is: `readMany` assembles periods in two loops, the inactive period test does not pin the SQL `active` filter, the cap of 5 is a domain constant rather than passed from composition, `free` is computed inline in the grid, and the cap math lives in the application layer (reuse it from there in T10).
- Capacity and rates are read in separate statements without a shared snapshot. Availability is a current observation, never a hold.
- The full E2E suite was not rerun for this task; only the new S20 spec was.

## M6-T7 (accepted)

Base rates and date periods: `PrismaRateRepository`, `ManageRates`, `GetRateCalendar`, composition, strict contracts, DTO, thin handlers, and OpenAPI for S30 to S34. The base rate write inserts with `ON CONFLICT DO NOTHING`, then locks the base row with `FOR UPDATE`, so the audit `before` is the real locked predecessor (`null` on first creation). Period creation sets a five second `lock_timeout` and relies on the exclusion constraint; period edits lock the period row, then merge the patch. Rate writes never take the listing inventory lock. Audit actions `room-base-rate.updated`, `rate-period.created`, and `rate-period.updated` (also used for deactivation) are appended in the same `READ COMMITTED` transaction. Status: accepted by the owner, 2026-11-10.

Owner decisions recorded 2026-11-10:

1. `40P01` on a rate period write is mapped to the same safe `409 CONFLICT` as `23P01`, only when caught directly around a `RatePeriod` mutation. Recorded in spec 0003 and pinned by a repository test; other deadlocks stay redacted server errors.
2. Repeated deletion of a period is idempotent: `204` with no second audit event.
3. Receptionists may read rates but never change them; Managers change only listings in assigned branches; hidden and foreign ids return `404`.

Review: the first review (GPT, [2026-11-10-m6-t7.md](../../reviews/2026-11-10-m6-t7.md)) found four majors: S32 had no bounded exclusion wait (real defect, fixed), the races did not prove overlap, the authorization sweep omitted period changes, and rollback paths lacked evidence. The recheck (Opus, [2026-11-10-m6-t7-recheck.md](../../reviews/2026-11-10-m6-t7-recheck.md)) confirmed those fixes and found that `TRY_AGAIN` had been added to S22 instead of S32; moved and OpenAPI regenerated. Its two minors are fixed: a test pins the `40P01` mapping, and new 20 iteration races cover a period holder that rolls back and two writers updating an existing base rate.

Remaining limitations:

- The `40P01` mapping is proven with a synthetic error, not a real deadlock, which the suite cannot produce on demand.
- Two nits from the recheck are left as is: the period wait helper accepts any backend whose query mentions `RatePeriod`, and readers refused by the unit test do not assert zero calendar reads.
- `tests/unit/architecture/persistence-boundaries.test.ts` ("keeps reservation tables out of every other folder") timed out at its five second limit in two full runs and passed on every rerun and alone. It scans the source tree; not changed in T7.
- The integration wiring in `tests/integration/reservations/support/rates.ts` mirrors `src/composition/pricing.ts` by hand, like the T5 and T6 support files.
- Public availability P5, the staff grid S20, VAT, and reservation price snapshots are later tasks.

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
- M6-T7: rate repository, `ManageRates`, `GetRateCalendar`, S30 to S34, accepted by the owner.
- M6-T8: `GetAvailabilityGrid`, S20, and the `SearchAvailability` use case, accepted by the owner.
- M6-T9: atomic public limiter admission, anonymous fallback, bounded expiry cleanup and its operator command, accepted by the owner.
- The public availability API (P5) remains T10; staff screens remain M11 and M12.

## Files by responsibility

- Domain (T1): `src/domain/shared/local-date.ts`, `stay-range.ts`, `stay-policy.ts`, `occupancy.ts`, and `money.ts`; additive helper in `zoned-time.ts`.
- Domain (T2): `src/domain/inventory/{availability-calculator,inventory-reduction,index}.ts` and `src/domain/pricing/{nightly-price-resolver,index}.ts`. Cross-module callers use the public exports.
- Tests (T1): five suites in `tests/unit/domain/`, plus branch date cases in `tests/unit/content/zoned-time.test.ts`.
- Tests (T2): `tests/unit/domain/{availability-calculator,inventory-reduction,nightly-price-resolver}.test.ts`, 73 tests.
- Application (T4): `src/application/reservations/ports.ts`, `src/application/inventory/{ports,inventory-guard}.ts`, and their public exports; typed inventory conflict context in `src/application/shared/result.ts`.
- Infrastructure and HTTP (T4): Prisma unit of work, inventory lock, batched reader, empty consumption adapter, SQLSTATE extraction, and the shared problem mapping.
- Tests (T4): unit guard and HTTP tests plus real PostgreSQL unit of work, inventory reader, and concurrency suites under `tests/integration/reservations/`.
- Application/infrastructure/operations (T9): `src/application/shared/{rate-limit,public-rate-limit-ports,public-rate-limit-policy,cleanup-public-throttles}.ts`, the Prisma public store, API and maintenance composition, and `scripts/throttles.mts`.
- Tests (T9): public admission unit and proxy trust suites plus `tests/integration/public-rate-limit.test.ts`; existing staff sign-in suites remain regression coverage.
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

| Criterion | Accepted T1 through T9 evidence and remaining scope |
| --- | --- |
| AC-1 | Domain resolver and T8 search prove the 26000-cent worked example and quantity multiplication. Public P5 proof remains T10 |
| AC-2 | T3 exclusions and T7 rate API tests refuse overlapping active periods with safe 409 errors |
| AC-3 | T1/T2 date and overlap arithmetic, T3 database exclusions, and T6 block workflows cover adjacency and partial overlap |
| AC-4 | Guard and writer tests cover projected capacity refusal, conflicting blocks, earliest unavailable night, locking, and audit rollback; sold/assignments are injected until M8 |
| AC-5 | Real PostgreSQL races cover block versus block, block versus deactivation, locking entry points, and branch isolation with 20 repetitions |
| AC-6 | Pure rules and T8 reads retain zero capacity and complete unpriced results. P5 response mapping remains T10 |
| AC-7 | T7 rate API authorization, branch scope, audited before/after writes, and rollback tests passed |
| AC-8 | T8 proves uncached staff grid reads and the search view-model allowlist. T9 proves atomic limiter admission, fallback and safe expiry lifecycle. Public route cache/disclosure proof remains T10 |

## Independent review and owner acceptance

Author model confirmed by the owner: `gpt-6.1-sol`. Independent reviewer: `gpt-6-astra`, reviewing the real uncommitted T1 change from planning commit `55f9c4a`. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md).

The owner accepted M6-T1 on 2026-11-08 and authorized the documentation sync and task commit. That acceptance does not start T2 or authorize a push or merge.

The owner accepted M6-T2 on 2026-11-08 after its review package. `gpt-6-astra` independently reviewed the nine-file uncommitted T2 change against accepted T1 commit `4334654`, with `gpt-6.1-sol` as the author. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md). The owner authorized documentation sync and the T2 commit, explicitly without starting the next task. No push or merge is authorized by that acceptance.

M6-T3 was independently reviewed by Opus (author: Sonnet; an earlier session began the implementation). Verdict: **Changes requested** (one major: `data-model.md` not reconciled; four minors; five nits). The major and the cheap minors were fixed and the gates rerun; the remaining minors (partial-upgrade rollback test strength, race barrier) and nits are accepted as is. Full report: [2026-11-08-m6-t3.md](../../reviews/2026-11-08-m6-t3.md). The owner accepted M6-T3 on 2026-11-08 and authorized the documentation sync and commit, without starting T4. No push or merge is authorized.

M6-T4 received a fresh model review against the approved critical risk task card. The first pass found two test coverage gaps: the audit rollback case did not exercise the real guard and persistence path, and several refusal paths lacked direct coverage. The tests were expanded for real guard rollback, foreign listings, invalid consumption contributions, failed loads, and assigned units. The reviewer reran the affected unit, architecture, and integration suites and then returned **Approve** with no open findings. Full report: [2026-11-09-m6-t4.md](../../reviews/2026-11-09-m6-t4.md). The owner accepted M6-T4 on 2026-11-09 and authorized this documentation sync and task commit, explicitly without starting T5. No push or merge is authorized.

## Known limitations and deferred work

M6-T1 through M6-T9 are accepted. Public availability API P5 remains M6-T10 and requires its own approved plan, implementation, verification, independent review, and acceptance. Hourly limiter cleanup and trusted-proxy configuration still need the deployment rehearsal. The production reservation consumption adapter intentionally reports no sold or assigned rows until M8, and the sync checkpoint reader returns null until persisted synchronization arrives. Availability reads do not hold inventory or promise a shared capacity/rate snapshot. Persisted reservation price snapshots and manual override authorization remain M8 work. Task-specific accepted limitations remain documented in the sections above.

## Next milestone

M7 has not started. M6-T10 has not started; stop after the accepted T9 commit unless the owner requests separate maintenance work.
