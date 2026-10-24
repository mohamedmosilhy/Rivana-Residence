# Agent workflow (Claude Code and OpenAI Codex)

How coding agents (and humans) plan, implement, test, review, and report work on Rivana. Shared rules live in [../AGENTS.md](../../AGENTS.md), which both tools read. `CLAUDE.md` imports it for Claude Code.

## The loop for every non-trivial change

1. **Read**: `AGENTS.md`, [engineering-standards.md](./engineering-standards.md), [architecture/dependency-rules.md](../architecture/dependency-rules.md), the milestone in [delivery/roadmap.md](../delivery/roadmap.md), and the relevant domain, API, and database docs. For Next.js APIs, read the matching guide in `node_modules/next/dist/docs/` (Next 16 differs from training data).
2. **Inspect**: the existing code and tests in the area. Reuse before adding.
3. **Identify**: the requirement ids and acceptance criteria (traceability matrix). If a load-bearing decision is unresolved (security, data integrity, business behavior), stop and ask; see [requirements/assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md).
4. **Plan**: a short plan listing files, migrations, endpoints, and tests. For a milestone, write it in the milestone evidence doc first.
5. **Implement**: minimal, coherent changes within the milestone's scope only. Preserve unrelated user changes; check `git status` before and after.
6. **Test**: add or update unit, integration, and E2E tests with the code.
7. **Run gates**: those in [testing/quality-gates.md](../testing/quality-gates.md#commands). Record exact commands and counts.
8. **Document**: update docs whose behavior changed. Mark planned versus implemented accurately.
9. **Review the diff**: look for unintended changes, debug code, secrets, and formatting churn.
10. **Report**: changed files, decisions, commands and results, limitations, and remaining work. State explicitly that the next milestone has not started.

Never claim a check passed if it was not run. Never mark blocked work complete.

## Agent skills (JavaScript Mastery)

Source: `JavaScript-Mastery-Pro/skills` on GitHub, installed with the `skills` CLI (`npx skills@latest add JavaScript-Mastery-Pro/skills`). The lock file `skills-lock.json` pins each skill's content hash.

| Location | Agent | Installed |
| --- | --- | --- |
| `.claude/skills/<name>/` | Claude Code | 2026-10-24 01:15, already present when this setup started (the user's `-a claude-code` install) |
| `.agents/skills/<name>/` | Codex (also read by Cursor and GitHub Copilot, per `npx skills list`) | 2026-10-24 (`-a codex -s '*' --copy`) |

Both copies were verified identical (`diff -r`). Each skill ships `SKILL.md` (both tools) and `agents/openai.yaml` (Codex picker metadata).

| Skill | Purpose | Frontend/backend | Use on Rivana |
| --- | --- | --- | --- |
| `scope` | Living feature scope in `docs/scope/` | Both | Optional: enroll M4–M12 as scope features after approval, so `/develop` can find them |
| `architect` | Decision discovery; writes `docs/specs/NNNN-*.md` | Both | Per milestone, turn the approved design docs into a build spec. It must cite, not contradict, the ADRs |
| `audit` | Bootstraps or gap-fills `AGENTS.md` | Both | Run in gap-fill mode only; never let it overwrite curated `AGENTS.md` text |
| `develop` | Builds from a spec (UI track `ui-guide.md`, logic track `logical-guide.md`) | Both | Implementation per milestone |
| `test` | Writes tests for uncommitted changes (`test-preferences.json`) | Both | After each build step. Preferences: Vitest, Playwright, the existing `tests/` layout |
| `check` | `verify` drives the app; `review` is a fresh-model code review into `docs/reviews/` | Both | Before marking a milestone ready |
| `debug` | Root-cause loop | Both | Failing tests or regressions |
| `sync` | Updates `AGENTS.md` and scope after a change | Both | After merge |
| `document` | PR text, changelog, release notes, postmortems | Both | PR descriptions |

How the skills relate to project rules:

- The skills are general workflow skills, not framework-specific. Project rules (Next.js-only, REST through Route Handlers, layered modules, DB-backed consistency) come from `AGENTS.md` and these docs, and **override any skill suggestion**.
- The skills' "plain words, no dashes" output style applies to the files they generate (`docs/specs`, `docs/scope`, `docs/reviews`). Project documentation keeps the existing style.
- `/develop` gates on a spec. For this project, a milestone's spec is produced by `/architect` from the approved docs here, and links back to them.

Verification:

1. `npx skills list` shows all nine skills under "Project Skills", with agents Claude Code and Codex.
2. Claude Code: start a session in the repo; the nine skills appear in the available-skills list and run as `/architect`, `/develop`, and so on.
3. Codex: start `codex` in the repo and confirm the skills appear in its skill list (repository skills are read from `.agents/skills`). **Not yet verified inside Codex by the agent**, because only the CLI install was run here.
4. Restore on a fresh clone: `npx skills@latest experimental_install` (from `skills-lock.json`).

Prerequisites: Node and npx; network access to GitHub for install or update. The skills run with full agent permissions, so review updates (`npx skills update`) before accepting them.

Should these be committed? Recommended: commit `.claude/skills/`, `.agents/skills/`, and `skills-lock.json` so every clone and both agents get the same skills. Keep `.claude/settings.local.json` uncommitted (personal permissions).

## Nested agent instructions

None yet. Add `src/app/api/AGENTS.md` (Route Handler rules) and `tests/integration/reservations/AGENTS.md` (concurrency test conventions) when those folders are created in M4/M6, each with a sibling `CLAUDE.md` containing `@AGENTS.md`.

## Tool-specific notes

- **Claude Code**: `CLAUDE.md` imports `AGENTS.md`. Use plan mode for milestones. Project memory may hold local environment facts; it must never contradict these docs.
- **Codex**: reads `AGENTS.md` directly. Keep instructions in `AGENTS.md`, not in tool-specific files.
- **Both**: `next dev` re-adds its managed block (between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->`) at the top of `AGENTS.md`. Never edit inside those markers; add project rules after them.
