# ADR 021 — Reservation testing against the real database engine

Status: **Accepted** (2026-10-24)

## Context

The repo already has Vitest unit tests (jsdom), Vitest integration tests that drop, recreate, and migrate a real `*_test` PostgreSQL database, and Playwright E2E tests on a disposable `*_e2e_test` database. CI runs PostgreSQL 18. Overselling cannot be proven with mocks.

## Decision

- **Domain unit tests** (no database, no Next.js): `StayRange`, availability arithmetic, price resolution, state machine, reference format, policies, and the capability matrix.
- **Integration tests on real PostgreSQL** for repositories, constraints (composite branch FKs, exclusion constraints, checks), the unit of work, use cases end to end, and Route Handlers invoked directly with `Request` objects (status codes, problem bodies, auth, CSRF, idempotency).
- **Concurrency tests**: a dedicated integration file opens N separate Prisma clients (separate connections). They race to book the last unit, to book while a block is added, and to assign one physical room twice. The tests assert database end state as well as responses. Each scenario runs repeatedly (for example 20 iterations) to shake out timing luck.
- **E2E** (Playwright, Chromium, existing harness): the customer journey, the conflict path, branch isolation, cancellation releasing inventory, receptionist and manager workflows, and access denial.
- The existing gates (`npm run check`, integration, E2E) stay the definition of green. Nothing is marked passing unless it was run.

## Rationale

Reuses the existing harness and tests behavior at the layer where it can fail.

## Consequences

The integration suite grows and must stay under CI's 20-minute job limit. Concurrency tests are tagged so they can be run alone (`vitest run tests/integration/reservations/concurrency.test.ts`).

## Risks

A flaky concurrency test erodes trust. Mitigation: deterministic assertions on final state rather than timing, and failures logged with the competing transaction outcomes.
