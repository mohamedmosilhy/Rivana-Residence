# M6: Inventory, date prices, and availability

Status: **Accepted by the owner, 2026-11-10.** M6-T1 through M6-T10 are accepted and the closeout gates and live verification passed. The branch is merged into `main` and pushed next, per the owner's milestone rule.

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
| M6-T10 | Critical | Owner, 2026-11-10, conditional warning fixes completed | `feat(inventory): add M6-T10 public availability API` (this task commit) | [2026-11-10-m6-t10.md](../../reviews/2026-11-10-m6-t10.md), warning recheck [2026-11-10-m6-t10-warning-recheck.md](../../reviews/2026-11-10-m6-t10-warning-recheck.md) | Final check passed: 68 unit files / 1,385 tests and build; integration: 30 files / 425 tests; full Chromium E2E: 176 passed / 30 skipped; focused concurrency: 2 files / 28 tests with 20-iteration races | P5, strict public contracts and DTO, uncached public summary orchestration, worked-example response; Tailwind deprecation and media tracing warning fixes included at owner's request |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.

## Outcome

T1 implements the shared domain foundation for later inventory, pricing, and reservation tasks. `LocalDate` performs exact Gregorian calendar arithmetic; `StayRange` provides positive ranges with exclusive checkout, lazy night iteration, and overlap. Public limits remain in a separate `StayPolicy`, with branch today supplied by the caller. `Occupancy` checks counts and per unit eligibility. `Money` handles USD integer cents and checked arithmetic.

`localDateAt` derives a branch date from an explicit instant and IANA zone. It reads no hidden clock and leaves the existing editorial time conversion helpers intact. Invalid input uses the existing `DomainValidationError` and field issues. Value instances are immutable.

T2 implements the pure inventory and pricing rules. `AvailabilityCalculator` checks every requested night against capacity minus sold and reports the earliest insufficient night. `NightlyPriceResolver` chooses the covering active period, otherwise base, otherwise unpriced; its immutable ordered nightly values produce an exact accommodation subtotal multiplied by quantity, or a null total for any gap. The four night worked example resolves to 26000 cents.

`checkInventoryReduction` rejects overlapping blocks and consuming physical assignments, then compares sold with projected capacity on sparse supplied sold dates. Block replacement and inactive or already blocked units do not subtract capacity twice. Deactivation starts at an explicit branch date without a public horizon shortcut. Long block ranges never expand empty calendar dates. These functions perform no database access, authorization, locking, or writes.

T4 adds the transaction and locking foundation used by later inventory writers. `ReservationUnitOfWork` binds only the ports a use case needs to one Prisma transaction at `READ COMMITTED`. A failed result is converted into an internal abort so Prisma rolls back instead of committing it; unexpected exceptions still propagate to the redacted HTTP failure path. `InventoryLock` deduplicates and sorts room type ids, takes `FOR NO KEY UPDATE` locks with a five second PostgreSQL timeout, verifies complete branch ownership, and maps lock timeout to `TRY_AGAIN`.

The batched inventory reader returns every requested listing and night, including zero capacity, and merges checked sparse consumption contributions. M6's production consumption adapter intentionally returns none until reservation persistence arrives in M8. `InventoryGuard` enforces lock, reload, validation, mutation, and audit order inside the same unit of work. T4 provides the foundation and tests, but no production unit or block writer is composed before T5 and T6.

## M6-T10 (accepted)

The owner approved the task plan, reviewed the result, and accepted T10 on 2026-11-10 conditional on resolving the existing Tailwind deprecation and media tracing warnings. The owner explicitly authorized documentation synchronization and the task commit, without starting another task. Both warning fixes are included in this task. M6 milestone closeout, acceptance, push and merge remain separate.

### Delivered behavior

`GET /api/v1/branches/{branchSlug}/availability` uses the shared public wrapper and T9's availability limiter. The new `SearchPublicAvailability` application orchestration resolves the active branch from its URL slug and calls the accepted T8 `SearchAvailability`. It joins results by internal listing identity to freshly loaded published room summaries and omits summaries that disappear or are unpublished during the reads. Existing branch/room ports, repositories, public view models and summary mappers are reused; no new port or schema is added.

P5 requires `checkIn`, `checkOut`, `adults`, and `children`; omitted `unitsRequested` defaults to 1, with a maximum of 5. Missing, unknown, and duplicate query keys return 400; invalid date, number, stay and occupancy values return 422 with field errors. Empty numeric strings remain invalid instead of becoming zero. Branch-local today is derived from the server's clock and the branch zone. Active branches remain searchable while booking is disabled; inactive/missing branches return 404.

Every published listing is returned in catalog order with availability for the requested quantity, a selectable count capped at 5, ordered per-unit nightly amounts, and their accommodation total multiplied by quantity, before VAT. Refusal precedence is `UNPRICED`, `OCCUPANCY`, then `SOLD_OUT`. Unpriced results have an empty nightly array and null total. The explicit HTTP mapper exposes no internal listing IDs, physical IDs/labels, block notes or raw inventory counts. Every GET success/error is `no-store`; no marketing cache is used. Search neither holds inventory nor promises reservation creation readiness.

The existing guarded demo seed already supplies usable published room/apartment summaries, physical units and rates. A new real-handler test proves P5 after both a fresh and repeated demo seed; no additional fictional inventory or prices were needed. Existing production seed refusal tests remain green. OpenAPI was regenerated and freshness verified.

### Warning fixes and safety proof

The Tailwind 4.3.0 Node loader called deprecated `module.register()` on Node 26. Tailwind and its PostCSS adapter are pinned to **4.3.5**, which retains the upstream `registerHooks()` fix ([first shipped in 4.3.1](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.1)). The 4.3.1 trial was not retained because its pinned PostCSS introduced two additional development audit findings; 4.3.5 returns the audit to the original 26 development findings, with zero production findings and no newly flagged packages. A clean install after an interrupted dependency trial succeeded; no installed-package edit or warning-suppression environment setting is used.

Turbopack traced `realpath(options.forbidInside)` as a deployment asset and expanded the whole checkout. The call now carries the supported `turbopackIgnore` asset-tracing annotation, with a comment explaining that this is a runtime containment boundary. The `realpath` call and rejection remain intact. The added media regression case checks aliases on both sides of the application boundary; existing traversal, symlink, permissions, quarantine and storage contract cases also pass. The directive changes asset analysis, not the runtime security policy.

Inspection of all 56 server tracing manifests measured a maximum of **1,320 files before / 339 after**. References to checkout documentation/tests/git files, counted across manifests, fell from **3,748 to 56**; the remaining references are only the two JSON documents `docs/api/openapi.json` and the captured worked-example response, not a whole-checkout traversal. The final aggregate, integration, and E2E build logs contain neither targeted warning. No global issue filter was configured.

### Commands, results and runtime evidence

Final verification used Node **26.13.0**, npm **11.20.0**, PostgreSQL **18.4**:

```sh
npm ci --no-audit
npm run check
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration -- --reporter=dot
E2E_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_e2e_test npm run test:e2e
TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration -- --reporter=dot tests/integration/reservations/concurrency.test.ts tests/integration/public-rate-limit.test.ts
npm audit --json
npm audit --omit=dev --json
```

Passed clean installation and Prisma generation; format, lint, typecheck, **68 unit files / 1,385 tests**, and production build; **30 integration files / 425 tests**; **176 Chromium E2E tests**, with **30 intentionally skipped** by viewport/project scoping; and focused concurrency **2 files / 28 tests**, including inventory and limiter races repeated 20 times. Full E2E includes media upload/replacement and visual baselines after the dependency and tracing fixes. Audit exits nonzero for the existing 26 development findings (2 low, 10 moderate, 14 high); production audit exits zero with zero findings. No migration/drift check applies because there is no schema change.

Initial P5 verification also ran the following separate live browser proof; the final full E2E suite reran that same P5 case successfully:

```sh
E2E_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_e2e_test PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/rivana-m6-t10-live.json npm run test:e2e -- --project=branches --no-deps --grep 'P5 exposes' --reporter=json
```

Passed **1 test**. [Captured real HTTP response](./m6-t10-worked-example.json): December 10 to December 14, 2026, nightly amounts 6000, 6000, 7000, 7000 and total **26000 USD cents**. That live case also proves quantity 2 totals 52000, the 400/422 split, fresh rates and unit changes, and branch deactivation returning 404 without cache invalidation. Fixtures are confined to the disposable E2E database and cleaned afterward. Persisted reservation consumption remains empty until M8.

### Independent review

Initial reviewer `gpt-6-astra`, author `gpt-6.1-sol`: **Approve**, zero findings ([report](../../reviews/2026-11-10-m6-t10.md)). It independently reran **67 unit/architecture tests** and **34 P5 PostgreSQL integration tests**. The warning fixes were rechecked independently by `claude-sonnet-5-5`: **Approve**, zero findings ([recheck](../../reviews/2026-11-10-m6-t10-warning-recheck.md)). It confirmed Tailwind 4.3.5 only, a lockfile change confined to the Tailwind tree, no `DEP0205` and no tracing warning in a fresh build, 339 files in the largest tracing manifest, the unchanged runtime containment check, and the same 26 development and 0 production audit findings.

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
- M6-T10: P5 public availability API, query/response contracts and DTO, uncached public summary orchestration, live worked-example evidence, and targeted build warning fixes, accepted by the owner. Staff screens remain M11 and M12.

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

| Criterion | Accepted T1 through T10 evidence and deferred scope |
| --- | --- |
| AC-1 | Domain resolver and T8 search prove the 26000-cent worked example and quantity multiplication. T10 proves the same total through the real P5 handler and live browser response |
| AC-2 | T3 exclusions and T7 rate API tests refuse overlapping active periods with safe 409 errors |
| AC-3 | T1/T2 date and overlap arithmetic, T3 database exclusions, and T6 block workflows cover adjacency and partial overlap |
| AC-4 | Guard and writer tests cover projected capacity refusal, conflicting blocks, earliest unavailable night, locking, and audit rollback; sold/assignments are injected until M8 |
| AC-5 | Real PostgreSQL races cover block versus block, block versus deactivation, locking entry points, and branch isolation with 20 repetitions |
| AC-6 | Pure rules and T8 reads retain zero capacity and complete unpriced results. T10 proves the P5 response mapping, refusal precedence, capped quantity, and no invented price |
| AC-7 | T7 rate API authorization, branch scope, audited before/after writes, and rollback tests passed |
| AC-8 | T8 proves uncached staff grid reads and the search view-model allowlist. T9 proves atomic limiter admission, fallback and safe expiry lifecycle. T10 proves public no-store responses, uncached branch/catalog/inventory/rate reads, the response allowlist and limiter wiring |

## Independent review and owner acceptance

Author model confirmed by the owner: `gpt-6.1-sol`. Independent reviewer: `gpt-6-astra`, reviewing the real uncommitted T1 change from planning commit `55f9c4a`. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t1.md](../../reviews/2026-11-08-m6-t1.md).

The owner accepted M6-T1 on 2026-11-08 and authorized the documentation sync and task commit. That acceptance does not start T2 or authorize a push or merge.

The owner accepted M6-T2 on 2026-11-08 after its review package. `gpt-6-astra` independently reviewed the nine-file uncommitted T2 change against accepted T1 commit `4334654`, with `gpt-6.1-sol` as the author. Verdict: **Approve**, zero findings. Full report: [2026-11-08-m6-t2.md](../../reviews/2026-11-08-m6-t2.md). The owner authorized documentation sync and the T2 commit, explicitly without starting the next task. No push or merge is authorized by that acceptance.

M6-T3 was independently reviewed by Opus (author: Sonnet; an earlier session began the implementation). Verdict: **Changes requested** (one major: `data-model.md` not reconciled; four minors; five nits). The major and the cheap minors were fixed and the gates rerun; the remaining minors (partial-upgrade rollback test strength, race barrier) and nits are accepted as is. Full report: [2026-11-08-m6-t3.md](../../reviews/2026-11-08-m6-t3.md). The owner accepted M6-T3 on 2026-11-08 and authorized the documentation sync and commit, without starting T4. No push or merge is authorized.

M6-T4 received a fresh model review against the approved critical risk task card. The first pass found two test coverage gaps: the audit rollback case did not exercise the real guard and persistence path, and several refusal paths lacked direct coverage. The tests were expanded for real guard rollback, foreign listings, invalid consumption contributions, failed loads, and assigned units. The reviewer reran the affected unit, architecture, and integration suites and then returned **Approve** with no open findings. Full report: [2026-11-09-m6-t4.md](../../reviews/2026-11-09-m6-t4.md). The owner accepted M6-T4 on 2026-11-09 and authorized this documentation sync and task commit, explicitly without starting T5. No push or merge is authorized.

## Milestone closeout verification (2026-11-10)

Run on the final tree at commit `8943df1` (the T10 commit), Node **26.13.0**, npm **11.20.0**, PostgreSQL **18.4**. Verification followed `/check verify`: run the built app, prove every acceptance criterion through real requests, and collect the brief's evidence items. No application code changed during closeout.

### Full gates

| Gate | Command | Result |
| --- | --- | --- |
| Aggregate | `npm run check` | **Pass**: format, lint, typecheck, **68 unit files / 1,385 tests**, production build. No deprecation or tracing warning in the build |
| Integration | `TEST_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_test npm run test:integration -- --reporter=dot` | **Pass**: **30 files / 425 tests** |
| Chromium E2E | `E2E_DATABASE_URL=postgresql://mohamedmosilhy@127.0.0.1:5432/rivana_e2e_test npm run test:e2e` | **Pass**: **176 passed, 30 intentionally skipped** |
| Concurrency, 20 repetitions | `npm run test:integration -- --reporter=verbose tests/integration/reservations/concurrency.test.ts tests/integration/public-rate-limit.test.ts` | **Pass**: **2 files / 28 tests**, every race case repeated 20 times |
| Audit | `npm audit --omit=dev`, `npm audit --json` | 0 production findings, 26 existing development findings (2 low, 10 moderate, 14 high), unchanged |
| Migration drift | Not applicable | No schema change in T10 or closeout. All migrations applied cleanly to a fresh database with `npm run db:deploy` |

Cross-browser (WebKit, Firefox) and Lighthouse were not rerun: M6 adds no page or visual change, and the full gate list for this milestone is the Chromium set.

### Live proof of every acceptance criterion

Setup: a scratch database `rivana_verify` (dropped afterward), `npm run db:deploy`, `npm run db:seed -- --demo`, three staff accounts (Admin, Receptionist on `new-cairo`, Manager on `demo-giza`), the production build served with `npm run start` on port 3300, and fictional fixtures (rooms, units, rate periods) dated 40 days ahead so the past date rule stays in force. Browser sign in through the real login form, then API calls from the signed in page. All 20 checks passed; full output is in [m6-closeout-live-verification.json](./m6-closeout-live-verification.json).

| Criterion | Live evidence |
| --- | --- |
| AC-1 | `GET /api/v1/branches/new-cairo/availability?checkIn=…&checkOut=…&adults=2&children=0` returned 200, nightly amounts `[6000, 6000, 7000, 7000]`, total **26000** USD cents; `unitsRequested=2` returned **52000** |
| AC-2 | `POST` of an overlapping period to S32 returned **409** `CONFLICT`; an adjacent period returned 201; the database holds three active periods with no overlap |
| AC-3 | Blocks `[d0,d2)` and `[d2,d4)` on one unit both returned 201; `[d3,d5)` returned **409** "This unit already has a block on those dates" |
| AC-4 | Overlapping blocks on one unit are refused live. **The sold greater than capacity refusal naming the night cannot be reached live in M6**, because sold counts are zero until M8 (the brief and spec 0003 say so). It is proven by the T4, T6 and T7 guard and writer tests with injected sold counts |
| AC-5 | Eight simultaneous identical block requests on one unit returned one 201 and seven 409, one stored block. Writes in `new-cairo` left the `demo-giza` availability response byte identical. The 20 repetition PostgreSQL races above cover block against block, block against deactivation, and branch isolation |
| AC-6 | A listing with rates but no active unit returned `available: false`, `SOLD_OUT`, 0 units. Four unpriced listings returned `UNPRICED`, `accommodationTotal: null`, empty nightly array. No price was invented |
| AC-7 | Receptionist: S30 read 200, base rate write **403**. Manager: write in the assigned branch 200, in another branch 404. Two audit rows with `before` and `after` (`null` to 12000, then 12000 to 12500). Refused writes changed nothing (base rate stayed 5500) |
| AC-8 | P5 and staff grid S20 responses carry `Cache-Control: no-store`. Changing a rate in the database changed the next response to the identical URL (26000 to 30000). The response keys are only `roomType`, `available`, `unitsAvailable`, `pricePerNight`, `accommodationTotal`; a search for unit ids, labels, capacity, blocked, and branch id found none. A blocked unit lowered `unitsAvailable` from 2 to 1 without naming it. Public limiter: 75 rapid requests produced 48 200 and 27 **429** with `Retry-After` and `no-store` |

### Other brief evidence items

- **Query plan.** [m6-closeout-capacity-plan.txt](./m6-closeout-capacity-plan.txt) holds `EXPLAIN (ANALYZE, BUFFERS)` of the capacity query on the demo seed plus fixtures: 1.3 ms execution, index scans on `PhysicalRoom` and the `InventoryBlock_no_overlap` index, 103 shared buffer hits. The data set is tiny, so this shows the access path, not production scale.
- **Empty sold adapter.** M6 composes a consumption adapter that returns no sold or assigned rows until M8. The real sold query plan is deferred to M8.
- **Worked example response.** [m6-t10-worked-example.json](./m6-t10-worked-example.json) (the Playwright capture) and the live closeout run above both show 26000.
- **Concurrency.** 20 repetition output is the verbose run in the table above.

### Closeout limits

- AC-4's sold refusal is test proven, not live proven, for the reason above.
- The optional milestone wide `/check review` was not run. Every task already had its own independent review, and no cross task interaction was found. It remains available if you want it.
- No warnings appear in the build, tests, or runtime, and none are suppressed.

## Known limitations and deferred work

M6-T1 through M6-T10 are accepted. Closeout verification passed (see the closeout section) and the owner accepted the milestone on 2026-11-10. Hourly limiter cleanup and trusted-proxy configuration still need the deployment rehearsal. The production reservation consumption adapter intentionally reports no sold or assigned rows until M8, and the sync checkpoint reader returns null until persisted synchronization arrives. Availability reads do not hold inventory or promise a shared capacity/rate snapshot. Persisted reservation price snapshots and manual override authorization remain M8 work. Task-specific accepted limitations remain documented in the sections above.

## Next milestone

M7 has not started. After the merge, branch `m7-booking-quote` is created from `main` and work stops there.
