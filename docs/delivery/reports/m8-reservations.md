# M8: Reservations, immediate confirmation, verification, messages

Status: **Not started** (prerequisite task M8-T0 accepted 2026-11-13). Brief: [m8-reservations.md](../milestones/m8-reservations.md).

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M8-T0 | Medium | Owner, 2026-11-13 | `refactor(application): add M8-T0 ports consolidation` (this task commit) | [2026-11-13-m8-t0.md](../../reviews/2026-11-13-m8-t0.md) | `npm run check` passed: format, lint, typecheck, 80 unit files / 1,683 tests, build. Full PostgreSQL integration: 34 files / 506 tests. Chromium E2E: 178 passed, 30 skipped. Architecture test mutation checks: a port to port import and a recreated `src/application/ports/` both fail the new test | Seven module `ports.ts` files (content, media, settings, enquiries, admin, booking, cache); `src/application/ports/` removed, `Clock` and `IdGenerator` now in `shared/providers.ts`, `Actor` in `shared/actor.ts`, paging types in `shared/pagination.ts`; 71 importers changed in import lines only; 56 of 56 moved declarations identical to the originals (reviewer's own check: 59 of 59). Review (Opus): approve with nits; 3 minors and 4 nits fixed, none open. Done on a branch cut from the M7 tip, then rebased onto `main` after M7 was merged (2026-11-13): the two M7-T6 files that still used the old port paths were updated, and `quotes/ports.ts` was renamed `quote-readers.ts` because it owns no port (the new boundary test caught it). Merged into `main` before any other M8 work. Gates on the combined tree: `npm run check` 81 unit files / 1,731 tests, integration 35 files / 534 tests, Chromium E2E 179 passed, 30 skipped. Follow-up M8-T0b (public surfaces for the old CMS modules) added to the brief, not started |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.
