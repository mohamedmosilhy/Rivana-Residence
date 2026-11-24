# Reservation integration tests

Real PostgreSQL tests for reservation transaction boundaries, inventory reads, and concurrency. The governing design is [spec 0003](../../../docs/specs/0003-m6-inventory-and-availability.md), especially its transaction protocol and critical test scenarios.

## Commands

```bash
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration -- tests/integration/reservations
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration -- tests/integration/reservations/concurrency.test.ts
```

## Layout

- `reservation-repository.test.ts`, `guest-repository.test.ts`, `reservation-consumption.test.ts`: aggregate and guest persistence, protected fields, transaction rollback, and real sold inventory.
- `unit-of-work.test.ts`: connection binding, isolation level, commit, and rollback behavior.
- `inventory-reader.test.ts`: complete listing and night grids, branch isolation, blocks, and consumption validation.
- `concurrency.test.ts`: deterministic lock ordering, observable waiting, fresh reads, and branch independence.
- `phone-verification.test.ts`: P9/P10, hash storage, commit before delivery, persisted failed guesses, rolling limits, generic public errors, and 20-round observed phone/verification lock races. Use a disposable database and the fake WhatsApp transport; active codes are request fixtures, never seeds.
- `create-website-reservation.test.ts`: M8-T7 use case on real PostgreSQL through `support/website-booking.ts` (production wiring on an independent client, seeded branch, listing and verification tokens): rows, snapshot, outbox and audit in one transaction, every refusal leaves nothing, token single use, idempotency, per phone cap, coupon lock, and C-1, C-9, C-11 over 20 rounds.
- `staff-reservations.test.ts`: S1 to S4 and S15 against PostgreSQL. The duplicate external reference race holds a table `SHARE` lock so both requests pass their prechecks before the unique index decides the winner.
- `change-reservations.test.ts`: M8-T9 S6, S9 and S55 on real PostgreSQL: price only new nights, history, audit and outbox atomicity (failures injected into each adapter), override audit, stale hotel-system acknowledgement, cancellation idempotency and coupon release, the AC-9 role sweep, the captured log check, forced overlap re-reads, VAT and coupon kept, assignment keep or drop, started stays, price only override, services updated in place, cancellation of an entered booking, outbox payloads, and 20-round C-4 (block vs modify) and C-10 races. M8-T9b adds the S6 service edit cases, including observable lock waits in the 20-round same-version race and service-only edits that reject accommodation reads.
- `staff-operations.test.ts`: M8-T10 S5, S10 to S14 and S16 on real PostgreSQL: transitions, link revocation on contact change, early checkout expiry cap, outbox and audit rollback injection, role and branch sweep, and 20 round races for double assignment (C-7), assignment against a block, concurrent link rotation and replay on the guest lock (C-9).
- `guest-access.test.ts`: M8-T11 S50 to S53, G1, G3 and G4 through the route handlers on real PostgreSQL. `Date` is pinned to the fixture clock. Session fixtures must use real 43 character tokens (the `session()` helper, not `issueToken`). 20 round races: parallel blocks write one audit event, and a block waits (observed) on a held guest lock.
- `branch-sync.test.ts`: M8-T12 S28 and S29, S20 completion, and S13 backlog changes on real PostgreSQL. A barrier after each checkpoint insert holds both transactions open to prove overlap in the 20 round precedence test. Audit and response read failures roll back both writes.
- `payment-storage.test.ts` exercises payment constraints and observes 20 lock waits for each partial unique index. Keep the historical M9-T1 assertions in `../payments-and-cancellations-migration.test.ts` before applying later migrations for the current-schema drift check.
- `online-booking.test.ts` observes commit from a separate client during checkout and runs C-14 over 20 last unit races. It also covers same key recovery, definite refusals, expiry and rollback, and dispatch of “payment not completed” notices. `online-booking-route.test.ts` exercises P6 and P7 with the fake gateway through production composition. `payment-callback.test.ts` and `payment-callback-route.test.ts` cover P8: confirmation and held-message release, five parallel duplicates, forged and mismatched events, declines and closed sessions, late success (free units and resale, refund key and unsent refund), recipients after an email change, and two 20-round C-12 races with observed lock waits. `support/payment-callback.ts` is the production wiring on an independent client.
- `storage-concurrency.test.ts`: M8-T1 database idempotency and assignment exclusion races (spec 0005); these prove storage constraints, not booking workflows.
- `support/concurrency.ts`: barriers, deferred signals, independent Prisma clients, and observable PostgreSQL lock waits.

## Rules

- Use the shared database helpers and their disposable database name checks. Reset state before a concurrency case, never while competing clients are active.
- Give each concurrent actor an independent Prisma client and close every client in `finally`. Do not use one connection to simulate concurrency.
- Coordinate overlap with barriers or deferred signals. Observe PostgreSQL lock waits through `pg_stat_activity`; sleeps are not evidence that transactions overlapped.
- Repeat locking and inventory races 20 times. Assert returned results and final resource, inventory, and audit state after the transactions finish.
- Cover branch isolation and wrong branch refusal. A foreign listing is hidden as `NOT_FOUND`, not disclosed through a different error.
- Production consumption reads persisted operational reservation room stays. Keep injected consumption tests distinct from persisted reservation coverage in `reservation-consumption.test.ts`.

_Drafted by /sync from the introducing change, worth a quick human pass._
