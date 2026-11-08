# 8. Code map and M6 preview

```
src/
  app/              routes: (marketing)/[branch]/, admin/(protected)/ (+ actions.ts), api/v1/ (_http wrapper, _dto), media/, sitemap, robots
  presentation/     React components: admin/, design/, site/
  contracts/api/v1/ Zod DTO schemas + openapi.ts
  composition/      only place repos + use cases are built
  application/      use cases per module; ports/, shared/ (Result, rate limit)
  domain/           pure rules per module; shared/ (slug, zoned-time, domain-error)
  infrastructure/   db/prisma (repositories, mappers, transaction, client), auth, cache, email, media, http, ids
  lib/env/          validated env config
  generated/prisma  generated client (do not edit)
  proxy.ts          optimistic auth redirect, headers
prisma/             schema.prisma, migrations/, seeds
scripts/            staff CLI, media tools, openapi generator, backup/restore
tests/              unit/ (domain, application, api, architecture, auth), integration/ (real PG), e2e/ (Playwright), support/
```
Not built yet: `domain/inventory|pricing|reservations`, matching application modules, `repositories/reservations/`, `infrastructure/payments`, staff API beyond branches, `api/v1/reservations`, booking pages, `tests/integration/reservations/`. Leftovers of the old disabled-booking design: `application/booking/resolve-booking.ts`, `infrastructure/booking/disabled-booking-provider.ts` (ADR 008, superseded).

## Where to look
| To understand | Open |
| --- | --- |
| What a feature does | `src/application/<module>/<use-case>.ts` |
| Business rules | `src/domain/<module>/` |
| API shapes | `src/contracts/api/v1/` |
| Wiring | `src/composition/` |
| SQL | `src/infrastructure/db/prisma/repositories/` |
| Who may do it | `src/domain/auth/capabilities.ts` + `authorize(...)` in the use case |
| Architecture enforcement | `tests/unit/architecture/` |
| Schema | `prisma/schema.prisma`, `prisma/migrations/*/migration.sql` |

## M6 tasks (brief: docs/delivery/milestones/m6-inventory-and-availability.md)
| Task | Builds | Risk |
| --- | --- | --- |
| T1 | `LocalDate`, `StayRange`, `Occupancy`, `Money` (pure) | Critical |
| T2 | `AvailabilityCalculator`, `NightlyPriceResolver`, block rules (pure) | Critical |
| T3 | Migration: `PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod`, exclusion constraints | Critical |
| T4 | Unit of work, `InventoryLock`, `InventoryGuard`, concurrency harness | Critical |
| T5 | Units and blocks: repos, use cases, staff API S21-S27 | Critical |
| T6 | Base rates and periods with audit, S30-S34 | Critical |
| T7 | Availability read model + staff grid, S20 | Medium |
| T8 | Public availability P5: rate limit, no cache, minimal disclosure | Medium |
Also: pre-M6 seed-safety repair in `repairs/pre-m6.md`.

## What to check per task
T1/T2 edge cases vs rules (half-open stay, back-to-back, unpriced nights); T3 constraints truly block overlaps; T4 every availability-reducing write takes the lock in sorted order, with timeout and no I/O inside; T5/T6 `authorize` + branch check in the use case, audit event, 404 across branches; T7/T8 minimal public response, rate limited, uncached.

## Suggested next steps
1. Commit and merge the pending audit fixes on `m5-staff-api-fixes` into `main`.
2. Do the pre-M6 repair.
3. Open M6: branch `m6-inventory-and-availability`, `/architect` spec, owner approves spec + task breakdown.
4. Plan mode for M6-T1, owner approves.
