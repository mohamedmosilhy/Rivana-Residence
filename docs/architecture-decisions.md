# Architecture decisions

ADRs record decisions that materially shape Rivana. Status is **Accepted for Phase 1** unless superseded by a later ADR. Exact dependency patches are locked when Phase 1 begins.

| ADR | Decision |
| --- | --- |
| [001](./adr/001-nextjs-app-router.md) | Next.js App Router modular monolith |
| [002](./adr/002-postgresql.md) | PostgreSQL as system of record |
| [003](./adr/003-prisma.md) | Prisma isolated in infrastructure |
| [004](./adr/004-authentication.md) | Better Auth with closed database-backed admin sessions |
| [005](./adr/005-media-storage.md) | Persistent local media storage behind `MediaStorage` |
| [006](./adr/006-content-architecture.md) | Typed, allowlisted sections plus structured entities |
| [007](./adr/007-admin-architecture.md) | Admin route group in the same Next.js app |
| [008](./adr/008-booking-boundary.md) | Disabled booking adapter until provider contract exists |
| [009](./adr/009-server-components.md) | Server Components by default; narrow client islands |
| [010](./adr/010-styling-design-system.md) | Tailwind and semantic CSS tokens; selective shadcn/ui |
| [011](./adr/011-deployment.md) | Hosting.com/cPanel Node deployment with portable adapters |
| [012](./adr/012-motion-library.md) | Motion (Framer Motion) for public animation; CSS for first paint; View Transitions for page morphs (Phase 9) |

Cross-cutting consequences:

- one codebase and deployment, with enforceable internal module boundaries;
- provider SDKs do not leak into domain or presentation;
- editors get bounded flexibility instead of an unrestricted page builder;
- the initial product cannot accidentally become a booking system;
- public output is server-first and cacheable while admin remains dynamic;
- moving from Hosting.com, local media storage, Better Auth, or Prisma is localized to infrastructure/composition work rather than page rewrites.
