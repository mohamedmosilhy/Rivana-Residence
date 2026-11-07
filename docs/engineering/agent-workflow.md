# Agent workflow (Claude Code and OpenAI Codex)

How coding agents (and humans) plan, implement, test, review, and report work on Rivana. This document is the **canonical, mandatory workflow** for every remaining milestone and every agent. Shared rules live in [AGENTS.md](../../AGENTS.md), which both tools read; `CLAUDE.md` imports it for Claude Code. The milestone-level steps and the owner's prompts are in [delivery/milestones/README.md](../delivery/milestones/README.md).

Task-based workflow adopted by the project owner on 2026-11-07, replacing the "build a whole milestone, then review" loop used for Phases 0–11 and M4–M5. The skills, briefs, specs, evidence reports, and merge rule are unchanged; the unit of approval moved from the milestone to the task.

## Principles

- Agents implement, test, debug, and refactor. **The owner (the responsible engineer) makes engineering decisions and accepts every change.** An agent is an implementation assistant, not a decision-maker.
- Work moves in **small, independently verifiable tasks**. Each task is understood and accepted before the next starts.
- Approved architecture (ADRs, [dependency rules](../architecture/dependency-rules.md), [engineering standards](./engineering-standards.md)) and business decisions ([decisions register](../requirements/assumptions-and-open-questions.md)) change only with the owner's approval.
- Quality, security, and correctness come before speed. Green tests are evidence, not proof.
- The owner does not review every line. The owner must understand the important decisions, the behavior, the critical code paths, and the risks. Agents make that easy.

## Units of work

| Unit | Defined in | Approved by the owner |
| --- | --- | --- |
| **Milestone** | Its brief in [delivery/milestones/](../delivery/milestones/README.md): objective, binding out-of-scope list, acceptance criteria, tests | Start (spec and task breakdown) and end (milestone acceptance) |
| **Task** | One row of the brief's **Task breakdown** table; detailed in a task card at planning time | Plan (before code) and result (before the next task) |

### Task sizing

- One task = **one cohesive engineering responsibility** (for example "inventory lock and unit of work", not "M6 backend").
- Independently testable: it ends with passing tests for what it added, on a tree where every gate that applies passes.
- Touches one module or one vertical path through the layers. Do not combine unrelated modules or business workflows.
- Not trivially small: no task per function or per file.
- Reviewable: roughly what the owner can understand in one sitting from the review package.
- If a task turns out larger than planned, **stop and propose splitting it** before continuing.

### Task ids and status

Ids are `M<N>-T<K>` (for example `M6-T3`). Status lives in one place: the **Status** column of the brief's task table (`Not started`, `Planned`, `In progress`, `Ready for review`, `Changes requested`, `Accepted`, `Blocked`). The roadmap row shows only milestone status (for example "In progress (3/9 tasks accepted)"). A task added, split, or merged after the milestone opens needs the owner's approval and is recorded in the table.

### Task card (written at Stage 1, in the chat)

Most fields come from the brief and the milestone spec; cite them instead of copying.

1. Id and title. 2. Objective. 3. Scope (in, and explicitly out). 4. Requirements and expected behavior (requirement, rule, and endpoint ids). 5. Architectural considerations (layers, ports, transactions, locks, authorization). 6. Expected files and modules. 7. Dependencies on earlier tasks. 8. Acceptance criteria (the brief's numbered criteria this task covers, plus task-level ones). 9. Tests (test ids from the [test matrix](../testing/test-matrix.md), and which gates will run). 10. Risk tier, with the reason.

## Milestone open

Before the first task (steps 0–4 of the [milestone loop](../delivery/milestones/README.md#the-loop-every-milestone-follows)): confirm the previous milestone is accepted and the blocking questions are answered; create the `m<N>-` branch from `main`; read the brief and its **Read first** list; run `/architect` to write the milestone spec in `docs/specs/`; confirm or refine the brief's task table (ids, order, dependencies, risk). **Gate: the owner approves the spec and the task breakdown.** No application code is written in this step.

## Task lifecycle (every task, in order)

| Stage | What the agent does | Skill | Gate |
| --- | --- | --- | --- |
| 1. Plan | Read the task row, the spec, and the code in the area. Identify layers, dependencies, and risks. Present the task card and the implementation approach. In Claude Code, use plan mode | — | **Wait for the owner's approval** |
| 2. Design | Clarify the domain rules, application responsibilities, interfaces and contracts, database changes, API behavior, error handling, and authorization the task needs. Usually a few lines in the plan. If a load-bearing decision is not in the spec, extend the spec | `/architect` (only when a decision is owed) | **Wait for approval** if it changes a contract, the schema, a port, or the architecture |
| 3. Implement | Build only the approved task, following the architecture and standards. No unrelated refactors, no new dependencies, no silent scope growth. Unexpected requirement or architectural problem → stop and explain (see [Scope changes](#scope-changes-and-surprises)) | `/develop` (logic or UI track), `/debug` for unclear failures | — |
| 4. Verify | Add or update tests for the new behavior. Run the gates for the task's risk tier ([quality-gates.md](../testing/quality-gates.md#gates-per-task)). Prove the behavior in the running app when the task has observable behavior | `/test`, `/check verify` | Every applicable gate passes, or the failure is reported |
| 5. Independent review | A reviewer on a different model reads the task's uncommitted diff against the requirements, the approved task card, the architecture, security rules, and the acceptance criteria. The author fixes each finding or answers it with evidence | `/check review uncommitted` | Findings resolved or explicitly left for the owner |
| 6. Review package | Present the [Engineering Review Package](#engineering-review-package) | — | **Wait for the owner's acceptance** |
| 7. Sync and commit | After acceptance: update the docs whose behavior changed, the task's status in the brief, and the task log row in the milestone evidence report; then commit on the milestone branch | — (`/sync` when a new area convention appeared) | — |

Never start the next task, or the next stage after a gate, without the owner's word. A requested change sends the task back to the stage it affects; rerun Stages 4–6 after the fix.

## Milestone close

After the last task is accepted (steps 8–15 of the milestone loop): run the full gate set on the final tree, `/check verify` against every acceptance criterion of the brief, and the brief's evidence items; finish the evidence report; then **stop for milestone acceptance**. After acceptance: `/sync`, push the branch, merge into `main`, push `main`, create the next branch. Do not start the next milestone.

## Risk classification

Classify each task (and call out riskier parts inside a task) by the **impact of a failure**, not by the file type.

| Tier | Typical areas on Rivana | Review depth | Tests and gates |
| --- | --- | --- | --- |
| **Critical** | Authentication, capabilities and roles, branch scope and isolation, transactions, locks and constraints, availability and inventory, prices, VAT, coupons and money, reservation state, payments, refunds and webhooks, personal data, tokens, consent | The package lists the code to review **deeply** (`file:line`) with an edge-case table (what happens on boundary, concurrent, unauthorized, cross-branch, and failure inputs). The reviewer covers every item in the security and integrity checklist below | All gates in [quality-gates.md](../testing/quality-gates.md#gates-per-task), negative and authorization-sweep tests, concurrency tests repeated 20 times when locking or inventory is touched |
| **Medium** | Repositories, use-case workflows without money or locks, API handlers and contracts, pagination, integrations behind ports, client state | Architecture fit, important code paths, contracts, and test coverage | Format, lint, typecheck, unit, integration; E2E when routes or pages change |
| **Low** | Presentational components, styling, static content, straightforward boilerplate | Focused review of the visible result | Format, lint, typecheck, unit; E2E (visual and axe) when UI changes |

Security and integrity checklist for critical work: `authorize` and `authorizeBranch` run before any repository call; the branch comes from the server, never the client; every availability-reducing write takes the room-type lock in one transaction (ADR 016); money is integer minor units with half-up rounding where specified; every money-changing write appends an audit event in the same transaction; no network I/O inside a transaction; idempotency and `If-Match` where the API requires them; no personal data, tokens, or bodies in logs; nothing server-only in client bundles.

## Independent reviewer

- Run `/check review uncommitted` after Stage 4. Because accepted tasks are committed, the uncommitted diff is exactly the current task. Name the findings file `docs/reviews/<YYYY-MM-DD>-m<N>-t<K>.md`, and give the reviewer the approved task card (scope, acceptance criteria, risk tier).
- The reviewer runs on a different model than the author and inspects the **actual diff**. It checks: functional correctness against the requirements and the task card, architectural violations ([dependency rules](../architecture/dependency-rules.md), thin Route Handlers, business logic only in `src/domain` and `src/application`), security, missing edge cases, error handling, unnecessary complexity, and missing or weak tests.
- Every finding cites evidence (`file:line`, the rule or requirement it breaks, a concrete failing scenario).
- The author fixes, or answers with evidence, every finding before Stage 6. Findings left open are listed in the review package.
- A reviewer's approval never replaces the owner's acceptance.

## Engineering Review Package

Presented in the chat at Stage 6. Concise: help the owner understand the change, do not narrate it.

1. **What and why**: what was implemented and the reason, in a few sentences.
2. **Decisions**: important engineering decisions and alternatives rejected.
3. **Files by responsibility**: grouped (domain, application, infrastructure, API, UI, tests, docs), not a flat list.
4. **Code paths to inspect**: the important paths with `file:line` links. For critical risk, mark the code to **review deeply** and include the edge-case table.
5. **Architectural impact**: new modules, ports, dependencies, or none.
6. **Database and API changes**: migrations, constraints, endpoints, contract changes, or none.
7. **Tests and results**: exact commands and counts; anything not run, with the reason; the reviewer's findings file and how each finding was resolved.
8. **Risks and unresolved issues**: nothing hidden.
9. **Decisions for the owner**: questions that need an answer before acceptance, or none.

## Scope changes and surprises

- Implement only the approved task. The brief's **Out of scope** list is binding.
- If an unexpected requirement, a missing decision, a conflict with an ADR or rule, or an architectural problem appears: **stop, explain it with evidence, propose options with a recommendation, and wait.** Do not work around it silently.
- A business question the docs do not answer goes to the owner, and the answer is recorded in [assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md).
- Small, clearly necessary fixes inside the task's own files may proceed, and are listed in the package. Anything touching another module or another task's scope needs approval.

## Documentation synchronization

- Docs change in the same task as the behavior (Stage 7): mark **Implemented** versus **Planned** accurately in the topic documents, update the test matrix and API contracts when they change, and run `npm run openapi` when an endpoint changes.
- Record progress in two places only: the task's **Status** in the brief, and one row per task in the milestone evidence report's **Task log**. No separate per-task documents.
- A significant architectural decision gets an ADR (with the owner's approval); a local implementation choice goes in the milestone spec.
- `/sync` runs at milestone close, and also within a task when it introduces a convention future agents must know.

## Rules for every agent

1. Never implement an entire milestone in one execution step. Work task by task.
2. Never skip the planning stage or an approval gate.
3. Never silently change approved architecture, contracts, or business decisions.
4. Never expand a task's scope without approval.
5. Never treat passing tests as sufficient proof of correctness.
6. Never claim a check passed, or a task complete, without running and verifying it.
7. Never hide unresolved issues, skipped checks, or reviewer findings.
8. Never start the next task before the owner accepts the current one.
9. Never commit, push, or merge outside the [Git rules](../../AGENTS.md#git).
10. Never generate documentation that only adds review overhead.
11. Always explain important engineering decisions.
12. Always identify the critical code paths that need the owner's deep review.

## Agent skills (JavaScript Mastery)

Source: `JavaScript-Mastery-Pro/skills` on GitHub, installed with the `skills` CLI (`npx skills@latest add JavaScript-Mastery-Pro/skills`). The lock file `skills-lock.json` pins each skill's content hash. Do not edit the skill files; project rules override them.

| Location | Agent | Installed |
| --- | --- | --- |
| `.claude/skills/<name>/` | Claude Code | 2026-10-24 01:15, already present when this setup started (the user's `-a claude-code` install) |
| `.agents/skills/<name>/` | Codex (also read by Cursor and GitHub Copilot, per `npx skills list`) | 2026-10-24 (`-a codex -s '*' --copy`) |

Both copies were verified identical (`diff -r`). Each skill ships `SKILL.md` (both tools) and `agents/openai.yaml` (Codex picker metadata).

| Skill | Purpose | Frontend/backend | Use on Rivana |
| --- | --- | --- | --- |
| `scope` | Living feature scope in `docs/scope/` | Both | Optional; not used so far (owner's choice). Task status lives in the briefs |
| `architect` | Decision discovery; writes `docs/specs/NNNN-*.md` | Both | Milestone open: one spec per milestone, from the brief. Extended in Stage 2 when a task owes a decision. It must cite, not contradict, the ADRs |
| `audit` | Bootstraps or gap-fills `AGENTS.md` | Both | Run in gap-fill mode only; never let it overwrite curated `AGENTS.md` text |
| `develop` | Builds from a spec (UI track `ui-guide.md`, logic track `logical-guide.md`) | Both | Stage 3, one task at a time |
| `test` | Writes tests for uncommitted changes (`test-preferences.json`) | Both | Stage 4. Preferences: Vitest, Playwright, the existing `tests/` layout |
| `check` | `verify` drives the app; `review` is a fresh-model code review into `docs/reviews/` | Both | Stage 4 (`verify`) and Stage 5 (`review uncommitted`) per task; `verify` against all criteria at milestone close |
| `debug` | Root-cause loop | Both | Failing tests or regressions, any stage |
| `sync` | Updates `AGENTS.md` and scope after a change | Both | Milestone close, or Stage 7 when a new convention appeared |
| `document` | PR text, changelog, release notes, postmortems | Both | When the owner asks |

How the skills relate to project rules:

- The skills are general workflow skills, not framework-specific. Project rules (Next.js-only, REST through Route Handlers, layered modules, DB-backed consistency, this workflow's gates) come from `AGENTS.md` and these docs, and **override any skill suggestion**. Where a skill would continue past a gate, stop at the gate.
- The skills' "plain words, no dashes" output style applies to the files they generate (`docs/specs`, `docs/scope`, `docs/reviews`). Project documentation keeps the existing style.
- `/develop` gates on a spec. For this project, a milestone's spec is produced by `/architect` at milestone open and links back to the brief and ADRs.

Verification:

1. `npx skills list` shows all nine skills under "Project Skills", with agents Claude Code and Codex.
2. Claude Code: start a session in the repo; the nine skills appear in the available-skills list and run as `/architect`, `/develop`, and so on.
3. Codex: start `codex` in the repo and confirm the skills appear in its skill list (repository skills are read from `.agents/skills`). **Not yet verified inside Codex by the agent**, because only the CLI install was run here.
4. Restore on a fresh clone: `npx skills@latest experimental_install` (from `skills-lock.json`).

Prerequisites: Node and npx; network access to GitHub for install or update. The skills run with full agent permissions, so review updates (`npx skills update`) before accepting them.

`.claude/skills/`, `.agents/skills/`, and `skills-lock.json` are committed so every clone and both agents get the same skills. `.claude/settings.local.json` stays uncommitted (personal permissions).

## Nested agent instructions

- [src/app/api/AGENTS.md](../../src/app/api/AGENTS.md): Route Handler rules (added in M4).
- Planned: `tests/integration/reservations/AGENTS.md` (concurrency test conventions), created by `/sync` in M6, with a sibling `CLAUDE.md` containing `@AGENTS.md`.

## Tool-specific notes

- **Claude Code**: `CLAUDE.md` imports `AGENTS.md`. Use plan mode for Stage 1 of every task and for milestone open. Project memory may hold local environment facts; it must never contradict these docs.
- **Codex**: reads `AGENTS.md` directly. Keep instructions in `AGENTS.md`, not in tool-specific files.
- **Both**: `next dev` re-adds its managed block at the top of `AGENTS.md`. Never edit inside it; add project rules after it.
