# Dependency rules

Authoritative architecture boundaries for humans and coding agents. **Enforced today** marks rules that `eslint.config.mjs` or the architecture tests already check. **Enforce in M4** marks rules to add when the reservation foundation lands.

## Layer direction

```text
src/app (routes, Route Handlers, Server Actions)  ─┐
src/presentation (components, typed API client)    ─┼─> src/application ─> src/domain
src/composition (wiring)  ─> src/infrastructure ───┘        ^ ports implemented by infrastructure
src/contracts (HTTP DTO Zod schemas) <─ src/app, src/presentation
```

| # | Rule | Status |
| --- | --- | --- |
| D-1 | `src/domain/**` imports nothing from application, composition, infrastructure, presentation, `next/*`, or `react`, and no Prisma or `pg` | Enforced today (ESLint + persistence-boundaries test) |
| D-1a | `src/domain/**` performs no Node I/O (`node:fs`, `node:crypto`, network) | Convention today; enforce in M4 by adding `node:*` to the domain ESLint pattern |
| D-2 | `src/application/**` imports only domain and its own ports. It has no composition, infrastructure, presentation, or `next/*` | Enforced today |
| D-3 | `src/presentation/**` never imports infrastructure, composition, or `lib/env/server` | Enforced today |
| D-4 | `src/app/**` never imports infrastructure directly; it uses `src/composition` | Enforced today |
| D-5 | Prisma, `pg`, and `src/generated/prisma` are imported only under `src/infrastructure/db/**` | Enforced today |
| D-6 | Every file under `src/infrastructure/db` starts with `import "server-only";` | Enforced today |
| D-7 | `src/contracts/**` imports only `zod` (no domain, application, or Node), so it is safe in client bundles | Enforce in M4 |
| D-8 | `src/domain/<module>` and `src/application/<module>` import other modules only through the target's top-level public files (`index.ts` or listed ports), never deep internals. Reporting imports no domain module | Enforce in M4 (ESLint patterns per module) |
| D-9 | Reservation SQL (raw or Prisma) lives only in `src/infrastructure/db/prisma/repositories/reservations/**` and `…/reporting/**` | Enforce in M4 (architecture test) |
| D-10 | Route Handlers under `src/app/api/v1/**/route.ts` stay thin: they parse input, call one use case, and map the result. Size heuristic: a handler file over 60 lines fails review | Review checklist (plus an architecture test warning) |
| D-11 | No Server Action under `src/app` calls a reservation mutation use case unless an ADR records the exception | Enforce in M4 (architecture test listing allowed actions) |
| D-12 | Replace the `booking scope` test (forbidden schema words) with a test that reservation models are referenced only by allowed infrastructure folders | M4 |
| D-13 | Client Components (`"use client"`) import neither `server-only` modules nor `src/application/**` code that could pull server code | Enforced today in part (D-3); extend in M4 |

## Practical guidance

- Need a new dependency between modules? Add a port in the consuming module's application layer and implement it in infrastructure. Do not import the other module's repository.
- Need a framework feature (cookies, headers) in a use case? Pass the value in as an argument from the handler.
- Need the time? Inject `Clock`. Need randomness? Inject `SecureTokenGenerator` or `IdGenerator`.
- Shared helpers go in the narrowest shared folder (`src/domain/shared`, `src/application/shared`) and only when at least two modules use them for the same reason.
