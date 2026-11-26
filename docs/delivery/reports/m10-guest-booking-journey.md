# M10 guest booking journey

M10 is in progress. The owner has accepted one of 13 tasks. [Milestone brief](../milestones/m10-guest-booking-journey.md)

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M10-T0a | Critical | Owner, 2026-11-26 | `feat(analytics): add M10-T0a site event collection` | [Independent review](../../reviews/2026-11-26-m10-t0a.md) | The final `npm run check` passed formatting, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,565 unit and contract tests in 116 files, and the production build. Chromium passed 230 tests with 35 intentional skips. Before the file move, all 1,086 PostgreSQL tests passed in 69 files (339, 302, 445). After the move the shards passed 338, 302 and 445 tests. One existing M9 email migration test timed out in the first shard and passed on its own. All nine focused analytics integration and migration tests passed on the final layout. | P11 records anonymous page and booking step views. Collection defaults to off. The fresh and populated M9 migration checks found no drift. Twenty salt rotation races observed the PostgreSQL lock. Six server markers were absent from all 37 browser chunks. The reviewer verified all three major and two minor fixes, then approved the final file layout. At the acceptance commit, `npm run check` passed again (2,565 tests in 116 files, same lint warning), and 23 PostgreSQL tests in the four analytics, seed and migration files passed. The browser suite and the full PostgreSQL suite were not repeated. |
