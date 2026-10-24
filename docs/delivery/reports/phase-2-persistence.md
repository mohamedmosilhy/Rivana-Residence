# Phase 2 domain and persistence handoff

Status: **Ready for review**  
Completed: 2026-09-25  
Scope: domain rules, application ports, PostgreSQL schema, Prisma repositories, migration, and seed. No CMS screens, authentication flows, or public data rendering.

## Outcome

Phase 2 adds the content domain and the PostgreSQL persistence boundary. Domain and application code are framework-free and have no Prisma imports; Prisma is confined to `src/infrastructure/db/` and the `prisma/` tooling. Every repository write returns a typed `Result` instead of throwing expected database errors. The schema contains no reservation, availability, rate, guest, stay, payment, discount-calculation, or redemption data.

## Decisions made in this phase

| Decision | Choice | Notes |
| --- | --- | --- |
| ID strategy | CUID2 (`@paralleldrive/cuid2` 3.3.0), `VARCHAR(32)` | Application-generated everywhere. The only fixed key is the `SiteSettings` singleton, `default`. |
| Prisma | 7.10.0 with `@prisma/adapter-pg` and `pg` 8.23.0 | `prisma-client` generator, ESM output to `src/generated/prisma/` (git-ignored, generated on `postinstall`). |
| Configuration | `prisma.config.ts` | Migrations use `DIRECT_DATABASE_URL` when set, otherwise `DATABASE_URL`. |
| Room size | `NUMERIC(6,2)` square metres | Fractional sizes are allowed. The value is mapped to `number` at the boundary. |
| Timestamps | `TIMESTAMPTZ(3)` | Stored in UTC. Scheduling uses the `SiteSettings.timeZone` IANA value (default `Africa/Cairo`). |
| Auth tables | Deferred to Phase 3 | `User` exists only as an extension point (`role`, `active`) for audit foreign keys. |

## Source tree added

```text
prisma/
├── migrations/20260925134806_initial_content/migration.sql
├── schema.prisma
├── seed-data.ts          # idempotent seed logic (also used by tests)
└── seed.mts              # CLI entry point
prisma.config.ts
src/
├── domain/
│   ├── content/page-sections.ts      # section types, per-page allow-lists, payload schemas, publish rules
│   ├── enquiries/contact-enquiry.ts
│   ├── facilities/facility.ts
│   ├── media/media-asset.ts
│   ├── promotions/promotion.ts       # schedule window, priority selection, versioning
│   ├── rooms/room.ts
│   └── shared/{domain-error,rich-text,types}.ts
├── application/
│   ├── booking/resolve-booking.ts
│   ├── content/publication.ts
│   ├── ports/{providers,repositories}.ts
│   ├── promotions/get-current-promotion.ts
│   └── shared/result.ts
└── infrastructure/
    ├── booking/disabled-booking-provider.ts
    ├── db/prisma/
    │   ├── client.ts                 # lazy singleton; nothing connects at import time
    │   ├── error-translation.ts
    │   ├── mappers/content-mappers.ts
    │   ├── media-assignments.ts
    │   ├── ordering.ts
    │   ├── repositories/*.ts
    │   ├── transaction.ts
    │   └── unit-of-work.ts
    └── ids/cuid2-id-generator.ts
```

## Entity and relationship summary

```text
User (auth extension point) ──< audit references (updatedBy / createdBy, ON DELETE RESTRICT)
SiteSettings (singleton "default") ──< SocialLink            (cascade)
SiteSettings >── MediaAsset  logo / sticky logo / favicon     (restrict)
Page (HOME | ABOUT | CONTACT) ──< PageSection ──< PageSectionMedia >── MediaAsset
Room ──< RoomFeature
Room ──< RoomMedia >── MediaAsset          (role HERO | GALLERY, ordered)
Facility ──< FacilityMedia >── MediaAsset  (role HERO | GALLERY, ordered)
Page / Room / Facility >── MediaAsset      (Open Graph image, restrict)
Promotion        standalone, scheduled, prioritised, versioned
ContactEnquiry   standalone operational record
```

Child rows (sections, features, media usages, social links) cascade with their parent. Every reference to a `MediaAsset` uses `RESTRICT`, so media still in use cannot be hard-deleted. The repository also soft-deletes only unreferenced media.

## Migration review notes

The initial migration creates 14 tables, 8 enums, 22 foreign keys, 13 unique indexes, 14 secondary indexes, and 21 CHECK constraints. `prisma migrate diff` against `schema.prisma` reports no drift.

SQL added by hand, because Prisma schema syntax cannot express it:

| Constraint | Rule |
| --- | --- |
| `SiteSettings_singleton_check` | `id = 'default'` |
| `SiteSettings_latitude_check` / `_longitude_check` | Valid coordinate ranges |
| `Page_canonicalPath_check` | Path begins with `/` |
| `Room_slug_check`, `Facility_slug_check` | `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `Room_maxAdults_check` / `_maxChildren_check` / `_sizeSqm_check` | Adults ≥ 1, children ≥ 0, size > 0 when present |
| `Room_active_sortOrder_key`, `Facility_active_sortOrder_key` | Partial unique index on `sortOrder` where status is not `ARCHIVED` |
| `MediaAsset_bytes_check` | `bytes > 0` |
| `MediaAsset_dimensions_check` | Width and height are positive when present |
| `MediaAsset_ready_dimensions_check` | `READY` media must have width and height |
| `MediaAsset_focalX_check` / `_focalY_check` | Focal point in `[0, 1]` |
| `MediaAsset_storageKey_check` | No leading `/` and no `..` path segment |
| `Promotion_code_check` | `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$` |
| `Promotion_window_check` | `endsAt > startsAt` when both are set |
| `Promotion_priority_check` / `_version_check` | Priority in `[-1000, 1000]`, version ≥ 1 |
| `ContactEnquiry_name_check` / `_message_check` | Not blank after trimming |

Unique constraints: `User.email`; `Page.key`; `Page.canonicalPath`; `Room.slug`; `Facility.slug`; `(pageId, sortOrder)` on sections; `(roomId, sortOrder)` on features; `(siteSettingsId, platform)` and `(siteSettingsId, sortOrder)` on social links; `MediaAsset.checksum`; `(storageProvider, storageContainer, storageKey)` on media. The media join tables use composite primary keys on `(owner, role, sortOrder)`.

Publication and ordering indexes: `Room`/`Facility` `(status, sortOrder)` and `(featured, status, sortOrder)`; `PageSection (pageId, isVisible, sortOrder)`; `Promotion (status, showAsPopup, startsAt, endsAt, priority)` and `(status, updatedAt)`; `MediaAsset (status, createdAt)`; `ContactEnquiry (status, createdAt)` and `(createdAt)`; one `mediaId` index on each media join table so reference checks stay fast.

> **Local databases:** the migration was corrected before first review. The generated ready-dimension check let `READY` media with `NULL` dimensions through, because a CHECK that evaluates to `NULL` passes. If a local database already has the earlier version applied, run `npx prisma migrate reset` against that development database.

## Repository operations

| Repository | Public (published only) | Admin reads | Writes (all transactional where multi-step) |
| --- | --- | --- | --- |
| Rooms / Facilities | `listPublished`, `findPublishedBySlug` | `listAdmin`, `findAdminById` | `create` (draft, appended order), `update` (re-checks readiness if published), `publish`, `archive`, `reorder` (complete active set only), `replaceMedia` (validated before write, refused if it would invalidate a published record) |
| Pages | `findPublishedByKey` (visible sections only) | `findAdminByKey` | `saveSection` (payload validated per page, refused if it would break a published page), `publish`, `reorderSections` (complete set only) |
| Promotions | `getCurrent(now)`: published, popup, in window; ordered by priority, then latest publication, then id | `listAdmin` | `create`, `update` (version bumps only when public content changes), `publish`, `archive` |
| Media | – | `findAdminById`, `countUsage` | `finalize` (`PENDING` → `READY`), `deleteIfUnreferenced` (soft delete) |
| Settings | `getPublic` | `getAdmin` | – |
| Enquiries | – | `listAdmin(status?)` | `create` (plain text, markup rejected), `archive` |

Expected Prisma errors are translated to application outcomes: `P2002` → `CONFLICT`; `P2003` → `REFERENCED`; `P2025` → `NOT_FOUND`; `P2000`, `P2004`, and PostgreSQL `23514` (check violation) → `VALIDATION`. Unexpected errors are re-thrown. The booking adapter returns only `{ available: false, reason: "NOT_CONFIGURED", accessibleMessage }`.

### Example outputs

The public room query returns a DTO with no storage keys, audit IDs, or timestamps:

```json
{
  "id": "room-2",
  "name": "Room room-2",
  "slug": "room-2",
  "shortDescription": "A calm room above the river.",
  "description": { "type": "doc", "content": [] },
  "sizeSqm": null,
  "maxAdults": 2,
  "maxChildren": 0,
  "bedSummary": null,
  "viewSummary": null,
  "featured": false,
  "sortOrder": 2,
  "status": "PUBLISHED",
  "media": [
    { "id": "media-1", "role": "HERO", "sortOrder": 0, "status": "READY", "altText": "Bedroom with river view", "altOverride": null }
  ]
}
```

A refused publish returns field-level errors:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_PUBLISHABLE",
    "message": "Room is not ready to publish.",
    "fieldErrors": { "media": ["A published room requires exactly one ready hero image."] }
  }
}
```

The seeded database after two runs contains one `SiteSettings` row (`default`, "Rivana Residence", `Africa/Cairo`); `HOME /`, `ABOUT /about`, and `CONTACT /contact`, all unpublished; an optional administrator from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_NAME`, with the email normalised to lower case; and no rooms, facilities, media, promotions, prices, or availability.

## Commands

```bash
npm run db:generate      # regenerate the Prisma client (also runs on install)
npm run db:migrate       # create/apply migrations in development
npm run db:deploy        # apply committed migrations (production)
npm run db:seed          # idempotent seed
TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/rivana_test npm run test:integration
```

Before running, the integration suite drops and recreates `TEST_DATABASE_URL`, then applies every migration. It refuses any database whose name does not end in `_test`. CI runs it against a `postgres:18` service.

## Verification

| Check | Result |
| --- | --- |
| `npm run format:check`, `lint`, `typecheck` | Pass, with no warnings |
| `npm run test` (unit, component, architecture) | 9 files, 74 tests pass |
| `npm run test:integration` (PostgreSQL 18.4) | 5 files, 53 tests pass |
| `npm run build` | Pass. No database is needed at build time. |
| `prisma migrate deploy` on an empty database | Pass |
| `prisma migrate diff` (database vs schema) | Empty |
| `prisma db seed` run twice | Idempotent. Edited settings are not overwritten. |

Coverage against the Phase 2 testing plan:

- **Domain invariants and publish readiness:** `tests/unit/domain/*`, which covers rooms, facilities, page sections, promotions, media, and enquiries.
- **Repository contracts on isolated PostgreSQL:** `tests/integration/content-repositories.test.ts`, `content-writes.test.ts`, and `promotions-enquiries.test.ts`.
- **Migration from empty and idempotent seed:** `tests/integration/schema.test.ts`.
- **Constraints:** `tests/integration/constraints.test.ts`. It covers duplicate slugs, duplicate section and active room order, invalid occupancy and size, the promotion window, media dimensions, storage-key traversal, and referenced-media deletion.
- **Public queries never expose drafts, archived records, hidden sections, or inactive promotions:** the integration suites.
- **Transactional reorder, publish, and media swap:** failure cases assert that the stored state is unchanged.
- **Prisma and pg imports stay out of domain, application, presentation, and app code, and database modules are `server-only`:** `tests/unit/architecture/persistence-boundaries.test.ts`.
- **No booking, pricing, or redemption fields:** checked in both the architecture test (schema) and the integration test (live `information_schema`).

## Known limitations and follow-ups

- The `RoomFeature` and `SocialLink` tables exist, but no write operations exist for them yet. They arrive with the room and settings CRUD in Phase 5.
- There is no media upload/begin operation, only finalize and delete. The storage adapter and upload pipeline land in the media phase, and the `MediaStorage` port is already defined.
- The `CacheInvalidator` port is defined but not yet called after writes. It gets wired in when public rendering consumes these repositories.
- Repository methods accept an `Actor`, but authorization is not enforced yet. Phase 3 adds session and role checks in the calling actions.
- Page unpublish is not implemented because no Phase 2 requirement needs it.

## Reviewer decision

Awaiting client review. Review the schema names, fields, constraints, and domain rules before authentication or UI depends on them.
