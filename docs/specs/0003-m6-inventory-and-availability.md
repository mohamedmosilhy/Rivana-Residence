# 0003. Inventory, date prices, and availability (M6)

**Date**: 2026-11-08
**Status**: In Progress (M6-T1 through M6-T9 accepted, 9/10 tasks; T10 not started)
**Owner approval**: Amended spec and ten task breakdown approved, 2026-11-08
**Mode**: FEATURE
**Branch**: `m6-inventory-and-availability`

## Summary

M6 adds physical units, maintenance blocks, nightly rates, and availability reads for rooms and apartments. Every write that can reduce availability takes a PostgreSQL lock before counting and writing, so competing requests cannot make capacity smaller than sold inventory. Public responses show prices before VAT and only a capped selectable quantity. The owner approved this spec and the task table on 2026-11-08; each task still has its own plan and acceptance gates.

## Context

M5 is accepted and merged. Branches, catalog publication, staff capabilities, branch assignments, HTTP wrappers, audit storage, and OpenAPI generation already exist. Inventory and pricing modules do not exist yet. The pre M6 repair gate, including the single seed and its production guard, is recorded as accepted.

The application remains one Next.js application using PostgreSQL and Prisma. Installed dependencies include Next.js 16.4.5, Prisma 7.10.0, and Better Auth 1.7.18; this spec proposes no dependency changes. The installed Route Handlers guide was read. Project delivery is domain first, then persistence and API, in separately approved tasks. There is no `docs/scope/` tracker; the brief owns task status.

The design must support future reservation consumers without creating reservation, sync, commercial, or payment tables early. In M6 the reservation consumption port returns no lines, so persisted sold counts are zero. Hotel system synchronization remains manual. Public availability is a current observation, never an inventory hold.

### Decision provenance and scope

| Input | Source and disposition |
| --- | --- |
| Q-09 | Accepted recommendations in the M6 brief: maximum 30 nights, check in at most 540 days ahead, no same day cutoff, and no minimum beyond a positive stay. Branch `checkInTime` remains required before enabling booking. Existing approved seed data supplies New Cairo's `14:00` and `12:00`; no global hotel times are invented. |
| Q-17 | Accepted recommendation in the brief: no forced overselling, including for Managers and Admins. Staff must resolve affected reservations first. |
| Q-68 | Owner, 2026-11-08: P5 accepts optional `unitsRequested`, default 1. |
| Q-69 | Owner, 2026-11-08: adopt the documented proposed maximum of 5 units now, instead of waiting for M10. It is the booking maximum across listings, and the P5 disclosure cap. |
| Q-70 | Owner, 2026-11-08: active branches may expose search while online booking is disabled. Search does not enable creation or bypass its readiness checks. |
| Remaining design | Local implementation choices below were approved with this spec on 2026-11-08. They do not add business rules. Further contract, schema, port, or architecture changes require owner approval. |

In scope: date, stay, occupancy, and money values; inventory arithmetic; physical units and blocks; base rates and one kind of date period; transaction and lock helpers; staff inventory and rate APIs; public availability; tests and evidence.

Out of scope: reservations and assignments, payment holds, notifications, services, coupons, VAT computation, full quotes, staff screens, guest screens, and an external hotel system adapter. M7 owns the commercial rules; M8 owns real sold inventory and sync checkpoint persistence.

## Requirements

User stories: visitors can inspect availability and accommodation prices for the selected branch; front desk staff can maintain blocks and inspect counts; Managers can manage units and rates for assigned branches; Admins can do so for every branch.

Acceptance criteria retain the brief's numbering and meaning:

1. **AC-1**: The worked example with two date periods and four nights totals **26000 cents ($260.00)** through `NightlyPriceResolver` and API-P5.
2. **AC-2**: The database refuses overlapping active periods for one listing; the API returns `409` with a field error.
3. **AC-3**: Back to back stays and blocks do not overlap; partial overlaps do. Stay dates and limits follow AV and OC rules.
4. **AC-4**: A block that would make sold exceed capacity on any night returns `409 INVENTORY_UNAVAILABLE`, naming the first affected night. Blocks on the same unit cannot overlap.
5. **AC-5**: Competing blocks and unit deactivation never oversell. Branch B writes do not change branch A counts. M6 proves the block only portion of C-4 and C-8; M8 extends the proof to persisted reservations.
6. **AC-6**: No active unit means unavailable. Any unpriced night means `UNPRICED` and a null total. No price is invented.
7. **AC-7**: Receptionists read rates but cannot write them. Managers write only within assigned branches. Rate changes store before and after audit values in the same transaction.
8. **AC-8**: Availability is never cached. Public responses disclose no unit labels or raw capacity, sold, blocked, or free counts, only selectable quantity capped at 5.

The approved P5 refinements also require quantity validation from 1 to 5, default 1, and search on active branches with booking disabled (Q-68 through Q-70).

## Options considered

These options concern how to implement the accepted lock design, not whether to replace ADR 016.

| Option | Benefit | Cost |
| --- | --- | --- |
| Shared `InventoryGuard` with transaction bound ports, chosen | One lock, projection, check, and write workflow for every inventory reduction; testable without Prisma | A small transaction context and guard contract must be learned and maintained |
| Each mutation performs the accepted lock and count steps itself | Fewer abstractions and direct control for each writer | Repeats the correctness protocol and makes an omitted lock harder to detect |
| Database routines implement every inventory workflow | Other SQL clients can share the same entry point | Moves application decisions into SQL and requires another workflow and migration surface |

The first two are compatible with lock plus count; the first best addresses the forgotten writer risk in ADR 016. SQL workflows conflict with the project's domain and application ownership. A counter table, process mutex, or different isolation strategy would reopen ADR 016 and is outside this spec. (Basis: ADRs 015, 016, 021, and 022.)

## Decision

Use pure domain values and calculations, one application `InventoryGuard`, and an interactive transaction adapter that binds all participating ports to the same PostgreSQL connection. Lock listing rows in sorted id order at `READ COMMITTED`, then read, project the mutation, validate, persist, and append audit before commit. Reads take no inventory locks. (Basis: ADRs 015, 016, 020, and 022.)

Keep all SQL for the new tables under `src/infrastructure/db/prisma/repositories/reservations/inventory/` and `.../reservations/pricing/`. These nested folders preserve ADR 015 and the implemented D-9 boundary; sibling `repositories/inventory/` and `repositories/pricing/` would fail that boundary. The broader brief folder shorthand does not justify weakening it.

Implementation workflow: `/develop` logic track, `/test`, `/check verify`, and an independent `/check review uncommitted` on a different model for each implemented task. No UI or technology discovery skill is needed.

## Rationale

The hotel needs inventory correctness across processes and deployment overlap. A shared PostgreSQL transaction gives the lock, counts, mutation, and audit the same commit outcome. Reading after the lock at `READ COMMITTED` sees a competing writer's committed result. Keeping calculations pure makes the boundary cases explicit, while real database tests prove the parts a fake cannot prove.

The alternative of repeating the protocol in every use case is initially smaller but repeats the exact risk ADR 016 identifies. The shared guard is limited to the real M6 reductions, with ports that M8 can extend. It does not create a generic workflow framework or prebuild reservations.

## Feature design

### Domain contracts

| Value or rule | Behavior and source |
| --- | --- |
| `LocalDate` | Immutable Gregorian date, strict `YYYY-MM-DD`, impossible dates rejected. Parse, compare, add calendar days, and format. No JavaScript `Date` for stay dates in domain or application code (ADR 020). |
| `StayRange` | Immutable `[checkIn, checkOut)`, strictly positive length, deterministic night iteration, overlap by AV-3. Structural range validity is separate from public stay policy. Blocks, rate periods, and staff read windows do not inherit the public 30 night or 540 day limits. |
| `StayPolicy` | Injected application configuration supplies the Q-09 defaults. Public validation uses branch today from `Clock.now()` and `Branch.timeZone`, including Cairo DST. The 540 day check applies to check in, not check out. No new dashboard settings or environment variables. |
| `Occupancy` | Safe integer adults at least 1 and children at least 0, per unit. Eligibility compares against that listing's `maxAdults` and `maxChildren`; multiplying quantity does not multiply occupancy allowances. |
| `Money` | Nonnegative safe integer cents and explicit USD currency. Addition and quantity multiplication check currency and safe integer overflow. Authored rates must be positive and fit PostgreSQL `INTEGER`; generic money may be zero. There is no rounding in nightly accommodation sums. |
| `AvailabilityCalculator` | For each night, `free = capacity - sold`. Every requested night must have `free >= quantity`. Return the earliest failure, in date order. Missing units produce zero capacity; missing consumption contributions produce zero sold. Do not clamp negative free into an apparently valid state. |
| `NightlyPriceResolver` | Active period covering the night, otherwise base, otherwise unpriced. Returns immutable ordered nightly values with amount, source, period id, and optional label. Amounts do not depend on occupancy. Overlapping active periods are a database invariant, never a precedence rule. |
| Reduction rules | Compare projected capacity to sold on every affected night with positive sold inventory; zero sold cannot exceed nonnegative projected capacity. Obtain those dates from sparse consumption contributions, without expanding empty dates across a long block. Also refuse a block that intersects a consuming physical assignment when M8 supplies those assignments. Projection replaces the old block rather than subtracting both old and new. An inactive unit or already blocked night must not be subtracted twice. |

### Data model and relationships

One additive migration named `..._inventory_and_rates`, including `BlockReason { MAINTENANCE OWNER_USE OTHER }` and `CREATE EXTENSION IF NOT EXISTS btree_gist`. Dates are PostgreSQL `DATE`; timestamps are UTC `TIMESTAMPTZ(3)`. Application generated ids are CUID2 `VARCHAR(32)`.

| Entity | Required fields | Nullable fields | Relationships, indexes, and checks |
| --- | --- | --- | --- |
| `PhysicalRoom` | `id` PK; `branchId`; `roomTypeId`; `label VARCHAR(40)`; `active` default true; `createdAt`, `updatedAt` | `notes VARCHAR(500)`, `updatedById` | Composite FK `(roomTypeId, branchId)` to `Room(id, branchId)`, RESTRICT. Unique `(branchId, label)`, `(id, roomTypeId)` for future assignments, and `(id, branchId)` for block ownership. Index `(roomTypeId, active)`. |
| `InventoryBlock` | `id` PK; `branchId`; `physicalRoomId`; `startDate`, `endDate`; `reason`; `createdAt`, `createdById` | `note VARCHAR(500)`, `cancelledAt`, `cancelledById` | Composite FK `(physicalRoomId, branchId)` to `PhysicalRoom(id, branchId)`, RESTRICT. `endDate > startDate`. Indexes `(physicalRoomId, startDate)` and `(branchId, startDate)`. |
| `RoomBaseRate` | `roomTypeId` PK; `amountMinor INTEGER`; `currency CHAR(3)` default USD; `updatedAt` | `updatedById` | FK to `Room`, RESTRICT. `amountMinor > 0`, `currency = 'USD'`. |
| `RatePeriod` | `id` PK; `roomTypeId`; `startDate`, `endDate`; `amountMinor INTEGER`; `currency CHAR(3)` default USD; `active` default true; `createdAt`, `updatedAt` | `label VARCHAR(80)`, `updatedById` | FK to `Room`, RESTRICT. Index `(roomTypeId, startDate)`. `endDate > startDate`, `amountMinor > 0`, `currency = 'USD'`. |

Branch to listing is 1:N, listing to physical units and periods is 1:N, unit to blocks is 1:N, and listing to base rate is 1:0..1. Rates derive branch ownership through `Room`, never a branch supplied by a rate request. Creator and updater staff references follow the existing nullable updater and RESTRICT convention; block creators are required staff users.

Ownership composite FKs explicitly use `ON UPDATE RESTRICT` as well as `ON DELETE RESTRICT`. Do not let Prisma's default update cascade move existing units or blocks when a listing's branch changes. At the Prisma boundary only, map `DATE` to and from `LocalDate` at UTC midnight; every connection, including each test client, uses `options: "-c TimeZone=UTC"` (ADR 020).

The currency columns complete ADR 020's explicit persisted currency requirement, which the data model sketch omits. The block composite FK completes ADR 017's same branch guarantee. These schema refinements were approved with this spec; reconcile the topic data model during T3.

SQL only exclusion constraints, kept in the reviewed migration:

```sql
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_no_overlap"
  EXCLUDE USING gist (
    "physicalRoomId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("cancelledAt" IS NULL);

ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_no_overlap"
  EXCLUDE USING gist (
    "roomTypeId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("active");
```

No reservation assignment constraint is created against a nonexistent table. T3 updates the milestone schema allowlist test to expect exactly these four new models, while continuing to reject all later milestone tables. Rehearse on a disposable copy of M5 data, preserve row counts, and run the migration drift check. If `btree_gist` is unavailable, stop and apply the deployment decision process in ADR 022; do not silently drop either exclusion constraint. That ADR's assignment fallback does not authorize removing block or rate protection.

Deployment rollback: take the standard backup before deployment. The old application can run with the four additive tables left in place. If the migration itself fails, resolve its database state before retrying; do not run a second improvised migration. Any schema reversal after staff data exists needs a separately reviewed recovery plan or backup restore. Never drop inventory or rates merely to roll application code back.

### Transaction, ports, and lock protocol

Ports expose application records and value objects, never Prisma types:

| Port | Owner and responsibility |
| --- | --- |
| `ReservationUnitOfWork<Context>` | Public port in `src/application/reservations/ports.ts`, as the transaction boundary anticipated by ADR 015. `run` receives a callback returning `Result<T>`. Contexts contain only the ports a use case needs, not reservation features that do not exist yet. |
| `InventoryLock` | Inventory application port: `lockRoomTypes(branchId, ids)` locks the complete, deduplicated set in ascending id order and verifies every requested id belongs to that branch. |
| `RoomTypeCatalog` | Consuming module port for branch owned listing identity, publication, occupancy limits, public summary fields, and stable order. It does not expose CMS repositories to application modules. |
| `InventoryReader` | Capacity and blocked contributions per listing and night; merges sold contributions from the consumption port. Every method requires branch id and explicit listing ids and dates. |
| `ReservationConsumptionReader` | Inventory consuming port for sparse positive sold contributions on affected dates, intersecting consuming assignment ranges, and all affected future consumption for deactivation. It does not generate a row for every empty calendar date. M6 implementation returns empty collections. M8 replaces it with real reservation data inside the same transaction context. |
| `PhysicalRoomRepository`, `BlockRepository` | Scoped reads and writes, with immutable branch and listing ownership. No method moves a unit or block to a different listing or branch. |
| `RateRepository` | Base and intersecting active or inactive periods, scoped through listing ownership, plus writes. |
| `LastSyncCheckpointReader` | Read seam for the last completed manual sync checkpoint. M6 returns null; M8 supplies persisted checkpoints. No invented checkpoint time or early sync table. |
| `AuditLog`, `Clock`, `IdGenerator` | Reuse the existing ports; extend typed audit actions and entities for these mutations. |

The infrastructure unit of work accepts a transaction context factory wired by composition. It supplies that factory with one Prisma transaction client. This lets T4 test the transaction mechanism before all concrete repositories are delivered, and lets T5, T6, and T7 bind only the ports they need. No fake production repository is used to satisfy an unfinished context.

The unit of work explicitly uses `READ COMMITTED`. A failed `Result`, an audit failure, or an exception rolls back all writes. Returning a failed result from Prisma's callback alone would commit, so the adapter uses an internal abort signal and converts it back to the original result outside the transaction. Preserve unexpected exceptions for the HTTP layer's redacted 500 mapping. A test must write first and then return failure to prove rollback.

`InventoryGuard` owns the reduction workflow: begin unit of work, lock all affected listings, reload mutable state, obtain the proposed capacity and consuming assignments through transaction bound ports, run pure checks, invoke the mutation, append audit, commit. Use cases must not open a second transaction inside it. Repositories expose low level persistence, but every production reduction entry point is wired through the guard.

The lock statements are separate from the count statement:

```sql
SET LOCAL lock_timeout = '5s';
SELECT id FROM "Room"
WHERE "branchId" = $branchId AND id = ANY($listingIds)
ORDER BY id FOR NO KEY UPDATE;
```

These are indicative placeholders. Implementation uses tagged `$executeRaw` and `$queryRaw` with bound values, never interpolation into SQL text or an unsafe raw method. The transaction timeout must exceed the five second lock timeout, so PostgreSQL can return the documented `503 TRY_AGAIN` rather than a premature interactive transaction failure. No network or filesystem operations occur inside a transaction. There is no automatic retry of an inventory conflict.

| Writer | Lock and check coverage |
| --- | --- |
| Unit deactivation | Lock its listing, reread the unit, and project losing that unit only on nights it currently contributes capacity. Examine all consuming future nights from branch today, not just 30, 62, or 540 days. An assignment on the unit also prevents making it unusable. Empty consumption in M6 does not bypass the guard. |
| Block create | Lock its listing, reread the unit, and check projected capacity on the intersecting sold dates plus consuming assignment overlaps. Do not expand empty dates across the block. Exclusion constraint arbitrates overlapping blocks on that unit. |
| Block date update | Take the listing lock before reloading and merging the end date. Check added capacity reductions on intersecting sold dates and assignments; use the merged range for overlap validation. Using the same lock for all end date changes avoids misclassifying a concurrent change. A shortening may serialize unnecessarily but never removes extra inventory. |
| Unit creation or activation | Adds capacity; audited transaction without the inventory lock. |
| Unit label or notes, block note only | Lock the resource row for a coherent before and after value; audited transaction, no inventory count. |
| Block cancel | Lock the block row and soft cancel; release only, no listing lock. A cancelled block cannot be extended. Repeated cancellation succeeds without another state change or duplicate mutation audit. |
| Base or period write | Audited transaction with coherent before and after values and database constraints, no inventory lock. Base writes use the insert then base row lock protocol below; period edits lock the period row. |

Inventory writers always acquire listing rows before unit or block rows. A release or note only path never holds a resource row and then requests a listing lock. Capacity increasing paths never reactivate or overwrite a concurrent deactivation based on stale state. Recheck activity and cancellation after locks. This covers block extension versus cancellation and unit activation versus deactivation without lost updates.

### Query shapes and errors

Capacity queries preserve every requested listing and night even with no unit rows. Start from the requested dates and listings, left join active units, and use `NOT EXISTS` or an equivalent aggregate to exclude active blocks on each date. A cross join to physical units would lose zero capacity nights and must not be copied literally from the indicative SQL. `blocked` counts only blocked active units, so it is consistent with capacity. SQL counts are converted to checked application integers.

For public and staff read windows, sold is merged by `(branchId, roomTypeId, night)` from `ReservationConsumptionReader`, zero filling every absent contribution. M6 performs no query against `ReservationRoom` or `ReservationNight`. M8 must introduce the accepted consuming status and hold rules without changing the availability arithmetic. Fetch listings, inventory, and rates in batches; avoid a query per night.

Reduction validation uses sparse consumption rather than the dense calendar read shape. For a block create or extension, read positive sold contributions intersecting the capacity reduction and calculate projected capacity only on those dates. Check physical assignment overlaps as ranges. For deactivation, inspect all affected future consumption from branch today. Work scales with intersecting consumption records, not the number of empty dates in the block span; do not generate every date between the endpoints. Zero sold and a nonnegative capacity projection need no nightly expansion. The empty M6 adapter still runs inside the guard and leaves overlap enforcement to the database constraint. This introduces no maximum block length or public stay limit on blocks.

Map known PostgreSQL or Prisma driver errors by SQLSTATE and constraint identity, with no provider message leakage: `23P01` on the rate or block exclusion becomes `409 CONFLICT` with safe date field errors; for rate period writes only, `40P01` (two concurrent exclusion checks can deadlock) is mapped to the same safe `409 CONFLICT`, an owner approved decision of M6-T7, pinned by a repository test; duplicate unit labels become `409 CONFLICT` on `label`; a failed capacity projection becomes `409 INVENTORY_UNAVAILABLE` with `context.firstUnavailableNight` and staff `roomTypeId`. Lock timeout `55P03` becomes `503 TRY_AGAIN` with `Retry-After: 5`, reusing the existing HTTP serializer's five second default for 503 responses. This retry delay is separate from the database lock timeout and the limiter's remaining window; no new configuration is needed. Unknown failures remain redacted 500s. Verify the actual Prisma 7 adapter error envelopes in integration tests rather than guessing one wrapper shape.

`ApplicationError` needs a typed safe context for the inventory conflict, and `problemFromError` must forward it through the existing serializer. Preserve current callers. Do not add reservation error codes that no M6 operation uses. Rate and block overlap field errors are allowed on 409 as the brief requires.

### API surface

All paths below start at `/api/v1`. Staff calls use existing cookie sessions, capability checks inside use cases, and CSRF on mutations. A create returns `Location`. Every response has `Cache-Control: no-store`. The reservation only `Idempotency-Key` and version headers do not apply to these resources, which have no such fields in the accepted endpoint design. Do not add early idempotency or version tables because of the broader engineering shorthand.

| Id and method | Path | Inputs | Success | Capability and key errors |
| --- | --- | --- | --- | --- |
| P5 GET | `/branches/{branchSlug}/availability` | Required `checkIn`, `checkOut`, `adults`, `children`; optional `unitsRequested` default 1 | 200 `{ stay, occupancy, results }` | Public; 404 inactive or missing branch, 422 date or occupancy semantics, 429 limit |
| S20 GET | `/staff/branches/{branchId}/availability` | Required `from`, `to`, exclusive end, at most 62 nights | 200 `{ roomTypes: [{ id, name, nights: [{ night, capacity, sold, free, blocked }] }], lastSyncCheckpoint }` | `inventory:read`; 403 explicit forbidden branch, 422 invalid range |
| S21 GET | `/staff/branches/{branchId}/physical-rooms` | Branch path | 200 `{ items: PhysicalRoomDto[] }`, including inactive units | `inventory:read`; 403, 404 |
| S22 POST | `/staff/branches/{branchId}/physical-rooms` | `roomTypeId`, `label`, optional `notes` | 201 `PhysicalRoomDto` | `inventory:manage`; 404 listing outside branch, 409 duplicate label, 422 |
| S23 PATCH | `/staff/physical-rooms/{id}` | `label?`, `notes?`, `active?`, at least one field | 200 `PhysicalRoomDto` | `inventory:manage`; 404 hidden resource, 409 inventory or label, 422 |
| S24 GET | `/staff/branches/{branchId}/blocks` | Required `from`, `to`; overlap filter | 200 `{ items: BlockDto[] }`, active blocks | `inventory:read`; 403, 422 |
| S25 POST | `/staff/branches/{branchId}/blocks` | `physicalRoomId`, `startDate`, `endDate`, `reason`; optional `note` | 201 `BlockDto` | `inventory:block`; 404 hidden unit, 409 overlap or inventory, 422 |
| S26 PATCH | `/staff/blocks/{id}` | `endDate?`, `note?`, at least one field | 200 `BlockDto` | `inventory:block`; 404 hidden resource, 409 cancelled or overlap or inventory, 422 |
| S27 DELETE | `/staff/blocks/{id}` | Resource path | 204, soft cancellation | `inventory:block`; 404 hidden resource |
| S30 GET | `/staff/room-types/{roomTypeId}/rates` | Required `from`, `to` | 200 `{ baseRate: Money or null, periods, calendar: NightPrice[] }` | `pricing:read`; 404 hidden listing, 422 |
| S31 PUT | `/staff/room-types/{roomTypeId}/base-rate` | `{ amount: Money }` | 200 `Money` | `pricing:manage`; 404, 422 |
| S32 POST | `/staff/room-types/{roomTypeId}/rate-periods` | `startDate`, `endDate`, `amount`; optional `label` | 201 `RatePeriodDto` | `pricing:manage`; 404, 409 active overlap, 422 |
| S33 PATCH | `/staff/rate-periods/{id}` | Partial `startDate`, `endDate`, `amount`, `label`, `active`; at least one field | 200 `RatePeriodDto` | `pricing:manage`; 404 hidden period, 409 active overlap, 422 |
| S34 DELETE | `/staff/rate-periods/{id}` | Resource path | 204, sets `active=false` | `pricing:manage`; 404 hidden period |

Local read contract refinement approved with this spec: S24 and S30 use the same 62 night read window as S20 to bound query and calendar expansion. This bounds a read, not the length of a block or rate period. Period lists include inactive intersecting periods for staff editing; only active periods contribute to the calendar. Preserve the unpaginated branch list shapes explicitly specified by the accepted contracts; a pagination redesign is outside M6.

`PhysicalRoomDto` contains `id`, `branchId`, `roomTypeId`, `label`, `active`, `notes`, `createdAt`, and `updatedAt`. `BlockDto` contains `id`, `branchId`, `physicalRoomId`, `startDate`, `endDate`, `reason`, `note`, `cancelledAt`, and `createdAt`. `RatePeriodDto` contains `id`, `roomTypeId`, `startDate`, `endDate`, `amount`, `label`, `active`, `createdAt`, and `updatedAt`. Staff dates and amounts use the common DTOs. `NightPrice` uses the common shape with a null amount for an unpriced night.

S20 includes every listing owned by the requested branch, including `DRAFT`, `PUBLISHED`, and `ARCHIVED`, ordered by `sortOrder` then `id`. A listing with no active units still appears with every requested night and zero counts. The staff catalog lookup must not apply P5's publication filter. This keeps inventory visible to authorized staff before publication and after archival.

P5 returns every published listing of the active branch in catalog order. Missing or inactive branch is 404; no published listings means an empty result list. An eligible listing's `unitsAvailable` is `min(5, min over nights of free)`, bounded below by zero for disclosure. Occupancy mismatch or any unpriced night makes it zero. `available` means the requested quantity is selectable, so it is false when the capped count is smaller than `unitsRequested`. It does not promise booking readiness or hold inventory (Q-70).

For each result, `pricePerNight` is the ordered per unit nightly amounts. `accommodationTotal` is their sum multiplied by `unitsRequested`, before VAT, even if capacity is insufficient. An unpriced stay returns `pricePerNight: []`, a null total, and `UNPRICED`; do not return a partial price array that looks complete. If several refusal conditions apply, report unpriced first, then occupancy, then sold out. Unavailable results have `reason`; available results omit it. Return no physical ids, labels, block reasons, or internal counts. The quantity echo remains in the validated request; no new response field is required.

The existing wrapper maps query schema failures to 400. Keep malformed query structure and unknown query keys at 400, but perform date, range, occupancy, and quantity semantics in the use case so those failures return the required 422 with field errors. Do not pass a query schema that turns an impossible date or out of range quantity into 400. Contract and direct handler tests must prove the distinction.

P5 and S20 use uncached branch and catalog reads as well as uncached inventory and rate reads. Do not reuse M5's cached public composition getters. There is no `use cache`, cached availability tag, or inventory cache to invalidate. Route wrappers stay within D-10 and use promised route params, per the installed Next.js guide. Contracts remain Zod only; regenerate OpenAPI in each API task.

### Public limiter readiness

P5 is the first public route using the optional M4 limiter. Its current implementation documents approximate concurrent admission and missing expiry cleanup. T9 prepares this shared facility before P5 is exposed; it does not change staff sign in policy.

Use the existing `LoginThrottle` table and namespaced HMAC keys, with a public admission port that atomically checks and consumes a slot in one short transaction. The policy is 60 admissions in a 60 second window; the 61st returns 429 with the remaining window in `Retry-After`, including under a concurrent burst. The namespace is global to P5 per client, so changing branch does not reset the counter. Trust client address headers only under the existing trusted proxy configuration. When no trusted address is available, use one shared anonymous bucket instead of an unlimited bypass. This implementation choice was approved with the spec and does not change booking rules.

Reuse the table rather than create a new cache, Redis service, or in memory counter. Add bounded cleanup of expired public limiter rows under the availability namespace, retaining any row with an active window or lock. It must not delete staff account or sign in throttle rows. Approved invocation: `npm run throttles -- cleanup-public`, through `scripts/throttles.mts`, hourly from the existing app user's cron, with the same active release and environment loading as other maintenance scripts. No new secrets or environment variables are needed. Test cleanup against a competing admission so it cannot reset a live bucket.

### Authorization, audit, and lifecycle

Call `authorize` before data access. For explicit branch paths, `authorizeBranch` runs before reading that branch's data and returns 403 for an unassigned branch. For id based paths, check capability first, then do a lookup constrained to the caller's allowed branches; missing and inaccessible resources both return 404. Admin is all branch, Editor has none of these capabilities, Receptionist reads inventory and rates and manages blocks, Manager also manages units and rates within assignments. A branch id in a body never overrides resource ownership.

Lifecycle: units toggle active without deletion or movement; blocks transition active to cancelled with `cancelledAt` and `cancelledById`; periods toggle active, with reactivation subject to exclusion. Rates have no `kind` or offer precedence. Disabling or removing a current price never changes a future reservation snapshot. M6 tests resolver output immutability; it does not claim to test persisted reservation snapshots or staff overrides that arrive later.

Extend `AuditChanges` and entity types with explicit unit, block, base rate, and period events. Every successful state change appends within its write transaction. Rate changes include exact before and after amounts, currency, dates, label, and active state as applicable, with null before an initial creation. Period edits and deletes lock the period row before merging patches. An audit failure rolls back the resource write. Do not place arbitrary note bodies, request bodies, or Prisma rows in audit changes or logs.

Base rate writes serialize in the same audited `READ COMMITTED` transaction without taking `InventoryLock`. First attempt `INSERT ... ON CONFLICT ("roomTypeId") DO NOTHING RETURNING "roomTypeId"` with the validated incoming amount, currency, and updater, retaining whether this transaction inserted the row. Then read and lock only that `RoomBaseRate` row with `FOR UPDATE` in a separate statement. If the lookup joins `Room` to enforce branch scope, target the lock to the base rate alias only, never the listing row. The separate statement sees a competing insertion after it commits. A successful insert uses null as its audit before value; an existing row uses its locked current value before the update. Write the final value and audit before commit. A rolled back competing insert does not leave a phantom predecessor. This protocol handles both first creation and later updates without locking a missing row or using the inventory lock.

This milestone adds no guest or payment personal data and sends no messages. Audit access and retention follow existing project policy. No provider configuration or real credentials are required.

### Value sourcing

| Action or output | Source |
| --- | --- |
| Public branch identity, status, zone, listing publication and public facts | Server lookup of path `branchSlug`, then catalog rows filtered by its resolved id; existing M5 public summary mapper |
| S20 listing membership and order | Every `Room` owned by the requested branch, across all three publication statuses, ordered by `sortOrder` then `id`; no public publication filter |
| Staff ownership and permissions | Request resolved `StaffPrincipal`, assignments reloaded by the existing session resolver, explicit branch path or scoped resource lookup |
| Dates, occupancy, quantity | Strict query or body fields; omitted P5 quantity becomes 1 under Q-68 |
| Branch today and audit times | Injected `Clock`, branch IANA zone for today; UTC instants for audit |
| Stay bounds and disclosure cap | Q-09 application policy and Q-69 maximum 5, passed from composition |
| Grid capacity and blocked | Active physical units of the branch and listing, and uncancelled blocks covering each night |
| Sold and assignment checks | `ReservationConsumptionReader`; empty collections in M6, not fabricated reservation records |
| Free, available quantity, first conflict night | Pure calculation from complete ordered nightly inventory and projected mutation |
| Night price, source, period id, label | Matching active `RatePeriod`, else `RoomBaseRate`, else explicit unpriced result |
| Accommodation total and currency | Integer sum of resolved nights times requested quantity, USD from validated rates |
| Unit, block, and period DTO attributes | Persisted record fields in the data model; ids from `IdGenerator`, actor from staff, timestamps from clock |
| Rate or inventory before and after audit | Transactionally reloaded current state and actual resulting persisted state, not the client's version of the old record |
| Grid `lastSyncCheckpoint` | `LastSyncCheckpointReader`, null in M6 because checkpoint persistence belongs to M8 |
| Rate limiting and retry delay | HMAC of trusted client address or shared anonymous bucket, persisted counter window, injected clock |
| Inventory lock timeout retry delay | Existing HTTP problem serializer's fixed five second default for 503 responses, emitted as `Retry-After: 5` |
| Worked example | Explicit illustrative 6000 and 7000 cent period fixtures; never production hotel prices |

### Seed and migration handling

The normal seed records that inventory and rates need approved data and creates no invented units or prices. Extend the one seed's demo step in `prisma/seed/demo.ts` only, behind both existing production guards. For the fictional `demo-giza` listings, add 2 to 4 units, a base rate, and one labelled date period per listing. No invented inventory or prices are added to New Cairo.

The current demo function returns early when the branch already exists. Add a separate idempotent M6 demo substep that also runs for an existing demo branch. Stable identities prevent duplicate periods or relabelling units; reruns preserve staff edits, cancellations, inactive units, and inactive periods. Test fresh, repeated, and upgraded demo runs, and production refusal before any write. Actual hotel unit numbers remain client data for launch (Q-23).

The illustrative 2026 September dates are already in the past on the date this spec is written. Unit and direct handler tests inject an appropriate clock; live API evidence translates both periods and the stay together to future dates, retaining two nights at 6000 and two at 7000. Do not weaken AV-5 to reproduce the example.

### Critical test scenarios and evidence

| Coverage | Required proof |
| --- | --- |
| AC-1, AC-3 | T-DATE-1 through T-DATE-8, T-AV-1 through T-AV-6, and applicable T-PR cases: leap dates, adjacency, partial and contained overlap, 30 versus 31 nights, 540 versus 541 days, Cairo DST, quantity and safe money arithmetic. Worked example in domain and P5. |
| AC-2, AC-3 | Real PostgreSQL rejects active overlapping periods and blocks, invalid or zero length ranges, nonpositive amounts, and cross branch FKs. Adjacent ranges and overlapping inactive or cancelled records are allowed. Concurrent period writes have one valid result and no partial audit. |
| AC-4, AC-5 | Guard tests inject sold and assigned contributions to refuse overselling and blocked assignments, including a future sold night beyond the search horizon. A very long block with sparse consumption checks only the supplied consuming dates and intersecting assignment ranges, without iterating empty dates. Real unit of work tests prove one connection, fresh reads after lock acquisition, timeout mapping, and rollback of writes and audit on failure. |
| AC-5 | C-4 adapted to same unit block versus block, and extension into a competing block. Separate clients, synchronized start, 20 iterations each; exactly one conflicting block succeeds and final ranges do not overlap. |
| AC-5 | Block versus deactivation and competing deactivations, 20 iterations each. With M6 sold zero, both block and deactivation may validly succeed; assert final capacity and free never become negative. Also prove both reduction entry points wait behind a held listing lock. Do not assert an invented one winner rule for capacity going from 1 to 0 with no sales. |
| AC-5 | C-8, 20 iterations: two branches with matching listing names and unit labels, writes in B, A's rows and nightly counts unchanged. Wrong branch ids fail at both application and database boundaries. |
| AC-6, AC-8 | S20 includes draft, published, and archived listings in stable order, including listings with no active units and every requested grid night with zero counts. P5 excludes unpublished listings and inactive branches; missing one night's price yields null total and `UNPRICED`. Also cover quantity 5 cap, occupancy, online booking disabled search, no internal fields, and no cached branch or inventory result. |
| AC-7 | Extend authorization sweep across every staff use case and role, including no assignments. Route tests for 401, 403, hidden 404, CSRF, strict fields, audit before and after values, and rollback when audit append fails. Race first base rate writes on separate clients: one committed creation has null before, later writes record their locked predecessor, and a rolled back creation leaves no row or audit. Prove base writes do not take the listing inventory lock. |
| AC-8 | Limiter boundary at 60 and 61, window expiry, concurrent burst, shared anonymous fallback, namespace isolation, safe cleanup, and unchanged staff sign in behavior. |
| All API criteria | T-HTTP for success and failure statuses, safe problem context, lock timeout `503 TRY_AGAIN` with exactly `Retry-After: 5`, promised params, 204 empty body, and OpenAPI freshness. Chromium API request tests cover the new routes; no staff or booking screens are prebuilt. |

T-DB-3 through T-DB-5 and T-PR-1 through T-PR-6 are grouped identifiers in the older matrix. In M6, assignment exclusions, persisted reservation snapshot immutability, and staff override authorization remain explicitly deferred to M8 rather than represented as passing M6 tests. Update the matrix with that distinction when the relevant task ships.

The concurrency harness lives in `tests/integration/reservations/`, creates independent Prisma clients with UTC connection options, and closes all clients. Use barriers and observable lock waits, not sleeps as evidence that transactions overlapped. Do not run database resets while a competing client is active. Assert responses, resource state, and audit state after every run. Use the existing test database name safety checks.

Capture `EXPLAIN (ANALYZE, BUFFERS)` for the capacity query on demo data and for the real sold query when it arrives in M8. M6 records the empty consumption adapter and explicitly says there is no reservation query plan yet. Evidence also includes the 20 iteration output, rate constraint response, safe public worked example response, and migration rehearsal with no drift. Report in `docs/delivery/reports/m6-inventory-and-availability.md` as work is accepted; do not create a report claiming implementation at milestone open.

Spec cross check, 2026-11-08: an independent read by `gpt-6-astra` found four decision gaps. The owner approved the insert then base row lock protocol, sparse block validation, all status staff grid membership, and the existing five second 503 retry default. Those corrections are recorded above. The reviewer has not rechecked the amended text. The owner subsequently approved the amended spec and ten task breakdown on 2026-11-08. That approval does not start an application task or accept the completed milestone.

M6-T8 implementation notes, 2026-11-10: the read use cases use three narrow ports (`AvailabilityCatalog`, `LastSyncCheckpointReader`, `RateBatchReader`) rather than extending the write repositories. A listing deleted between the listing read and the inventory read is retried once. The grid fails loudly when sold exceeds capacity. The cap of 5 is the domain constant `MAX_UNITS_REQUESTED`, not composition configuration.

## Build plan

The [brief task table](../delivery/milestones/m6-inventory-and-availability.md#task-breakdown) is the only task status tracker. Approved opening refinements split the original T5 into units and blocks, move rates and later tasks accordingly, and separate limiter readiness from its first public consumer. All tasks remain Not started until their own plan is approved.

| Order and id | Responsibility and expected files | Dependencies | Risk | Acceptance and tests |
| --- | --- | --- | --- | --- |
| 1. M6-T1 | Date, stay, occupancy, money in `src/domain/shared/`; unit tests under `tests/unit/domain/` | None | Critical | AC-3, foundations for AC-1; T-DATE, occupancy and money boundaries |
| 2. M6-T2 | Pure availability, projected reduction, nightly price rules and module public exports in `src/domain/inventory/`, `src/domain/pricing/` | T1 | Critical | AC-1, AC-3, AC-4, AC-6; T-AV and applicable T-PR |
| 3. M6-T3 | Four schema models and migration, schema allowlist and drift test, single seed demo extension and `tests/integration/seed.test.ts`, topic data model update | None; execute after T2 in the serial workflow | Critical | AC-2, AC-3, AC-6; T-DB constraints, migration rehearsal, seed safety |
| 4. M6-T4 | Unit of work port and adapter, inventory read and consumption ports, capacity reader, sorted lock, guard, safe result context and problem mapping, separate client harness | T2, T3 | Critical | AC-4, AC-5, AC-6; rollback, lock order, wait and timeout tests |
| 5. M6-T5 | Physical unit repository, scoped catalog bridge, `ManagePhysicalRooms`, composition and S21 through S23 contracts, DTOs and handlers | T4 | Critical | AC-4, AC-5, AC-6; T-INV deactivation, audit, authorization and HTTP |
| 6. M6-T6 | Block repository, `CreateBlock`, `UpdateBlock`, `CancelBlock`, composition and S24 through S27, block concurrency cases | T4, T5 | Critical | AC-3, AC-4, AC-5; T-INV, adapted C-4 and C-8, 20 iterations |
| 7. M6-T7 | Rate repository, coherent audited `ManageRates`, `GetRateCalendar`, composition and S30 through S34 | T2, T3, T4 | Critical | AC-1, AC-2, AC-7; rate exclusion, audit rollback, authorization, HTTP |
| 8. M6-T8 | `SearchAvailability`, `GetAvailabilityGrid`, null checkpoint adapter, composition and S20 | T5, T6, T7 | Critical | AC-1, AC-5, AC-6, AC-8; complete dates, quantity, isolation and grid |
| 9. M6-T9 | Public limiter admission and expiry lifecycle using existing throttle storage, isolated cleanup command and operational documentation | M4 limiter, no M6 task dependency; execute here before P5 | Medium | AC-8 public endpoint protection; concurrent limit, fallback, cleanup, sign in regression |
| 10. M6-T10 | P5 contracts, DTO, thin handler and composition using uncached search, public disclosure and worked example evidence | T8, T9 | Critical | AC-1, AC-6, AC-8; T-HTTP, 429, no caching, public field allowlist |

Original to refined mapping: T1 through T4 unchanged; original T5 becomes T5 and T6; original T6 becomes T7; original T7 becomes T8; original T8 becomes T9 and T10. Availability reads are Critical because they compute inventory, branch scope, and money, even though they do not lock or write. T9 is Medium only while it leaves staff sign in semantics untouched; changing those semantics requires a new approved plan and Critical risk.

Per task, use [quality gates](../testing/quality-gates.md#gates-per-task): format, lint, typecheck, unit, and integration for these domain or backend changes; build for Critical tasks; drift for T3; the standalone concurrency suite with 20 iterations for locking or inventory changes; build and Chromium E2E whenever routes change. The standalone command must use the integration configuration, for example `npm run test:integration -- tests/integration/reservations/concurrency.test.ts`. Milestone close runs all gates on the final tree. Record commands and exact results only after running them.

Each task has a separate task card, approved plan, implementation, verification, independent review on another model, and Engineering Review Package with critical paths and edge cases. Acceptance authorizes that task's docs sync and commit, never the next task. This spec and task approval do not authorize application code.

## Consequences

The same inventory arithmetic supports rooms and apartments, staff reads, public reads, and future bookings. Database constraints protect branch ownership and overlapping intervals even if application validation misses a race. The existing dependency and HTTP boundaries remain intact.

Costs are short periods of per listing write contention, more integration tests, and transaction context wiring. A deactivation has to inspect all consuming future dates; it cannot rely on a public horizon shortcut. Concurrent reads may be stale immediately after returning, so future creation still rechecks under the lock. Count based availability can admit stays that need physical reassignment because of fragmentation, as ADR 016 already records.

M6 cannot prove concurrency against real sold reservations or produce their SQL query plan, since those tables arrive in M8. The injected consumption tests and lock tests are necessary M6 evidence, not a substitute for M8's real booking races. There are no new external services, secrets, or payment operations.

## Follow-up

1. Spec and refined task table approved by the owner, 2026-11-08. M6-T1 and M6-T2 accepted on the same date. M6-T3 remains unstarted and needs a separately requested task card and owner approval before code. The owner requested a stop after the T2 commit.
2. T3: reconcile the schema refinements and demo upgrade behavior in database documentation and tests. T5 through T10: update API contracts and OpenAPI as endpoints ship; keep planned versus implemented labels accurate.
3. M7: consume nightly rates without changing PR-3; add services, coupons, and VAT only in that milestone.
4. M8: replace empty consumption and checkpoint adapters, add assignment constraints, true booking races and sold query plans, and enforce maximum 5 across all booking lines. Add persisted snapshot and override tests then.
5. Before public exposure: rehearse the trusted proxy and limiter cleanup configuration; confirm the accepted pre M6 seed repair gate is still included in the deployed tree.
6. At milestone acceptance, `/sync` adds `tests/integration/reservations/AGENTS.md` and a sibling `CLAUDE.md` with concurrency conventions. It may reconcile stale dependency versions in root context; this planning change does not edit curated `AGENTS.md`.

## References

Project sources used for the decisions above:

1. [M6 brief](../delivery/milestones/m6-inventory-and-availability.md), [agent workflow](../engineering/agent-workflow.md), and [pre M6 gate](../delivery/milestones/repairs/pre-m6.md).
2. [ADR 015](../adr/015-reservation-module-structure.md) for modules and unit of work; [ADR 016](../adr/016-inventory-and-concurrency.md) for lock plus count; [ADR 017](../adr/017-multi-branch-data-ownership.md) and [ADR 018](../adr/018-staff-roles-and-branch-scope.md) for ownership and authorization.
3. [ADR 020](../adr/020-dates-timezones-money.md), as amended by [ADR 027](../adr/027-booking-price-composition.md), for dates, USD cents, and the date price portion of composition. The later approved VAT decision overrides ADR 020's historical undecided tax wording.
4. [ADR 021](../adr/021-reservation-testing-strategy.md) and [ADR 022](../adr/022-deployment-transaction-compatibility.md) for real database proof and transaction compatibility.
5. [Availability and pricing rules](../domain/availability-and-pricing-rules.md), [decision register](../requirements/assumptions-and-open-questions.md), [data model](../database/data-model.md), and [integrity and concurrency](../database/integrity-and-concurrency.md).
6. [Dependency rules](../architecture/dependency-rules.md), [engineering standards](../engineering/engineering-standards.md), [API contracts](../api/api-contracts.md), [REST conventions](../api/rest-api-conventions.md), [error model](../api/error-model.md), and [role matrix](../requirements/user-roles-and-permissions.md).
7. [Test matrix](../testing/test-matrix.md), [quality gates](../testing/quality-gates.md), [seed policy](../database/migrations-and-seeding.md), and specs [0001](./0001-m4-backend-foundations.md) and [0002](./0002-m5-branch-websites.md) as foundation context.
8. Local framework reference: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. Existing integration points: `src/application/shared/result.ts`, `src/application/shared/rate-limit.ts`, `src/application/audit/ports.ts`, `src/infrastructure/db/prisma/transaction.ts`, `src/app/api/v1/_http/`, `tests/support/reservation-models.ts`, and `prisma/seed/`.
