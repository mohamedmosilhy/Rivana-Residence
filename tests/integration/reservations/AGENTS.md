# Reservation integration tests

Real PostgreSQL tests for reservation transaction boundaries, inventory reads, and concurrency. The governing design is [spec 0003](../../../docs/specs/0003-m6-inventory-and-availability.md), especially its transaction protocol and critical test scenarios.

## Commands

```bash
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration -- tests/integration/reservations
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration -- tests/integration/reservations/concurrency.test.ts
```

## Layout

- `unit-of-work.test.ts`: connection binding, isolation level, commit, and rollback behavior.
- `inventory-reader.test.ts`: complete listing and night grids, branch isolation, blocks, and consumption validation.
- `concurrency.test.ts`: deterministic lock ordering, observable waiting, fresh reads, and branch independence.
- `support/concurrency.ts`: barriers, deferred signals, independent Prisma clients, and observable PostgreSQL lock waits.

## Rules

- Use the shared database helpers and their disposable database name checks. Reset state before a concurrency case, never while competing clients are active.
- Give each concurrent actor an independent Prisma client and close every client in `finally`. Do not use one connection to simulate concurrency.
- Coordinate overlap with barriers or deferred signals. Observe PostgreSQL lock waits through `pg_stat_activity`; sleeps are not evidence that transactions overlapped.
- Repeat locking and inventory races 20 times. Assert returned results and final resource, inventory, and audit state after the transactions finish.
- Cover branch isolation and wrong branch refusal. A foreign listing is hidden as `NOT_FOUND`, not disclosed through a different error.
- Keep M6 consumption expectations honest: the production adapter is empty until M8. Injected consumption tests prove the port and guard behavior but do not claim persisted reservation coverage.

_Drafted by /sync from the introducing change, worth a quick human pass._
