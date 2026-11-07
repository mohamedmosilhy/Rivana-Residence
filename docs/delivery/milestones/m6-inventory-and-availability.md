# M6 — Inventory, date prices, and availability

Status: **Not started.** Branch: `m6-inventory-and-availability`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Correct availability and nightly accommodation prices for every listing (room or apartment), computed on the server, branch-scoped, and **provably safe under concurrency** for every write that reduces availability.

## Read first

- ADRs [016](../../adr/016-inventory-and-concurrency.md), [020](../../adr/020-dates-timezones-money.md), [021](../../adr/021-reservation-testing-strategy.md), [022](../../adr/022-deployment-transaction-compatibility.md), [027](../../adr/027-booking-price-composition.md) (date prices only)
- [domain/availability-and-pricing-rules.md](../../domain/availability-and-pricing-rules.md) (AV, OC, IN, PR-1…6)
- [database/integrity-and-concurrency.md](../../database/integrity-and-concurrency.md), [database/data-model.md](../../database/data-model.md) (`PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod`)
- [api/api-contracts.md](../../api/api-contracts.md) (P5, S20–S27, S30–S34)

## Blocking questions

- Q-09 (stay rules) and Q-17 (forced blocks): recommendations accepted unless the client answers differently. Check-in time per branch is required data (it defines the cancellation deadline in M9).

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE` for the inventory and pricing modules) | Lock helper design, SQL shapes, exclusion constraints |
| Build | `/develop` (logic track) | Domain first (pure), then repositories with raw SQL, then API |
| Tests | `/test` | Concurrency harness with separate Prisma clients; 20 iterations |
| Failures | `/debug` | Flaky concurrency tests are bugs until proven otherwise |
| Proof | `/check verify` | Run the worked example through the API; race two blocks by hand |
| Review | `/check review` | Focus: every availability-reducing path takes the lock; no `$queryRawUnsafe` |
| After merge | `/sync` | Create `tests/integration/reservations/AGENTS.md` (concurrency test conventions) with `CLAUDE.md` |

## In scope

Value objects, availability arithmetic, physical units, blocks, base rates and date periods (one kind), the inventory lock and unit of work, availability API, staff grid API, rate API, concurrency tests for blocks and branch isolation.

## Out of scope (binding)

- Services, coupons, VAT, the full booking quote (M7).
- Reservations (M8). `sold` counts are zero until M8; the read model already reads reservation lines through a port that returns none.
- Staff screens (M11, M12).

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M6-T1 | Date, stay, occupancy, and money value objects (`src/domain/shared`) | Critical | — | AC 3; T-DATE-1…8 | Not started |
| M6-T2 | Availability, nightly price, and block rules (pure domain) | Critical | T1 | AC 1 (resolver), 3, 6; T-AV-1…6, T-PR-1…6 | Not started |
| M6-T3 | Migration `inventory_and_rates`: tables, checks, exclusion constraints, demo seed | Critical | — | AC 2, 3; T-DB-3…5; drift check | Not started |
| M6-T4 | Unit of work, `InventoryLock`, `InventoryGuard`, concurrency test harness | Critical | T2, T3 | AC 5 (harness) | Not started |
| M6-T5 | Physical units and blocks: repositories, use cases, staff API S21–S27 | Critical | T4 | AC 4, 5; T-INV, C-4, C-8, T-HTTP | Not started |
| M6-T6 | Base rates and date periods: repositories, audited use cases, staff API S30–S34 | Critical | T2, T3 | AC 2, 7; rate API with audit | Not started |
| M6-T7 | Availability read model and staff grid: `SearchAvailability`, `GetAvailabilityGrid`, API S20 | Medium | T5, T6 | AC 6 | Not started |
| M6-T8 | Public availability API P5: rate limit, no caching, minimal disclosure | Medium | T7 | AC 1 (API), 8; T-HTTP | Not started |

## Tasks

### 1. Domain (`src/domain/shared`, `src/domain/inventory`, `src/domain/pricing`)

1. `LocalDate` (parse, compare, add days, format; rejects impossible dates), `StayRange` (nights, overlap AV-3, length and horizon limits AV-6/7), `Occupancy`, `Money` (integer cents, same-currency addition).
2. `AvailabilityCalculator`: given capacity and sold per night and a requested quantity, returns available or the first full night (IN-1…6).
3. `NightlyPriceResolver` (PR-3): a night inside an active period takes the period's amount, otherwise the base rate, otherwise unpriced.
4. Rules for blocks (IN-6, IN-7) and unit deactivation as pure checks.

### 2. Database (migration `inventory_and_rates`)

1. `CREATE EXTENSION IF NOT EXISTS btree_gist`.
2. `PhysicalRoom` (units of rooms and apartments; label unique per branch; composite FK to `Room(id, branchId)`), `InventoryBlock`, `RoomBaseRate`, `RatePeriod` (no `kind` column; label optional; `active`).
3. Checks and exclusion constraints: `InventoryBlock_no_overlap`, `RatePeriod_no_overlap` (listing + daterange, active only), amount checks.
4. Indexes as in the data model.

### 3. Application and infrastructure

1. Ports: `ReservationUnitOfWork` (transaction binding), `InventoryLock.lockRoomTypes(branchId, ids)` (`SELECT … ORDER BY id FOR NO KEY UPDATE`, `SET LOCAL lock_timeout = '5s'`), `InventoryReader` (capacity and sold per night), `RateRepository`, `PhysicalRoomRepository`, `BlockRepository`.
2. `InventoryGuard` application service: the only path for availability-reducing writes (block create or extend, unit deactivation; reservation writes in M8 and M9).
3. Use cases: `SearchAvailability` (branch, stay, occupancy, units requested per listing), `GetAvailabilityGrid`, `ManagePhysicalRooms`, `CreateBlock`, `UpdateBlock`, `CancelBlock`, `ManageRates` (base rate, create, update, deactivate periods), `GetRateCalendar`.
4. Prisma repositories with tagged `$queryRaw` in `src/infrastructure/db/prisma/repositories/{inventory,pricing}/`; the SQL shapes in integrity-and-concurrency.

### 4. API

- Public: API-P5 availability (no lock; rate-limited 60/min/client; validation per AV and OC; results per published listing of the branch with availability for the requested unit count and the accommodation price before VAT, or a reason `SOLD_OUT`, `OCCUPANCY`, `UNPRICED`).
- Staff: API-S20 grid, S21–S23 units, S24–S27 blocks, S30–S34 rates. All audited where they mutate.

## Database impact

One migration, additive. Demo seed extended: 2–4 units per listing, base rates, one date period per listing.

## API impact

P5, S20–S27, S30–S34.

## Acceptance criteria

1. The worked example (two periods, four nights) prices to **$260.00** through `NightlyPriceResolver` and through API-P5.
2. Overlapping active date periods for one listing are refused (`409`) by the database constraint and reported as a field error.
3. Back-to-back stays and blocks do not overlap; partial overlaps do (AV-3).
4. A block that would make sold exceed capacity on any night is refused with `409 INVENTORY_UNAVAILABLE` naming the night (Q-17); overlapping blocks on one unit are refused.
5. Concurrency: a block racing another block or a unit deactivation for the last free unit never oversells (C-4 with blocks only until M8), and branch A's counts never change when branch B is written (C-8).
6. A listing with no active unit or an unpriced night is reported `UNPRICED` or unavailable, never with an invented price.
7. Receptionists can read rates but cannot change them; Managers change rates only for their branches; every rate change is audited with before and after values.
8. Availability responses are never cached and contain no unit labels or counts beyond availability for the requested quantity.

## Tests

- Unit: T-DATE-1…8, T-AV-1…6, T-PR-1…6.
- Integration: T-INV-1…6, T-DB-3…5 (exclusion and check constraints), rate API with audit, T-HTTP for the new routes.
- Concurrency: C-4 (block vs block for this milestone; extended to bookings in M8), C-8; 20 iterations each.

## Evidence for the report

Query plans (`EXPLAIN ANALYZE`) for capacity and sold queries on demo data; concurrency run output (20× green); the worked example response.

## Risks

- Lock contention: measure; the lock scope is one listing.
- `btree_gist` unavailable on the production database: fallback documented in ADR 022.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M7 has not started.
