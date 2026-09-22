# Implementation roadmap

Each phase ends with a reviewable completion gate. Later phases may be refined, but must preserve the booking boundary.

## Phase 0 — Documentation and architecture

Milestones:

- audit supplied HTML, CSS, JavaScript, fonts, images, and legacy provenance;
- define scope, architecture, domain/database/content models, components, admin, booking boundary, security, SEO, performance, testing, deployment, and ADRs;
- record content gaps and production risks.

Gate: all documents in this directory reviewed; no application code created. **Current status: complete.**

## Phase 1 — Project setup

Milestones:

- create Next.js 16 App Router TypeScript project under the agreed repository root;
- pin current compatible stable patches and lock Node/package-manager versions;
- configure strict TypeScript, ESLint, formatter, Tailwind tokens, selected shadcn primitives, path aliases, and environment validation;
- establish source boundaries, `server-only` guards, CI skeleton, and test runners;
- copy only approved source assets into a migration staging area, not directly into production content.

Gate: clean install, lint/typecheck/test/build pass; blank public/admin shells render; no database feature implementation.

## Phase 2 — Database and domain model

Milestones:

- implement domain/application contracts and DTOs;
- create Prisma 7 PostgreSQL schema and reviewed initial migration;
- implement repository adapters/mappers without Prisma leakage;
- seed settings/page singletons and draft reference content without price/availability;
- add repository/domain integration tests.

Gate: migrations apply from empty database, seed is idempotent, and public queries cannot return drafts.

## Phase 3 — Authentication

Milestones:

- configure Better Auth, Prisma adapter, database sessions, closed sign-up, roles, and bootstrap admin;
- implement `/admin/login`, sign-out, protected route shell, DAL authorization, rate limiting, and session revocation;
- configure password reset after transactional email is available;
- test unauthorized access and role matrix.

Gate: all admin entry points/actions are protected server-side; no default credential remains.

## Phase 4 — Admin dashboard foundation

Milestones:

- build accessible admin shell/navigation and dashboard overview;
- create shared form/action result patterns, toasts, dialogs, tables, empty/error states, and publish controls;
- implement settings and social-link editing;
- add cache invalidation service.

Gate: non-technical user can navigate and update settings with validation/feedback.

## Phase 5 — Content management

Milestones:

- implement room CRUD, features, order, featured state, publication, and SEO;
- implement facility CRUD and publication;
- implement typed Home/About/Contact section editors and registry;
- add preview/public-view links and readiness validation;
- implement enquiries list/archive after contact backend exists.

Gate: editor can manage all non-media content and publish safely; no booking fields exist.

## Phase 6 — Media management

Milestones:

- implement `MediaStorage` plus development and production S3-compatible adapters;
- signed upload/finalization, validation, checksum, metadata, focal point, and cleanup;
- media library/picker, usage inspection, reorder/replace, and safe delete;
- migrate approved reference images and document rights/source.

Gate: upload/replace/delete flows pass adapter, security, and E2E tests; referenced assets cannot be deleted.

## Phase 7 — Public website

Milestones:

- build marketing layout and all required routes with Server Components;
- render structured pages, room/facility listings/details, galleries, contact/map, and footer/header;
- implement contact persistence/delivery and spam controls;
- add shared disabled booking controls at every intended entry point.

Gate: complete responsive content journey works with JavaScript minimized and booking inert.

## Phase 8 — Modern luxury redesign

Milestones:

- apply final token system, fluid typography, editorial compositions, photography crops, brush divider, refined cards/surfaces;
- reconcile design against the reference identity at target viewports;
- replace placeholder/duplicate content and photography with approved assets;
- run contrast, zoom, touch, and content-length QA.

Gate: client approves visual direction and content; no unlicensed/placeholding asset remains.

## Phase 9 — Animations and interactions

Milestones:

- implement header states, accessible menu/submenu, galleries/lightbox, and restrained reveals;
- add loading/pending/error micro-interactions;
- verify keyboard, coarse pointer, and `prefers-reduced-motion` behavior;
- remove any effect that harms clarity or performance.

Gate: interaction QA passes without motion dependency or inaccessible hover-only content.

## Phase 10 — SEO and performance

Milestones:

- metadata, canonicals, OG/Twitter, sitemap, robots, breadcrumbs, Hotel JSON-LD;
- image/font optimization, cache tags/invalidation, database query review, bundle analysis;
- map/third-party lazy loading and Web Vitals instrumentation;
- Lighthouse/per-route budget tuning.

Gate: metadata and structured data validate; performance budgets and Core Web Vitals lab proxies pass.

## Phase 11 — Testing and hardening

Milestones:

- complete domain/application, repository, component, E2E, accessibility, visual, SEO, performance, and security suites;
- verify upload abuse cases, authorization/IDOR, XSS, CSRF/origin, rate limits, and error handling;
- cross-browser/device and content-editor acceptance testing;
- fix release-blocking defects.

Gate: release matrix passes and known residual risks are documented/accepted.

## Phase 12 — Deployment

Milestones:

- provision production/preview database, storage, email, domain, secrets, backups, and monitoring;
- migrate/approve final content;
- deploy with reviewed migrations and enforce CSP/security headers;
- perform restore drill, smoke tests, analytics/Search Console setup if approved, and admin training;
- document operations and rollback.

Gate: production acceptance signed off; support ownership established.

## Phase 13 — Reservation module integration

This phase begins only after the provider supplies documentation/sandbox access.

Milestones:

- review provider contract, privacy/security/CSP/performance/accessibility constraints;
- choose external URL, modal embed, or hosted widget path;
- add minimal provider config and room-code mapping only if required;
- implement one `BookingProvider` adapter and integration-specific UI launcher;
- run sandbox and handoff E2E tests, failure fallback, analytics, and consent review;
- enable gradually after production verification.

Gate: provider is demonstrably the only authority for availability/rates/reservations; the marketing database still stores none of them.

## Dependencies and sequencing notes

- Phase 6 precedes final public visual work because media metadata/focal points affect layout.
- Public route scaffolding can begin while CMS forms mature, but publication contracts must exist first.
- Contact email and password reset share an email adapter but remain separate application use cases.
- Phase 13 cannot be estimated accurately until provider requirements are known.
