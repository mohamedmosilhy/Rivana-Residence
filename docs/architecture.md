# Architecture

## System shape

Use one deployable Next.js application with two route surfaces:

```text
Browser
  ├─ Public App Router pages ──> application queries ──> repository ports
  └─ Protected admin pages/actions ──> application commands ──> repository ports
                                                     ├─ Prisma/PostgreSQL adapters
                                                     ├─ S3-compatible media adapter
                                                     ├─ email delivery adapter
                                                     └─ disabled booking adapter
```

This is a modular monolith. A separate CMS or admin application would add deployment, authentication, schema, and design-system duplication without a current business need. Module boundaries are enforced in source, not by extra services.

## Dependency rule

Dependencies point inward:

```text
presentation -> application -> domain
infrastructure --------^ implements application/domain ports
```

- **Domain:** content concepts, value rules, and provider-neutral types. No Next.js, React, Prisma, storage SDK, or HTTP imports.
- **Application:** use cases, DTOs, authorization requirements, transaction boundaries, and ports such as `RoomRepository`, `MediaStorage`, `ContactDelivery`, and `BookingProvider`.
- **Infrastructure:** Prisma repository implementations, PostgreSQL transactions, object-storage client, email provider, Better Auth integration, and cache invalidation bridge.
- **Presentation:** App Router pages/layouts, Server Components, Client Components, server actions, route handlers, and view mapping.

Pragmatism rule: a module earns separate domain/application files when it has invariants or replaceable infrastructure. Pure static presentational mapping does not need ceremonial classes.

## Proposed source tree

```text
src/
  app/
    (marketing)/
      layout.tsx
      page.tsx
      about/page.tsx
      rooms/page.tsx
      rooms/[slug]/page.tsx
      facilities/page.tsx
      facilities/[slug]/page.tsx
      contact/page.tsx
    admin/
      login/page.tsx
      (protected)/
        layout.tsx
        page.tsx
        pages/[key]/page.tsx
        rooms/...
        facilities/...
        media/page.tsx
        enquiries/page.tsx
        settings/page.tsx
    api/
      auth/[...all]/route.ts
      media/uploads/route.ts
    sitemap.ts
    robots.ts
    layout.tsx
  domain/
    content/
    rooms/
    facilities/
    media/
    enquiries/
    shared/
  application/
    auth/
    content/
    rooms/
    facilities/
    media/
    enquiries/
    booking/
    ports/
  infrastructure/
    auth/
    db/prisma/
      repositories/
      mappers/
    media/
    email/
    booking/
    cache/
  presentation/
    ui/
    design/
    features/
    admin/
  lib/
    env.ts
    result.ts
    logger.ts
prisma/
  schema.prisma
  migrations/
  seed.ts
public/
  static/
tests/
  unit/
  integration/
  e2e/
```

Generated Prisma client code belongs in a generated directory and is imported only by infrastructure/composition code. `server-only` guards protect modules that must never enter the browser bundle.

## Request and mutation paths

### Public read

1. A Server Component calls an application query.
2. The query uses a repository interface and returns a view-safe DTO.
3. The Prisma adapter maps database records into the DTO/domain representation.
4. The route renders HTML on the server and may cache the result under content tags.
5. Client islands add only menu, gallery, lightbox, and motion behavior.

### Admin mutation

1. A client or server-rendered form submits to a Server Action.
2. The action verifies the current session and role again; UI protection is never sufficient.
3. Zod parses `FormData` into a command.
4. An application use case enforces invariants and invokes a repository transaction.
5. On success, relevant cache tags/paths are invalidated and a typed result returns to the form.

Use Route Handlers only where HTTP is the real boundary: Better Auth, direct-upload signing/completion, future provider callbacks, and possibly contact spam verification. Do not create internal REST endpoints for Server Components to call.

## Server and Client Components

Server Components:

- all marketing route shells and content reads;
- room/facility lists and details;
- metadata generation and JSON-LD;
- admin list/detail page data loading;
- authentication-aware admin navigation.

Client Components only where browser state/events are required:

- mobile navigation and accessible submenu behavior;
- gallery carousel/lightbox and pointer gestures;
- reduced-motion-aware reveal wrapper if CSS alone is insufficient;
- React Hook Form admin forms with repeatable fields and unsaved-change feedback;
- direct upload progress, replacement, and media selection dialogs;
- destructive confirmation dialogs and toasts.

Client components receive serializable DTOs, not database records or Prisma types.

## Data and provider boundaries

- `RoomRepository`, `FacilityRepository`, `PageRepository`, `SettingsRepository`, `MediaRepository`, and `EnquiryRepository` hide Prisma.
- `MediaStorage` exposes create-upload, finalize, delete-object, and public-URL operations without S3/R2 types.
- `ContactDelivery` sends notifications independently of enquiry persistence.
- `BookingProvider` reports whether booking is enabled and produces a provider-neutral launch descriptor. Initial implementation is `DisabledBookingProvider`.
- `Clock` and ID generation may be injected in logic that needs deterministic tests; ordinary display formatting need not be abstracted.

## Caching and publication

- Published public content can use Next.js cache tags such as `site-settings`, `page:home`, `rooms`, `room:{slug}`, `facilities`, and `facility:{slug}`.
- Admin views are uncached/dynamic.
- Successful mutations invalidate only their entity/list tags plus sitemap when publication or slug changes.
- Draft/unpublished records never appear in public queries.
- Avoid an all-purpose global cache flush except for rare site-wide settings changes.

## Error handling

- Expected validation/conflict/not-found outcomes return typed application results.
- Unexpected infrastructure failures are logged server-side with a request correlation ID and show a safe generic message.
- Public missing content uses `notFound()`.
- Storage finalization is idempotent; abandoned pending uploads are cleaned by a scheduled job.
- Database record creation and object upload cannot be one atomic transaction, so the media workflow uses explicit `PENDING`, `READY`, and `FAILED` states.

## Technology baseline

- Next.js 16.3 Active LTS / React 19.2: full-stack App Router, Server Components, metadata, image optimization, and route handlers.
- Node.js 22 LTS: compatible with Prisma 7 and widely supported by managed platforms.
- TypeScript 5.9+: strict project contracts and Prisma 7 compatibility.
- PostgreSQL 18.6, with 17.11 as a managed-provider fallback: relational integrity and hosting portability.
- Prisma ORM 7.10: migrations/type-safe adapter, isolated in infrastructure.
- Better Auth 1.7.3: closed email/password admin accounts and database sessions.
- Tailwind CSS 4.3 plus CSS custom-property tokens; shadcn/ui only for suitable admin/accessibility primitives.
- Zod at every external input/config boundary.
- React Hook Form for complex/repeatable admin forms, not simple server-native forms.

Exact patches are locked in Phase 1 after compatibility checks. Preview/RC dependencies are prohibited for the initial production baseline.
