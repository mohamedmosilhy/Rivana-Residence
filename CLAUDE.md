# CLAUDE.md

This project's context for all AI tools lives in [AGENTS.md](./AGENTS.md). Claude Code loads it via the import below. Keep project rules there, not here.

@AGENTS.md

## Claude Code specifics

- The non-negotiables, restated because they matter most: **Next.js is the only application framework** (no NestJS, Express, or Fastify). REST APIs are **Route Handlers under `src/app/api/v1`**, kept thin. **Business logic stays in `src/domain` and `src/application`**. **Server Actions never replace the reservation REST API**. Server-only code stays out of client bundles. Authorization and branch scope are enforced on the server. Reservation consistency is protected by **PostgreSQL transactions, locks, and constraints**. Follow `docs/architecture/dependency-rules.md`. Docs and tests ship with every change.
- Skills are in `.claude/skills/` (same content as `.agents/skills/`). Workflow and verification: `docs/engineering/agent-workflow.md`.
- Follow the task-based workflow in `docs/engineering/agent-workflow.md`: plan mode for every task's planning stage, stop for approval of the plan, stop again with the review package for acceptance. Never start the next task or milestone without approval.
- Local environment facts (Postgres.app on 5432, test database names, Playwright quirks) may live in Claude's project memory. If memory and the docs disagree, the docs win, and memory should be corrected.
