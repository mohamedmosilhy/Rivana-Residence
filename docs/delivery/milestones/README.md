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

## If you are an agent asked to "start milestone N"

A short request such as "Start milestone 4 using docs/delivery/milestones/README.md" means all of this, even when the request does not repeat it:

1. Open the brief for that milestone from the table above and use the branch named for it in [Extra lines per milestone](#2-extra-lines-per-milestone). Create the branch from the previous milestone's branch if it does not exist (from `main` only once earlier milestones are merged there).
2. Follow [the loop](#the-loop-every-milestone-follows) below from step 0, including the full prompt in [Start a milestone](#1-start-a-milestone): check the blocking questions, read first, plan mode with the plan shown before code, `/architect` spec, `/develop`, `/test`, gates, `/check verify`, `/check review`, docs, evidence report.
3. Apply the milestone's line in [Extra lines per milestone](#2-extra-lines-per-milestone). If it names something the owner must provide (keys, wording, templates) and it is not there, stop and ask.
4. Never commit, push, merge, or start the next milestone without the owner's explicit approval. Stop and report at the end.

## The loop every milestone follows

Follow [../../engineering/agent-workflow.md](../../engineering/agent-workflow.md). Project rules in `AGENTS.md` override anything a skill suggests (Next.js only, thin Route Handlers, business logic in `src/domain` and `src/application`, Prisma only in `src/infrastructure/db`, PostgreSQL locks for consistency, no fabricated PMS integration).

| Step | What | Skill | Output |
| --- | --- | --- | --- |
| 0 | Check approval: the previous milestone is accepted and this one is approved to start. Check that every question listed under **Blocking questions** in the brief is answered in [assumptions-and-open-questions.md](../../requirements/assumptions-and-open-questions.md). If a ★ question is open, stop and ask | — | — |
| 1 | Work on branch `m<N>-<short-name>`, created from the previous milestone's branch (from `main` only once earlier milestones are merged there). `git status` must be clean of unrelated work, or that work is left untouched | — | branch |
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

## How to run a milestone (prompts for the owner)

Copy these prompts into Claude Code or Codex. The brief holds the detail; the prompt only points the agent at it and sets the rules.

### 1. Start a milestone

Change `<N>`, the name, the branch, and the brief file name.

```text
Start milestone M<N> — <name>.

Work on branch m<N>-<branch-name> (create it from the previous milestone's branch if it doesn't exist).

Follow docs/delivery/milestones/m<N>-<file>.md exactly, using the loop in
docs/delivery/milestones/README.md:
1. Check that every blocking question in the brief is answered. If any is not, stop and ask me.
2. Read AGENTS.md, the brief, and every document in its "Read first" list.
3. Enter plan mode and show me your plan before writing code.
4. Run /architect to write the build spec in docs/specs/ (cite the ADRs, invent no business rules).
5. Build with /develop in the brief's task order (data → domain → application → infrastructure → API → UI).
6. Write tests with /test after each task group; use /debug for any unclear failure.
7. Run all the gates (npm run check, integration, E2E) and record the exact counts.
8. Prove each acceptance criterion with /check verify, then run /check review.
9. Update the docs (Implemented vs Planned, the roadmap row, the test matrix) and write the
   evidence report docs/delivery/reports/m<N>-<name>.md.
10. Stop and report. Don't commit, push, or start the next milestone until I approve.

Respect the brief's "Out of scope" list. If something there seems necessary, ask me first.
```

### 2. Extra lines per milestone

Add the line in the last column under the prompt above.

| Milestone | Branch | Add to the prompt |
| --- | --- | --- |
| [M4](./m4-backend-foundations.md) Backend foundations | `m4-backend-foundations` | Nothing extra |
| [M5](./m5-branch-websites.md) Branch websites | `m5-branch-websites` | Nothing extra (the demo seed provides a second fictional branch) |
| [M6](./m6-inventory-and-availability.md) Inventory and availability | `m6-inventory-and-availability` | Nothing extra |
| [M7](./m7-booking-quote.md) Booking quote | `m7-booking-quote` | Nothing extra (VAT is an Admin setting; hard-code no rate) |
| [M8](./m8-reservations.md) Reservations | `m8-reservations` | If the client has sent the WhatsApp number and token: "The WhatsApp access token is in `.env.local`; I'll enter the number in the dashboard." Otherwise: "Use the fake WhatsApp adapter; the number stays a placeholder." |
| [M9](./m9-payments-and-cancellations.md) Payments and cancellations | `m9-payments-and-cancellations` | "The Paymob sandbox keys are in `.env.local`." (Put them there yourself first.) |
| [M10](./m10-guest-booking-journey.md) Guest booking journey | `m10-guest-booking-journey` | Any approved wording (privacy, cancellation terms, child policy), or: "Use placeholder text flagged by the content audit." |
| [M11](./m11-front-desk.md) Front desk | `m11-front-desk` | Nothing extra |
| [M12](./m12-manager-admin.md) Manager and admin | `m12-manager-admin` | Nothing extra |
| [M13](./m13-whatsapp-marketing.md) WhatsApp marketing | `m13-whatsapp-marketing` | The consent wording, the feedback delay, and confirmation that the marketing and feedback templates are approved in Meta (Q-58, Q-59) |
| [M14](./m14-hardening.md) Hardening | `m14-hardening` | Whether to add the authenticator-app second sign-in step for Admin and Manager (Q-33) |
| [M15](./m15-joint-launch.md) Launch | `m15-joint-launch` | Live Paymob keys (in the server environment), room and apartment numbers, the staff list with roles and branches, the PMS name, and the approved legal texts |

### 3. After the agent reports

Accept and move on:

```text
M<N> is accepted. Mark it accepted in the roadmap and its evidence report, commit on
m<N>-<branch-name>, push it, then create branch m<N+1>-<next-branch-name> from it.
Don't start M<N+1> yet.
```

Ask for fixes:

```text
M<N> needs changes: <list>. Fix only these, rerun the gates, update the evidence
report, and report again. Don't commit yet.
```

Merge into `main` (whenever you choose, for example after launch):

```text
Merge <branch> into main and push main.
```

### Tips

- Put secrets (Paymob keys, the WhatsApp access token) in `.env.local` yourself and tell the agent they are there. Never paste them into the chat.
- If the agent asks a business question the briefs do not answer, answer it and add: "Record this decision in docs/requirements/assumptions-and-open-questions.md."

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
