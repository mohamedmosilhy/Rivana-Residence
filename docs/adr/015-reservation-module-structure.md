# ADR 015 — Reservation modules inside the existing layered source tree

Status: **Accepted** (2026-10-24)

## Context

The repository already uses clean-architecture layers at the top level: `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`, `src/composition`, and `src/app`. Each layer has per-area subfolders (`domain/rooms`, `application/content`, …). ESLint `no-restricted-imports` rules and `tests/unit/architecture/persistence-boundaries.test.ts` enforce the layer direction by path. The reservation prompt suggests a module-first tree (`src/modules/<module>/{domain,application,infrastructure}`).

## Problem

Where do the new modules go, and how are their boundaries enforced?

## Options considered

1. **Module-first** `src/modules/reservations/{domain,application,infrastructure}`. Good cohesion, but then the repo has two conventions. Every ESLint boundary rule and architecture test would need duplicating for a second tree, or the existing CMS code would need moving, which is a large refactor of accepted code.
2. **Workspace packages** (`packages/reservations`). Strong boundaries, but adds build tooling. Not justified for one app.
3. **Continue the layer-first tree** with a subfolder per module in each layer, and add cross-module rules.

## Decision

Option 3. New modules: `branches`, `inventory`, `pricing`, `reservations`, `guests`, `reporting`, `audit`, `notifications`. Each appears only in the layers it needs (reporting has no domain folder, for example). Additions:

- `src/contracts/api/v1/` holds HTTP DTO schemas (Zod only, no other imports). It may be imported by `src/app` and `src/presentation`. It is not imported by domain or application code, which keep their own command types.
- `src/app/api/v1/**/route.ts` are thin handlers. `src/app/api/v1/_http/` holds the shared HTTP plumbing.
- Each module's application layer exposes its public use cases. Another module may call those use cases or the module's ports. It may not import the other module's infrastructure or reach into its tables. Repositories for reservation data live only in `src/infrastructure/db/prisma/repositories/reservations/…`.
- Multi-step writes use a `UnitOfWork` port. The application asks for a transaction and receives transaction-bound repositories, so the booking workflow (lock, count, insert, audit, outbox) is one database transaction. The business decisions in it stay in domain and application code, not in SQL.

The rules are listed in [dependency-rules.md](../architecture/dependency-rules.md) and enforced in M4 by extending `eslint.config.mjs` and the architecture tests.

## Rationale

One convention for the whole repo. The existing boundary tooling keeps working. Reviewers find reservation code in the same places they find CMS code.

## Consequences

- Module cohesion is spread across layer folders. Mitigation: consistent module subfolder names, and a per-module section in [module-boundaries.md](../architecture/module-boundaries.md).
- New lint rules are needed to stop, for example, `domain/pricing` from importing `domain/reservations`.

## Risks

- Cross-module coupling creeps in through shared DTOs. Mitigation: contracts are HTTP-only; application DTOs are owned per module; a review checklist item.
