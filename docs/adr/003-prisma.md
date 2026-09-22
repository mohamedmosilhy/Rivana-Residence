# ADR 003 — Prisma ORM behind repositories

Status: Accepted for Phase 1

## Context

The team needs reviewed migrations and type-safe access, but the domain and UI must not couple to a database library. As of September 2026, Prisma 7 is stable/supported while Prisma 8 remains release-candidate software.

## Decision

Use Prisma ORM 7 with its PostgreSQL driver adapter. Import Prisma only inside infrastructure/composition modules and map results to domain/application DTOs.

## Reasoning

Prisma provides productive schema/migration tooling and typed queries. Repository ports prevent Prisma payloads, errors, and query choices from becoming application contracts.

## Alternatives considered

- **Prisma directly in Server Components:** fastest initially, but creates the exact coupling the project prohibits.
- **Drizzle:** lean and SQL-forward, but Prisma is explicitly requested and meets the project need.
- **Raw SQL:** maximum control but more mapping/migration work for a modest CMS.
- **Prisma 8 RC:** not acceptable for the first production baseline.

## Consequences

There is deliberate mapping/repository code. Complex constraints may require reviewed SQL in migrations. Prisma client lifecycle and pooled/direct connection URLs must match deployment. Upgrading ORM versions is concentrated in infrastructure.
