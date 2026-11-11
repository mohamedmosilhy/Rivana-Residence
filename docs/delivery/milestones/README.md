# Milestone briefs (M4–M15)

One brief per forward milestone. Each brief is the contract for one tested slice: what to build, in which order, which files and tables it touches, how to prove it, and which agent skills to run at each step. Each brief's **Task breakdown** splits the milestone into small tasks that are planned, reviewed, and accepted one at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). The [roadmap](../roadmap.md#reservation-milestones) holds the sequence and status; these briefs hold the detail. The plan was approved by the project owner on 2026-11-06. Each milestone's status is in the roadmap.

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

## Audit repair schedule

The engineering audit repairs are tracked as small milestone tasks in [repairs/README.md](./repairs/README.md). Open the linked repair file when starting the related milestone. F02 and F03 are complete and merged. F01 is patched and verified before public exposure.

## If you are an agent asked to "start milestone N"

A short request such as "Start milestone 6 using docs/delivery/milestones/README.md" means **open the milestone**, not build it. Work follows the task-based workflow in [../../engineering/agent-workflow.md](../../engineering/agent-workflow.md), which is mandatory:

1. Open the brief for that milestone from the table above and use the branch named for it in [Extra lines per milestone](#2-extra-lines-per-milestone). Create the branch from `main` if it does not exist (every accepted milestone is merged into `main`).
2. Run the **milestone open** steps (0–4 below): check the blocking questions, read, write the spec with `/architect`, confirm the brief's **Task breakdown**. Then stop for the owner's approval of the spec and the task breakdown.
3. After approval, run **one task at a time** through the 7-stage task lifecycle (step 5). Each task stops twice: for plan approval before code, and for acceptance after the review package.
4. Apply the milestone's line in [Extra lines per milestone](#2-extra-lines-per-milestone). If it names something the owner must provide (keys, wording, templates) and it is not there, stop and ask.
5. Never commit, push, or merge outside the Git rules, and never start the next task or milestone without the owner's explicit approval.

## The loop every milestone follows

Follow [../../engineering/agent-workflow.md](../../engineering/agent-workflow.md). Project rules in `AGENTS.md` override anything a skill suggests (Next.js only, thin Route Handlers, business logic in `src/domain` and `src/application`, Prisma only in `src/infrastructure/db`, PostgreSQL locks for consistency, no fabricated PMS integration).

**Milestone open** (one approval gate)

| Step | What | Skill | Output |
| --- | --- | --- | --- |
| 0 | Check approval: the previous milestone is accepted and this one is approved to start. Check that every question listed under **Blocking questions** in the brief is answered in [assumptions-and-open-questions.md](../../requirements/assumptions-and-open-questions.md). If a ★ question is open, stop and ask | — | — |
| 1 | Work on branch `m<N>-<short-name>`, created from `main`. `git status` must be clean of unrelated work, or that work is left untouched | — | branch |
| 2 | Read: `AGENTS.md`, this brief, every document in its **Read first** list, and the matching Next.js guide in `node_modules/next/dist/docs/` for any framework API you touch. In Claude Code, enter plan mode | — | — |
| 3 | Turn the brief into a build spec `docs/specs/NNNN-m<N>-<name>.md`. The spec cites the ADRs and the brief and must not contradict them. It records only local implementation choices; business decisions come from the question register, never from the spec | `/architect` (mode `ENHANCEMENT`; `FEATURE` for wholly new modules) | spec |
| 4 | Confirm or refine the brief's **Task breakdown** (ids, order, dependencies, risk tier) against the spec, then **stop: the owner approves the spec and the task breakdown** | — | approved task table |

**Tasks** (repeat per task, in dependency order)

| Step | What | Skill | Gate |
| --- | --- | --- | --- |
| 5.1 | Plan: task card and approach | — (plan mode) | **owner approves the plan** |
| 5.2 | Design, only when a decision is owed | `/architect` | **owner approves** contract, schema, port, or architecture changes |
| 5.3 | Implement the approved task only | `/develop`, `/debug` | — |
| 5.4 | Tests and the gates for the risk tier ([quality-gates.md](../../testing/quality-gates.md#gates-per-task)); runtime proof | `/test`, `/check verify` | gates pass |
| 5.5 | Independent review of the task diff (`docs/reviews/<date>-m<N>-t<K>.md`) | `/check review uncommitted` | findings resolved |
| 5.6 | Engineering Review Package | — | **owner accepts the task** |
| 5.7 | Docs, task status, task log row, commit on the milestone branch | — | — |

Details of every stage: [agent-workflow.md](../../engineering/agent-workflow.md#task-lifecycle-every-task-in-order).

**Milestone close** (one approval gate)

| Step | What | Skill | Output |
| --- | --- | --- | --- |
| 8 | Run every gate ([quality-gates.md](../../testing/quality-gates.md#commands)) on the final tree and record the exact commands and counts | — | gate output |
| 9 | Prove each acceptance criterion of the brief in the running app (API calls, browser, database state) and collect the brief's **Evidence for the report** | `/check verify` | verification notes |
| 10 | Optional: a milestone-wide review when tasks interact in ways a single task diff could not show | `/check review` | `docs/reviews/…` |
| 11 | Update every document whose status changed and is not yet updated (**Implemented** vs **Planned**), the roadmap overview row, and the test matrix | — | docs |
| 12 | Finish the evidence report `docs/delivery/reports/m<N>-<name>.md` (template below) | — | report |
| 13 | **Stop for milestone acceptance.** After the owner accepts, before the merge into `main`: update `AGENTS.md` from what changed | `/sync` | `AGENTS.md` lines |
| 14 | When the owner asks for a PR or release text | `/document pr` | PR description |
| 15 | **Stop.** Do not start the next milestone | — | — |

Commits: one per accepted task on the milestone branch, made at step 5.7 (the owner's acceptance of the task is the request to commit); the branch is not pushed until the milestone is accepted. Every accepted milestone is merged into `main` and `main` is pushed; otherwise never push without being asked (`AGENTS.md`, Git).

Personal or editor-level skills (for example a UI design review skill) are optional extras. The project skills above (`.claude/skills/`, `.agents/skills/`) are the required set, so Claude Code and Codex follow the same loop.

## How to run a milestone (prompts for the owner)

Copy these prompts into Claude Code or Codex. The brief holds the detail; the prompt only points the agent at it and sets the rules.

### 1. Open a milestone

Change `<N>`, the name, the branch, and the brief file name.

```text
Open milestone M<N> — <name>.

Work on branch m<N>-<branch-name> (create it from main if it doesn't exist).

Follow docs/delivery/milestones/m<N>-<file>.md and the task-based workflow in
docs/engineering/agent-workflow.md:
1. Check that every blocking question in the brief is answered. If any is not, stop and ask me.
2. Read AGENTS.md, the brief, and every document in its "Read first" list.
3. Run /architect to write the build spec in docs/specs/ (cite the ADRs, invent no business rules).
4. Confirm or refine the brief's task breakdown (ids, order, dependencies, risk).
5. Stop and show me the spec summary and the task table. Write no application code.
```

Start a task (after the milestone is open, or after the previous task is accepted):

```text
Start task M<N>-T<K>. Plan it first (task card and approach) and wait for my approval.
```

Approve a plan:

```text
Plan for M<N>-T<K> approved. Implement it, verify, run /check review, and give me the review package.
```

Accept a task:

```text
M<N>-T<K> is accepted. Sync the docs and the task status, add the task log row, and commit on
m<N>-<branch-name>. Don't start the next task yet.
```

Ask for changes to a task:

```text
M<N>-T<K> needs changes: <list>. Fix only these, rerun the gates and the review, and give me
an updated review package. Don't commit yet.
```

Close a milestone (after its last task is accepted):

```text
All M<N> tasks are accepted. Close the milestone: full gates, /check verify against every
acceptance criterion, docs, and the evidence report. Then stop for my acceptance.
```

### 2. Extra lines per milestone

Add the line in the last column under the prompt above.

| Milestone | Branch | Add to the prompt |
| --- | --- | --- |
| [M4](./m4-backend-foundations.md) Backend foundations | `m4-backend-foundations` | Nothing extra |
| [M5](./m5-branch-websites.md) Branch websites | `m5-branch-websites` | Nothing extra (the demo seed provides a second fictional branch) |
| [M6](./m6-inventory-and-availability.md) Inventory and availability | `m6-inventory-and-availability` | Nothing extra |
| [M7](./m7-booking-quote.md) Booking quote | `m7-booking-quote` | Nothing extra (VAT starts at 15% as migration data and is an Admin setting; no rate is hard-coded in logic) |
| [M8](./m8-reservations.md) Reservations | `m8-reservations` | If the client has sent the WhatsApp number and token: "The WhatsApp access token is in `.env.local`; I'll enter the number in the dashboard." Otherwise: "Use the fake WhatsApp adapter; the number stays a placeholder." |
| [M9](./m9-payments-and-cancellations.md) Payments and cancellations | `m9-payments-and-cancellations` | "The Paymob sandbox keys are in `.env.local`." (Put them there yourself first.) |
| [M10](./m10-guest-booking-journey.md) Guest booking journey | `m10-guest-booking-journey` | Any approved wording (privacy, cancellation terms, child policy), or: "Use placeholder text flagged by the content audit." |
| [M11](./m11-front-desk.md) Front desk | `m11-front-desk` | Nothing extra |
| [M12](./m12-manager-admin.md) Manager and admin | `m12-manager-admin` | Nothing extra |
| [M13](./m13-whatsapp-marketing.md) WhatsApp marketing | `m13-whatsapp-marketing` | The consent wording, the feedback delay, and confirmation that the marketing and feedback templates are approved in Meta (Q-58, Q-59) |
| [M14](./m14-hardening.md) Hardening | `m14-hardening` | Whether to add the authenticator-app second sign-in step for Admin and Manager (Q-33) |
| [M15](./m15-joint-launch.md) Launch | `m15-joint-launch` | Live Paymob keys (in the server environment), room and apartment numbers, the staff list with roles and branches, the PMS name, and the approved legal texts |

### 3. After the milestone closes

Accept the milestone and move on:

```text
M<N> is accepted. Mark it accepted in the roadmap and its evidence report, commit on
m<N>-<branch-name>, push it, merge it into main and push main, then create branch
m<N+1>-<next-branch-name> from main. Don't start M<N+1> yet.
```

Ask for fixes:

```text
M<N> needs changes: <list>. Plan the fixes as tasks (or reopen the affected task), rerun
the gates, update the evidence report, and report again. Don't commit yet.
```

Merge a branch into `main` by itself (the accept prompt above already does this for milestones):

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

Status: In progress (YYYY-MM-DD); Ready for review at milestone close

## Task log (one row per task, added when the task is accepted)

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |

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
- **Task breakdown** tables (ids `M<N>-T<K>`, risk tier, dependencies, the acceptance criteria and tests each task covers, status) are the single place for task status. Rows are confirmed at milestone open; adding, splitting, or merging a task later needs the owner's approval. The numbered **Tasks** text below each table stays as the detailed content.
