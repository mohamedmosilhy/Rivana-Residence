# Data integrity and concurrency

Status: **Partly implemented**, design accepted 2026-10-24 (ADR 016, ADR 022), extended 2026-11-06 for several units per booking, payment holds, late payment results, and coupon limits (ADR 024, 025, 027). M6-T3 implements the inventory constraints and M6-T4 implements the shared transaction, listing lock, capacity read, and guard foundation. M6-T5 adds the first production writer, guarded unit deactivation (S23). M6-T6 adds block create and end date changes (S25, S26) through the same guard; block cancellation and note edits take only the block row lock. M6-T7 adds base rate and rate period writers (S31 to S34): the base rate uses insert, then `FOR UPDATE` on the base row; a period write sets a five second lock timeout and relies on the exclusion constraint, mapping `23P01` and `40P01` to a safe conflict. Rate writes never take the listing lock. M8-T1 implements the reservation storage constraints: composite ownership FKs, physical assignment exclusion, complete price snapshots, reference and external-reference uniqueness, and partial `NULLS NOT DISTINCT` idempotency uniqueness. Storage tests include 20 observed waits each for overlapping assignments and duplicate keys. Other concrete inventory and reservation writers remain planned; these storage races do not prove the booking transaction or coupon-limit workflows.

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
| Two guests use the last redemption of a limited coupon | Limit exceeded | Booking transaction locks the coupon row (`FOR UPDATE`) and counts unreleased redemptions before inserting |
| A guest abandons the payment page | Units held forever | `holdExpiresAt`; expiry job every minute; any booking for the same listing expires overdue holds under the lock first |
| payment success arrives after the hold expired and the unit was resold | Oversell, or a charge with no room | Late success re-locks the listings and re-checks; if not free, automatic refund (PY-5) |
| The payment gateway sends the same callback twice, or two callbacks race | Double confirmation or double message | Unique `providerEventId`; reservation row `FOR UPDATE`; transitions only from `AWAITING_PAYMENT` |
| Hold expiry job and a success callback race | Confirmed after release, or released after confirmation | Both lock the reservation row; whichever commits first wins; the other sees the new status and follows PY-5 |
| A booking with several units needs two listings | Partial booking | All listings locked in id order in one transaction; all units checked before any insert |
| More than one Node process (deploy overlap, restarts, a later second instance) | In-memory locks useless | All coordination in PostgreSQL |

**Change requests (M9-T11).** Submission that only creates a request takes the guest lock and reservation lock. It checks both request types under the reservation lock. Approval and immediate changes take the guest lock, listing locks in ID order, and reservation lock. On a failed approval recheck, the conflict commits before the error is returned.

## The booking transaction

Pseudocode of the infrastructure-facing steps. Decisions are made in domain code: `AvailabilityCalculator`, `PriceResolver`, and `ReservationStateMachine`.

```text
unitOfWork.transaction(async (tx) => {
  existing = tx.reservations.findByIdempotencyKey(scope, keyHash)
  if existing: return replay(existing, fingerprint)          // 200 or 422

  tx.verifications.consume(token, phone); guard not blocked; guard per-phone caps (Q-60)
  listingIds = sorted(unique(command.lines.map(l => l.roomTypeId)))
  tx.inventoryLock.lockRoomTypes(branchId, listingIds)       // SELECT … ORDER BY id FOR NO KEY UPDATE
  tx.reservations.expireOverdueHolds(branchId, listingIds, now)   // PY-6
  for each listing: bookable? capacity & sold per night; AvailabilityCalculator.check(stay, capacity, sold, unitsRequested)
  if any unavailable: return failure(INVENTORY_UNAVAILABLE, firstFullNight)

  nights   = NightlyPriceResolver.resolve(stay, tx.rates.for(listingIds, stay))
  services = tx.services.active(branchId, command.services)
  coupon   = command.couponCode ? tx.coupons.lockForRedemption(code) : null   // SELECT … FOR UPDATE
  CouponPolicy.validate(coupon, counts read under that lock)  → failure(COUPON_INVALID, reason)
  quote    = QuoteCalculator.compute(nights, services, coupon, tx.settings.vatRate())
  if quote.total != command.expectedTotalMinor: return failure(PRICE_CHANGED, quote)

  reservation = method == PAY_AT_HOTEL
    ? Reservation.createConfirmed(…)                         // ADR 024
    : Reservation.createAwaitingPayment(…, holdExpiresAt = now + 15 min)   // ADR 025
  tx.reservations.insert(reservation)                        // reservation + lines + nights + services
  if coupon: tx.coupons.insertRedemption(…)
  tx.guests.upsertFromBooking(…); tx.audit.append(…)
  if reservation.status == CONFIRMED: tx.outbox.enqueue(confirmation email + WhatsApp, staff alert)
})
// after commit: outbox dispatcher; for ONLINE, PaymentGateway.createCheckout (no network I/O inside the transaction)
```

Payment callback (ADR 025):

```text
verified = gateway.verifyCallback(rawBody, headers)          // adapter checks the signature; reject otherwise
unitOfWork.transaction(async (tx) => {
  if !tx.paymentEvents.insertOnce(verified.eventId): return ok   // duplicate
  reservation = tx.reservations.findForUpdate(payment.reservationId)
  if verified.success and amount/currency match:
    if reservation.status == AWAITING_PAYMENT: confirm, outbox confirmations
    else if reservation.status == PAYMENT_FAILED (expired):  // late success, PY-5
      lock listings in id order; re-check availability
      free ? confirm (re-insert redemption if still within limits) : mark for automatic refund + staff alert
  else if reservation.status == AWAITING_PAYMENT: PAYMENT_FAILED, release lines and redemption
})
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

1. Lock order: **guest row, then room-type ids sorted ascending, then the coupon row, then reservation rows** (M8-T7, spec 0005 Decision 1). A single transaction never locks a lower id after a higher one, and the guest row comes first for every writer that takes it (website booking, phone verification confirmation, guest blocking, and staff and external creation from M8-T8): it serializes per phone caps and token use. Releases (cancellation, S55) take only the reservation row, and a stay change (M8-T9) takes the old and new listings sorted, then the reservation row, re-reading it, the availability and the prices after those locks (a coupon release sets `releasedAt` only where it is null, so it is idempotent); blocking a guest takes only the guest row. **Email verification (M9-T12a, ADR 031):** a code request takes the phone advisory lock, the guest row, then an email advisory lock (`verification-email:` namespace) before counting per phone and per email history; a booking with an email token takes the email advisory lock after the guest row and before the verification row, so bookings for one email from different phones are counted against the per email cap one at a time.
2. Lock scope: only availability-reducing writes take the lock (bookings, payment holds, late payment confirmations, stay changes, blocks, unit deactivation). The coupon row lock is taken after the listing locks, always in that order.
3. Lock duration: from the lock statement to commit. There is no I/O to email, external services, or the filesystem in between.
4. Lock timeout: `SET LOCAL lock_timeout = '5s'`. On timeout the request fails with `503 TRY_AGAIN` rather than piling up.
5. Read paths (public availability search, staff grid) take no locks. They can show availability that is gone a millisecond later, which is acceptable because creation re-checks.

**Implemented in M6-T4:** `PrismaReservationUnitOfWork` uses an explicit `READ COMMITTED` interactive transaction and rolls back both failed results and exceptions. `PrismaInventoryLock` deduplicates and sorts ids, applies the local five second timeout, locks the complete branch scoped listing set, and maps SQLSTATE `55P03` to `TRY_AGAIN`. `InventoryGuard` keeps load, validation, mutation, and audit in that transaction. Later writer tasks must compose their concrete ports through this guard.

**Implemented in M8-T7:** `InventoryGuard` accepts an optional `prepare` step that runs in the same transaction before the listing lock. `CreateWebsiteReservation` uses it for the idempotency lookup, the guest lock, a second idempotency lookup under that lock (C-9), token consumption and the per phone cap; a replay returns from `prepare` without locking any listing. The coupon row is locked after the listings, and the booking reads its quote through `QuoteBooking` built on that transaction's readers.

**Implemented in M8-T8.** Staff and external creation use the same guard and lock the guest before the listings. Staff pricing takes the coupon lock when applicable. When an insert loses a uniqueness race, the writer rolls back before checking for an actor and source scoped replay or a duplicate external reference in the branch.

**Implemented in M9-T4.** After locking the listings and the requested coupon, website, staff, and external booking creation locks the overdue reservations in ID order. It rechecks their state, releases inventory and coupon use, records expiry and queues the “payment not completed” notices before counting inventory. These writes roll back with the booking if it fails. Checkout creation runs after commit and its result is persisted under the reservation lock. The [last unit test](../../tests/integration/reservations/online-booking.test.ts) observed PostgreSQL lock waits in 20 rounds. The full C-14 job and callback race belongs to M9-T5 and T6.

## Proof plan (integration tests on real PostgreSQL)

**Implemented in M6-T3** (`tests/integration/inventory-constraints.test.ts`): the structural constraints (overlap exclusion for blocks and rate periods, ranges, positive USD amounts, branch-unique labels, composite ownership, `RESTRICT` deletes and moves) are tested directly on PostgreSQL, including 20 races per exclusion constraint on separate connections. Two uncommitted overlapping inserts wait on each other, so PostgreSQL ends the race as either the exclusion violation (`23P01`) or a detected deadlock (`40P01`); exactly one commits either way. Rate period creates take no lock in the current design, so overlapping period creates can still deadlock; M6-T7 must decide whether to map `40P01` to a conflict or lock the listing on period create. `RESTRICT` ownership violations report `23001`, not `23503`.

**Implemented in M6-T4** (`tests/integration/reservations/`): the reusable harness creates independent clients, coordinates overlap with barriers, and observes PostgreSQL lock waits. Twenty iterations prove deterministic reverse order lock requests do not deadlock, a waiter reads fresh committed state after acquiring the same listing lock, and another branch locks and commits independently. Unit of work tests prove one connection, `READ COMMITTED`, rollback of mutation and audit, hidden foreign listings, and real timeout mapping. Inventory reader tests prove complete zero capacity rows and fail closed consumption merging. Concrete C-1 through C-15 writer races remain in their owning later tasks.

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
| C-11 coupon limit | Coupon with 1 redemption left | 10 parallel bookings using it | Exactly 1 redemption; others `COUPON_INVALID` (`LIMIT_REACHED`) and nothing created |
| C-12 late payment success | Hold expired; unit resold | Success callback arrives | No oversell; reservation not confirmed; automatic refund requested; staff alert **Implemented (M9-T5)**: 20 observed lock-wait rounds in each order, with the refund request sent after commit. |
| C-13 duplicate callbacks | `AWAITING_PAYMENT` | Same verified callback ×5 in parallel | One `CONFIRMED` transition, one set of messages **Implemented (M9-T5)**: five parallel copies serialize on the reservation lock. |
| C-14 hold versus booking | Last unit held, hold just expired | Expiry job, a new booking, and a success callback race | Never more than one inventory-consuming reservation for the unit |
| C-15 multi-unit booking | Listing with 2 free units | Booking for 2 units racing a booking for 1 | Never more than 2 units sold; the losing request creates nothing |
| C-16 guest change versus booking *(implemented M9-T10, Q-84)* | Last free night of a listing | A guest change extending a stay onto it races a new booking for it | Exactly one succeeds; the losing change leaves the reservation unchanged (no history row, no outbox row) |
| C-VCH per email cap and limits *(implemented M9-T12a, ADR 031)* | One email with room for one more booking or code | Two bookings, or two code requests, for that email from different phones | One wins; the other gets `BOOKING_LIMIT_REACHED` or `RATE_LIMITED`. The second waits on the email advisory lock, observed in 20 rounds each. [Bookings](../../tests/integration/reservations/create-website-reservation.test.ts) · [Codes](../../tests/integration/reservations/phone-verification.test.ts) |
| C-17 change-request approval versus booking *(implemented M9-T11, Q-85)* | Paid booking with an open request needing the last unit | Approval races a new booking in both winner orders | One gets the room. A losing approval keeps the request `OPEN` and records `INVENTORY_UNAVAILABLE`. Separate clients observed 20 lock waits in each order. [Tests](../../tests/integration/reservations/change-requests.test.ts) |

Each test repeats (for example 20 iterations) and asserts the final database state.

M9-T1 verifies storage uniqueness independently of the payment and cancellation workflows. Each partial unique index is tested in 20 rounds. The test observes the second insert waiting on PostgreSQL and confirms that exactly one `INITIATED` payment or one `OPEN` cancellation request commits per reservation. [Storage tests](../../tests/integration/reservations/payment-storage.test.ts)

M9-T7 checks for active requests after locking the reservation. The write locks the guest first and checks the credential again after both locks. For a legacy booking with a phone and no linked profile, it first takes the same phone lock used by staff blocking, then locks any matching guest profile. Staff closure runs under the reservation lock so a request is either visible to the staff action and closed or refused after the staff action commits. The guest detail reader uses one database snapshot for the booking and request state. [Workflow tests](../../tests/integration/reservations/cancellation-requests.test.ts)
