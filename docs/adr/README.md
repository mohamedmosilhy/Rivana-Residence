# Architecture decisions

ADRs record the decisions that materially shape Rivana, in one numbered sequence. A decision stays in force until a later ADR supersedes it. An overview of how the decisions fit together is in [../architecture/overview.md](../architecture/overview.md#decision-map).

| ADR | Decision | Status |
| --- | --- | --- |
| [001](./001-nextjs-app-router.md) | Next.js App Router modular monolith | Accepted |
| [002](./002-postgresql.md) | PostgreSQL as system of record | Accepted |
| [003](./003-prisma.md) | Prisma isolated in infrastructure | Accepted |
| [004](./004-authentication.md) | Better Auth with closed, database-backed staff sessions | Accepted |
| [005](./005-media-storage.md) | Persistent local media storage behind `MediaStorage` | Accepted |
| [006](./006-content-architecture.md) | Typed, allowlisted page sections plus structured entities | Accepted; extended by 026 |
| [007](./007-admin-architecture.md) | Staff dashboard as a route group in the same Next.js app | Accepted |
| [008](./008-booking-boundary.md) | Disabled booking adapter until a provider contract exists | Superseded by 013 |
| [009](./009-server-components.md) | Server Components by default; narrow client islands | Accepted |
| [010](./010-styling-design-system.md) | Tailwind and semantic CSS tokens; selective shadcn/ui | Accepted |
| [011](./011-deployment.md) | Hosting.com/cPanel Node deployment with portable adapters | Superseded by 023 |
| [012](./012-motion-library.md) | Motion for public animation; CSS for first paint; View Transitions for page morphs | Accepted |
| [013](./013-self-managed-reservations.md) | Self-managed reservations; manual PMS synchronization; integration port without an adapter | Accepted (business direction, 2026-10-24); amended by 024 |
| [014](./014-rest-api-route-handlers.md) | Versioned REST API through Next.js Route Handlers; problem+json; OpenAPI from Zod | Accepted 2026-10-24 |
| [015](./015-reservation-module-structure.md) | New modules inside the layered source tree; `src/contracts`; unit of work | Accepted 2026-10-24 |
| [016](./016-inventory-and-concurrency.md) | Room-type inventory; row lock plus count in one transaction; exclusion constraint for room assignment | Accepted 2026-10-24; extended by 025, 027 |
| [017](./017-multi-branch-data-ownership.md) | Branch-owned room types, inventory, prices, and reservations; composite FKs | Accepted 2026-10-24; extended by 026 |
| [018](./018-staff-roles-and-branch-scope.md) | Receptionist and Manager roles; capabilities plus branch assignments | Accepted 2026-10-24; capabilities extended by 024–028 |
| [019](./019-guest-reservation-access.md) | Verified phone profiles (WhatsApp code), blocking, and guest access without accounts | Accepted 2026-10-24; amended by 024, 028 |
| [020](./020-dates-timezones-money.md) | Date-only stays, branch time zone, money in US dollars as integer cents | Accepted 2026-10-24; amended by 027 |
| [021](./021-reservation-testing-strategy.md) | Real-database integration and concurrency tests | Accepted 2026-10-24 |
| [022](./022-deployment-transaction-compatibility.md) | Transaction-scoped primitives only; PostgreSQL provider requirements | Accepted 2026-10-24 |
| [023](./023-hostinger-vps-deployment.md) | Hostinger VPS: Node under systemd, Nginx, PostgreSQL 17+, local media | Accepted 2026-10-24 (supersedes 011) |
| [024](./024-immediate-confirmation.md) | Immediate confirmation of website reservations; `PENDING`/`DECLINED` removed; cancellation requests; PMS-entry tracking | Accepted 2026-11-06 (supersedes request to book; amends 013, 019) |
| [025](./025-paymob-online-payment.md) | Online payment through Paymob hosted checkout; 15-minute payment holds; verified callbacks; refunds | Accepted 2026-11-06 (extends 016, 024) |
| [026](./026-branch-websites-and-accommodation.md) | Branch-owned websites at `/{branchSlug}/…`; rooms and apartments in one catalog; per-branch maps | Accepted 2026-11-06 (extends 006, 017) |
| [027](./027-booking-price-composition.md) | Price composition: date prices, services, coupons, VAT; promotion popup retired | Accepted 2026-11-06 (amends 020) |
| [028](./028-whatsapp-guest-messaging.md) | WhatsApp confirmations, feedback requests, consented marketing broadcasts; Admin-managed number, templates, and test message | Accepted 2026-11-06 (extends 019) |

Consequences that run through all of them:

- one codebase and deployment, with enforceable internal module boundaries;
- provider SDKs do not leak into domain or presentation;
- editors get bounded flexibility instead of an unrestricted page builder;
- public output is server-first and cacheable, while the dashboard, availability, and the API stay dynamic;
- reservation consistency is guaranteed by PostgreSQL, not by application memory;
- a reservation is confirmed only when Rivana's database holds its inventory and, for online payment, when a verified payment result has arrived; confirmation never claims anything about the hotel's separate system;
- moving away from the Hostinger VPS, local media storage, Better Auth, or Prisma is localized to infrastructure and composition work rather than page rewrites.
