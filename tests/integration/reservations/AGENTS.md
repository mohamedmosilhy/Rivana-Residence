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
