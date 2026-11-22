# M9: Online payments (provider neutral), cancellation requests, refunds, guest changes, email verification

Status: **In progress** (1/14 tasks accepted: M9-T0 on 2026-11-22). Brief: [m9-payments-and-cancellations.md](../milestones/m9-payments-and-cancellations.md). Branch: `m9-payments-and-cancellations`. The milestone spec (`docs/specs/`) is not written yet; it is owed before the first behavior task (M9-T0b onward).

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M9-T0 | Medium | Owner, 2026-11-22 | `refactor(application): add M9-T0 public surface for auth` (`2946a0c`) | [2026-11-22-m9-t0.md](../../reviews/2026-11-22-m9-t0.md) | `npm run check` passed: format, lint, typecheck, 102 unit files / 2,249 tests (baseline 2,246 plus 3 new architecture cases), build. Full PostgreSQL integration: 53 files / 855 tests (unchanged). Chromium E2E: 212 passed, 33 skipped (unchanged). Four mutation checks (static deep import, dynamic deep import, deleted index, auth importing another module) each failed the guards, and a static deep import also failed lint; all reverted | `src/application/auth/index.ts` exports exactly the 10 values and 7 types used outside; 91 outside files and the 3 internal files changed in import lines only (import stripped comparison identical for all 94, repeated independently by the reviewer); `auth` joined the application only D-8 lists in the architecture test and ESLint; the one `BranchScope` allowance in `ports-layout.test.ts` names the auth index, protected by a new guard that `auth` and `shared` stay leaf folders; `openapi.json` unchanged; no client component imports `auth`. `src/domain/auth` is left out and added to M14-T11. Review (Opus 5.5, author Sonnet 5.5): approve with nits; 2 minors and 3 nits fixed, 2 pre-existing gaps left (tests and `src/proxy.ts` outside ESLint's D-8 globs, scanner skips side effect imports) |

Task commits identified by subject in this log can be located with `git log --oneline --fixed-strings --grep='<subject>'`.
