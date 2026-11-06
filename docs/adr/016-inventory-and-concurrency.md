# ADR 016 — Room-type inventory with transaction-scoped locks

Status: **Accepted** (2026-10-24). **Extended by [ADR 025](./025-paymob-online-payment.md) and [ADR 027](./027-booking-price-composition.md) (2026-11-06):** payment holds (`AWAITING_PAYMENT`) consume inventory and are expired under the lock; the booking transaction also locks the coupon row. The lock-plus-count decision is unchanged.

## Context

Guests book a room type (for example "Studio with Balcony"), not a numbered room. The hotel later puts the guest in one of that type's physical rooms. Two guests can submit at the same moment for the last room. Staff also record external (PMS) reservations and maintenance blocks that consume the same inventory. Production runs on PostgreSQL 17+ (ADR 002, ADR 022). More than one Node process can be live at once (deploy overlap, restarts, a later second instance).

## Problem

How is availability counted, and how do we make "check then insert" safe under concurrency?

## Options considered

| Option | Correctness | Complexity | Notes |
| --- | --- | --- | --- |
| A. Check in application code, then insert | **Unsafe** | Low | Classic race; rejected |
| B. In-memory or process lock | **Unsafe** with more than one process | Low | Rejected |
| C. `SERIALIZABLE` transactions with retry | Safe | Medium | Needs retry loops on SQLSTATE `40001` around every inventory writer; retries can surprise users |
| D. Per-night counter table (`sold <= capacity` CHECK, conditional `UPDATE`) | Safe | High | A second, derived copy of inventory that every unit, block, and status change must keep exact |
| E. Assign a physical room at booking time and add a GiST exclusion constraint | Safe for units | Medium | Database proves no double-assignment. But fragmentation can reject stays a count would accept, and room-type-level holds become awkward |
| F. **Lock the room-type row** (`SELECT … FOR NO KEY UPDATE`) in a `READ COMMITTED` transaction, then count and insert | Safe | Low to medium | Serializes inventory writers per room type; contention is tiny at this hotel's scale |

## Decision

**F for room-type inventory, plus E's exclusion constraint for optional physical-room assignment.**

1. The **inventory unit is a room type at a branch**. For each night, capacity is the type's active physical rooms minus those blocked that night. Sold is the number of inventory-consuming reservation room lines covering that night. A stay is available when `capacity − sold ≥ requested` for every night in `[checkIn, checkOut)`.
2. Every operation that can reduce availability runs in one transaction:
   - create a reservation (website, staff, external);
   - change a reservation's dates or room type;
   - reinstate a released reservation, if that is ever approved;
   - add a block;
   - deactivate a physical room.

   Each such operation first locks the affected room-type rows with `SELECT id FROM "Room" WHERE id = ANY($1) ORDER BY id FOR NO KEY UPDATE`. Locking in id order prevents deadlocks. `NO KEY UPDATE` does not conflict with the `KEY SHARE` locks that foreign-key inserts take. It then counts, decides in domain code, writes, and commits.
3. `READ COMMITTED` is sufficient. Once the lock is held, each later statement takes a fresh snapshot that includes every committed competing booking.
4. Releasing inventory (cancel, decline, no-show, early check-out) needs no lock.
5. Physical-room assignment (at confirmation or check-in) is optional at booking. An exclusion constraint prevents assigning one unit to overlapping stays: `EXCLUDE USING gist ("physicalRoomId" WITH =, daterange("checkIn","checkOut",'[)') WITH &&) WHERE ("physicalRoomId" IS NOT NULL AND "consumesInventory")`. It needs the `btree_gist` extension. Blocks on one unit cannot overlap either.
6. A conflict returns `409` with code `INVENTORY_UNAVAILABLE`. There is no automatic retry, because the request is no longer satisfiable.

## Rationale

F is the simplest thing that is provably correct, and it keeps availability as a derived query over real rows rather than a second copy that can drift. The exclusion constraint makes the database itself guard the one place where a specific physical room matters.

## Consequences

- The proof is an integration test against real PostgreSQL that fires N parallel bookings for the last unit on separate connections and asserts exactly one success ([database/integrity-and-concurrency.md](../database/integrity-and-concurrency.md)).
- Count-based availability can accept a stay that no single physical room can hold end to end (fragmentation). Staff resolve it by reassigning rooms, and the assignment screen shows the conflict.
- CMS edits to a `Room` row briefly wait for, or delay, a booking of that room type. That is acceptable.

## Risks

- A future code path that reduces availability but forgets the lock. Mitigation: availability-reducing writes go through one `InventoryGuard` application service, and the integration tests cover each writer.
- The managed PostgreSQL provider might refuse `CREATE EXTENSION btree_gist`. Fallback: check assignment overlap under the same room-type lock (ADR 022).
