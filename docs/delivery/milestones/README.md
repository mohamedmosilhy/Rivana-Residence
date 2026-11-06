# Milestone briefs (M4–M15)

One brief per forward milestone. Each brief is the contract for one reviewable, tested slice: what to build, in which order, which files and tables it touches, how to prove it, and which agent skills to run at each step. The [roadmap](../roadmap.md#reservation-milestones) holds the sequence and status; these briefs hold the detail. The plan was approved by the project owner on 2026-11-06. None of these milestones has started.

| Brief | Scope |
| --- | --- |
| [M4](./m4-backend-foundations.md) | Backend foundations and branch data ownership |
| [M5](./m5-branch-websites.md) | Branch websites, rooms-and-apartments catalog, popup removal |
| [M6](./m6-inventory-and-availability.md) | Inventory, date prices, availability |
| [M7](./m7-booking-quote.md) | Booking quote: services, coupons, VAT |
| [M8](./m8-reservations.md) | Reservations, immediate confirmation, verification, messages (API) |
| [M9](./m9-payments-and-cancellations.md) | Paymob payments, holds, cancellation requests, refunds (API) |
| [M10](./m10-guest-booking-journey.md) | Guest booking journey (UI) |
| [M11](./m11-front-desk.md) | Front-desk operations (UI) |
| [M12](./m12-manager-admin.md) | Manager and admin tools (UI) |
| [M13](./m13-whatsapp-marketing.md) | WhatsApp broadcasts and feedback requests |
| [M14](./m14-hardening.md) | Security, regression, E2E hardening |
| [M15](./m15-joint-launch.md) | Joint launch and handover (with Phase 12) |

## The loop every milestone follows

Follow [../../engineering/agent-workflow.md](../../engineering/agent-workflow.md). Project rules in `AGENTS.md` override anything a skill suggests (Next.js only, thin Route Handlers, business logic in `src/domain` and `src/application`, Prisma only in `src/infrastructure/db`, PostgreSQL locks for consistency, no fabricated PMS integration).

| Step | What | Skill | Output |
| --- | --- | --- | --- |
| 0 | Check approval: the previous milestone is accepted and this one is approved to start. Check that every question listed under **Blocking questions** in the brief is answered in [assumptions-and-open-questions.md](../../requirements/assumptions-and-open-questions.md). If a ★ question is open, stop and ask | — | — |
| 1 | Branch from `main`: `m<N>-<short-name>`. `git status` must be clean of unrelated work, or that work is left untouched | — | branch |
| 2 | Read: `AGENTS.md`, this brief, every document in its **Read first** list, and the matching Next.js guide in `node_modules/next/dist/docs/` for any framework API you touch. In Claude Code, enter plan mode | — | plan |
| 3 | Turn the brief into a build spec `docs/specs/NNNN-m<N>-<name>.md`. The spec cites the ADRs and the brief and must not contradict them. It records only local implementation choices; business decisions come from the question register, never from the spec | `/architect` (mode `ENHANCEMENT`; `FEATURE` for wholly new modules) | spec |
| 4 | Optional: enroll the milestone as a scope feature so `/develop` and `/check` can track it (tier `Beta`, so verification and tests close it) | `/scope` | `docs/scope/` row |
| 5 | Build in the order of the brief's **Tasks** (data, then domain, then application, then infrastructure, then API, then UI). Use the logic track for data, domain, application, and API work and the UI track for pages and components | `/develop` | code |
| 6 | Write the tests listed in **Tests** for what you just built, after each task group, not only at the end | `/test` | tests |
| 7 | When a test or gate fails for a reason that is not obvious, find the root cause before changing code | `/debug` | minimal fix + regression test |
| 8 | Run every gate ([quality-gates.md](../../testing/quality-gates.md#commands)) and record the exact commands and counts | — | gate output |
| 9 | Prove each acceptance criterion in the running app (API calls, browser, database state) | `/check verify` | verification notes |
| 10 | Fresh-model code review of the diff, then fix or answer each finding | `/check review` | `docs/reviews/…` |
| 11 | Update every document whose status changed (**Implemented** vs **Planned**), the roadmap overview row, and the test matrix | — | docs |
| 12 | Write the evidence report `docs/delivery/reports/m<N>-<name>.md` (template below) | — | report |
| 13 | After the user approves and asks for the merge: update `AGENTS.md` and the scope from what changed | `/sync` | `AGENTS.md` lines |
| 14 | When the user asks for a PR or release text | `/document pr` | PR description |
| 15 | **Stop.** Report and wait. Do not start the next milestone | — | — |

Commit only when the user asks, merge to `main` only when asked, and never push without being asked (`AGENTS.md`, Git).

Personal or editor-level skills (for example a UI design review skill) are optional extras. The project skills above (`.claude/skills/`, `.agents/skills/`) are the required set, so Claude Code and Codex follow the same loop.

## Gates (run on the final tree)

```bash
npm run check                     # format:check, lint, typecheck, unit, build
TEST_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_test npm run test:integration
E2E_DATABASE_URL=postgresql://<user>@127.0.0.1:5432/rivana_e2e_test npm run test:e2e
```

Milestones with a migration also run the `prisma migrate diff` drift check on a migrated scratch database ([migrations-and-seeding.md](../../database/migrations-and-seeding.md#planned-migrations-one-per-milestone-each-reviewed)); it must report no difference. UI milestones also run the visual and accessibility suites included in `npm run test:e2e`, and record cross-browser WebKit results (`npm run test:e2e:browsers`) when they change public pages.

Concurrency tests (from M6) also run alone, 20 iterations: `vitest run --config vitest.integration.config.ts tests/integration/reservations/concurrency.test.ts`.

Never claim a gate passed without running it. If a gate cannot run (for example a browser that does not launch on this machine), say so in the report with the reason.

## Evidence report template

```markdown
# M<N> — <name>

Status: Ready for review (YYYY-MM-DD)

## Outcome
## Scope delivered (task checklist from the brief, each ticked or explained)
## Files added, changed, removed
## Migrations and configuration (with environment variable changes)
## Decisions made during the milestone (local choices only; business questions raised)
## Commands and results (exact commands, counts, durations)
## Acceptance criteria → evidence (one row per criterion)
## Screenshots (UI milestones; desktop 1280 and mobile 390)
## Known limitations, risks, deferred work
## Next milestone: not started
```

## Conventions used in every brief

- **Requirement ids** (FR-…, NFR-…, US-…) are in [requirements/](../../requirements/functional-requirements.md). **Rule ids** (AV-, IN-, PR-, SV-, CP-, TX-, PY-, CX-, GV-) are in [domain/](../../domain/business-rules.md). **Endpoint ids** (API-…) are in [api-contracts.md](../../api/api-contracts.md). **Test ids** are in [test-matrix.md](../../testing/test-matrix.md).
- Source layout follows [project-structure.md](../../architecture/project-structure.md): `src/domain/<module>`, `src/application/<module>`, `src/infrastructure/db/prisma/repositories/<module>`, `src/contracts/api/v1`, `src/app/api/v1`, `src/composition`, `src/presentation/...`; tests under `tests/unit`, `tests/integration`, `tests/e2e`.
- Every new use case calls `authorize` (and `authorizeBranch` when branch data is involved) before any repository call, and is added to the authorization sweep.
- Every availability-reducing write takes the room-type lock first (ADR 016). Every money-changing write appends an `AuditEvent` in the same transaction.
- **Out of scope** lists in the briefs are binding. If something there seems necessary, stop and ask.
