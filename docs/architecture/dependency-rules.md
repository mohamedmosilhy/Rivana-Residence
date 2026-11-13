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
| D-1a | `src/domain/**` performs no Node I/O (`node:fs`, `node:crypto`, network) | Enforced since M4 (ESLint: `node:*` and Node built-ins banned in `src/domain`) |
| D-2 | `src/application/**` imports only domain, the ports (`@/application/<module>/ports`) and public files of other application modules, and `src/application/shared`. It has no composition, infrastructure, presentation, or `next/*` | Enforced today |
| D-3 | `src/presentation/**` never imports infrastructure, composition, or `lib/env/server` | Enforced today |
| D-4 | `src/app/**` never imports infrastructure directly; it uses `src/composition` | Enforced today |
| D-5 | Prisma, `pg`, and `src/generated/prisma` are imported only under `src/infrastructure/db/**` | Enforced today |
| D-6 | Every file under `src/infrastructure/db` starts with `import "server-only";` | Enforced today |
| D-7 | `src/contracts/**` imports only `zod` (no domain, application, or Node), so it is safe in client bundles | Enforced since M4 (ESLint on `src/contracts` plus `tests/unit/architecture/module-boundaries.test.ts`) |
| D-8 | `src/domain/<module>` and `src/application/<module>` import other modules only through the target's top-level public files (`index.ts` or listed ports), never deep internals. Reporting imports no domain module | Enforced since M4 for the reservation-era modules (`branches`, `audit`, `health`, and the planned `inventory`, `pricing`, `reservations`, `guests`, `reporting`, `notifications`): ESLint patterns plus `module-boundaries.test.ts`. The older CMS modules have no `index.ts` and are not covered |
| D-9 | Reservation SQL (raw or Prisma) lives only in `src/infrastructure/db/prisma/repositories/reservations/**` and `…/reporting/**` | Enforced since M4 (`persistence-boundaries.test.ts`, model list in `tests/support/reservation-models.ts`) |
| D-10 | Route Handlers under `src/app/api/v1/**/route.ts` stay thin: they parse input, call one use case, and map the result. Size heuristic: a handler file over 60 lines fails review | Enforced since M4 (`route-handlers.test.ts`: wrapper-built exports, no infrastructure or Prisma imports, 60 lines at most) plus review |
| D-11 | No Server Action under `src/app` calls a reservation mutation use case unless an ADR records the exception | Enforced since M4 (`module-boundaries.test.ts`; the allow list is empty) |
| D-12 | Replace the `booking scope` test (forbidden schema words) with a test that reservation models are referenced only by allowed infrastructure folders | Done in M4: the `booking scope` test is replaced by the D-9 test, and the schema integration test checks that no reservation table exists before its milestone |
| D-13 | Client Components (`"use client"`) import neither `server-only` modules nor `src/application/**` code that could pull server code | Enforced in part (D-3); the client-component extension is not yet automated (not in the M4 brief) |
| D-14 | Payment provider code (Paymob SDKs, payload types, HMAC secrets) lives only in `src/infrastructure/payments/**`; the application sees the `PaymentGateway` port only | Enforce in M9 (ESLint pattern and architecture test) |

## Practical guidance

- Need a new dependency between modules? Add a port in the application module that owns that capability and implement it in infrastructure. Use cases of other modules import that port, never the repository implementation.
- Where does a port live? In the application module that owns the thing it describes (a repository next to the use cases that manage that data, a provider next to the feature that needs it): `src/application/<module>/ports.ts` (for example `content`, `media`, `settings`, `enquiries`, `admin`, `booking`, `cache` as well as the reservation-era modules). Other code imports it from `@/application/<module>/ports`. Only ports and types that many modules share live outside a module, all in `src/application/shared/`: `Clock` and `IdGenerator` (`providers.ts`), `Actor`, `PageRequest` and `PagedResult`, and `Result`. There is no `src/application/ports/` folder. Module port files never import another module's port file; the shared folder is the only common ground. `tests/unit/architecture/ports-layout.test.ts` enforces this (M8-T0).
- Need a framework feature (cookies, headers) in a use case? Pass the value in as an argument from the handler.
- Need the time? Inject `Clock`. Need randomness? Inject `SecureTokenGenerator` or `IdGenerator`.
- Shared helpers go in the narrowest shared folder (`src/domain/shared`, `src/application/shared`) and only when at least two modules use them for the same reason.
