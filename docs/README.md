# Rivana Residence production documentation

This directory began as the Phase 0 blueprint for rebuilding Rivana Residence as a production marketing website and content-management system. Phase 0 is approved, and the Phase 1 application foundation is now ready for review.

The source of truth for the visual audit is `../design/`. The legacy WordPress export in the parent workspace was treated only as content and asset provenance. Its plugin/theme architecture will not be migrated.

## Product boundary

Rivana is a hospitality marketing site. It owns brand, editorial content, rooms as marketing records, facilities, media, contact details, promotion-code advertising, enquiries, and search visibility. It does **not** own rates, inventory, availability, stays, guests, payments, reservations, promotion validation/redemption, or booking management.

Every Book Now control initially renders as a visually complete, disabled/inert control with accessible explanatory text. The future hotel-management provider enters through the boundary in [booking-integration.md](./booking-integration.md).

## Document map

| Document | Purpose |
| --- | --- |
| [requirements.md](./requirements.md) | Scope, actors, functional requirements, exclusions, and acceptance criteria |
| [architecture.md](./architecture.md) | Runtime architecture, dependency rules, server/client split, and proposed source tree |
| [architecture-decisions.md](./architecture-decisions.md) | ADR index and decision summary |
| [domain-model.md](./domain-model.md) | Domain concepts, invariants, ports, and use cases |
| [database.md](./database.md) | PostgreSQL/Prisma data model, relationships, constraints, and indexes |
| [content-model.md](./content-model.md) | Structured page sections and CMS editing rules |
| [design-system.md](./design-system.md) | Reference audit and production design tokens |
| [component-architecture.md](./component-architecture.md) | UI primitives, design components, feature components, and page composition |
| [booking-integration.md](./booking-integration.md) | Explicit external reservation boundary and future extension path |
| [promotions.md](./promotions.md) | Promotion-code admin, public popup, scheduling, and reservation handoff boundary |
| [admin-dashboard.md](./admin-dashboard.md) | Admin information architecture and workflows |
| [security.md](./security.md) | Authentication, authorization, validation, uploads, and operational controls |
| [seo.md](./seo.md) | Metadata, crawlability, structured data, and editorial SEO |
| [performance.md](./performance.md) | Image, rendering, caching, JavaScript, and Core Web Vitals strategy |
| [testing.md](./testing.md) | Unit, integration, E2E, accessibility, and visual testing |
| [deployment.md](./deployment.md) | Environments, infrastructure, migration, backups, and release process |
| [hosting-preflight.md](./hosting-preflight.md) | Read-only cPanel capability check, confirmed features, and deployment blockers |
| [roadmap.md](./roadmap.md) | Phase-by-phase implementation plan and completion gates |
| [phase-1-foundation.md](./phase-1-foundation.md) | Phase 1 implementation, verification, screenshots, limitations, and acceptance evidence |

## Current technical baseline

The Phase 1 target is Next.js 16.3.3 Active LTS with React 19.2, TypeScript 5.9+, Tailwind CSS 4.3, PostgreSQL 18.6 (17.11 is an acceptable managed-provider fallback), Prisma ORM 7.10, Better Auth 1.7.3, Zod, React Hook Form where interactive client forms justify it, and selected shadcn/ui source components. Exact compatible patches will be rechecked and locked when Phase 1 starts. Prisma 8 is still a release candidate as of this plan and is intentionally excluded.

## Reference audit summary

Inspected:

- all nine supplied HTML pages;
- both CSS files and both JavaScript files;
- all 42 supplied raster images, five local fonts, logo variants, dimensions, and usage;
- the supplied design, design-system, and animation specifications;
- the legacy WordPress tree at inventory level to distinguish authored content from vendor/plugin code.

The retained identity is deep plum (`#652A4C`), warm gold (`#DBAF71`), editorial Marcellus display type, restrained Jost body type, square-edged property imagery, generous whitespace, and subtle entrance motion. Production work must replace placeholder facility copy, verify image rights, create distinct galleries for each room, and remove all reference-only prices and fake calendars.

## Status

Phase 0 documentation was approved by the client on 2026-09-25. Phase 1 is implemented and `Ready for review`. Phase 2 has not started.
