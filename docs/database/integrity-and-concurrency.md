# Data integrity and concurrency

Status: **Planned**, design accepted 2026-10-24 (ADR 016, ADR 022). This document specifies how overselling is prevented and how that is proven.

## Threats to consistency

| Scenario | Without protection | Protection |
| --- | --- | --- |
| Two guests book the last unit at the same instant | Both read `free = 1`, both insert, so it is oversold | Room-type row lock serializes them; the second sees `free = 0` and gets `409` |
| A receptionist records an external reservation while a guest books online | Same race | Same lock: every inventory writer takes it |
| Staff add a maintenance block while a booking is in flight | Block makes capacity smaller than sold | Block creation takes the lock and checks `free ≥ 1` per night for the unit's type; otherwise `409` |
| A physical room is deactivated with future sold nights | Same | Same check under lock |
| Two receptionists assign the same room to overlapping stays | Double occupancy | Exclusion constraint (DB-3), returns `409 ROOM_ALREADY_ASSIGNED` |
| A modification moves a stay to another room type | Both types change | Lock both types in id order; check new type; release old |
| A browser retries a timed-out POST | Duplicate reservation | Idempotency key (unique) |
| Two staff edit one reservation | Lost update | `version` column; `If-Match` / `expectedVersion`; `412` on mismatch |
| A cron job and a request process the same outbox row | Double email | `SELECT … FOR UPDATE SKIP LOCKED` claim with an `attempts` increment |
| More than one Node process (Passenger) | In-memory locks useless | All coordination in PostgreSQL |

## The booking transaction

Pseudocode of the infrastructure-facing steps. Decisions are made in domain code: `AvailabilityCalculator`, `PriceResolver`, and `ReservationStateMachine`.

```text
unitOfWork.transaction(async (tx) => {
  existing = tx.reservations.findByIdempotencyKey(scope, keyHash)
  if existing: return replay(existing, fingerprint)          // 200 or 422

  tx.inventoryLock.lockRoomTypes(branchId, [roomTypeId])     // SELECT … ORDER BY id FOR NO KEY UPDATE
  roomType = tx.catalog.bookableRoomType(branchId, roomTypeId)  // published, branch active
  capacity = tx.inventory.capacityByNight(branchId, roomTypeId, stay)
  sold     = tx.inventory.soldByNight(branchId, roomTypeId, stay)
  decision = AvailabilityCalculator.check(stay, capacity, sold, quantity = 1)
  if !decision.available: return failure(INVENTORY_UNAVAILABLE, decision.firstFullNight)

  nights = PriceResolver.resolve(stay, tx.rates.for(roomTypeId, stay))
  if total(nights) != command.expectedTotalMinor: return failure(PRICE_CHANGED, quote)

  reservation = Reservation.createPending(…)                 // domain invariants
  tx.reservations.insert(reservation)                        // reservation + line + nights
  tx.audit.append(…); tx.outbox.enqueue(…)
})
// after commit: outbox dispatcher (no network I/O inside the transaction)
```

Isolation level is `READ COMMITTED`, the default. Because each statement in `READ COMMITTED` takes a new snapshot, the counts read after the lock is granted include every competing booking that committed while this transaction waited.

## SQL shapes (indicative)

```sql
-- capacity per night for one room type
SELECT d::date AS night,
       count(p.id) FILTER (WHERE b.id IS NULL) AS capacity
FROM generate_series($checkIn::date, $checkOut::date - 1, interval '1 day') d
CROSS JOIN "PhysicalRoom" p
LEFT JOIN "InventoryBlock" b
  ON b."physicalRoomId" = p.id AND b."cancelledAt" IS NULL
 AND d::date >= b."startDate" AND d::date < b."endDate"
WHERE p."roomTypeId" = $roomTypeId AND p."branchId" = $branchId AND p.active
GROUP BY d ORDER BY d;

-- sold per night
SELECT n.night, count(*) AS sold
FROM "ReservationNight" n
JOIN "ReservationRoom" l ON l.id = n."reservationRoomId"
WHERE l."roomTypeId" = $roomTypeId AND l."branchId" = $branchId AND l."consumesInventory"
  AND n.night >= $checkIn AND n.night < $checkOut
GROUP BY n.night;
```

Raw SQL is parameterized through Prisma's tagged `$queryRaw` and lives only in `src/infrastructure/db/prisma/repositories/reservations/`.

## Lock discipline

1. Lock order: room-type ids sorted ascending. A single transaction never locks a lower id after a higher one.
2. Lock scope: only availability-reducing writes take the lock.
3. Lock duration: from the lock statement to commit. There is no I/O to email, external services, or the filesystem in between.
4. Lock timeout: `SET LOCAL lock_timeout = '5s'`. On timeout the request fails with `503 TRY_AGAIN` rather than piling up.
5. Read paths (public availability search, staff grid) take no locks. They can show availability that is gone a millisecond later, which is acceptable because creation re-checks.

## Proof plan (integration tests on real PostgreSQL)

| Test | Setup | Action | Expected |
| --- | --- | --- | --- |
| C-1 last unit | 1 physical room, free | 10 parallel creates on 10 separate clients | Exactly 1 × `201`, 9 × `INVENTORY_UNAVAILABLE`; 1 inventory-consuming line in the DB |
| C-2 partial overlap | 1 room; stays A `[10,13)`, B `[12,15)` | Parallel | Exactly one succeeds |
| C-3 adjacency | 1 room; `[10,12)` and `[12,14)` | Parallel | Both succeed |
| C-4 block versus booking | 1 room | Block `[10,12)` racing a booking `[11,13)` | Exactly one succeeds |
| C-5 external versus website | 1 room | `EXTERNAL` record racing `WEBSITE` create | Exactly one succeeds; the loser's error names the conflict |
| C-6 cancellation releases | Sold out | Cancel, then create | Create succeeds |
| C-7 double assignment | 2 lines, 1 room | Parallel assign | One `409 ROOM_ALREADY_ASSIGNED` |
| C-8 branch isolation | Branch A sold out, branch B free (same names) | Create in B | Succeeds; A's counts unchanged |
| C-9 idempotent retry | — | Same key ×5 in parallel | One reservation; all responses carry its reference |
| C-10 modification type switch | Type X full, type Y free | Move X→Y while another books Y's last unit | No oversell in Y |

Each test repeats (for example 20 iterations) and asserts the final database state.
