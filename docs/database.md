# Database design

PostgreSQL stores normalized content, relationships, auth/session data, promotions, and media metadata. Binary images live in the configured media store; the initial production adapter uses a persistent server directory. Prisma is the migration and persistence adapter, not the domain model.

## Entities

### `SiteSettings`

Purpose: one record for global identity and defaults.

Important fields:

- `id` fixed to `default` or protected by a singleton unique key;
- `timeZone` as a required IANA identifier (initially `Africa/Cairo`) for promotion scheduling and editorial date display;
- `siteName`, `tagline`, `phone`, `email`, `addressLine1`, `addressLine2`, `city`, `country`;
- `latitude`, `longitude`, `mapEmbedUrl` (optional, allowlisted/validated);
- `footerText`, `defaultSeoTitle`, `defaultSeoDescription`;
- `logoMediaId`, `stickyLogoMediaId`, `faviconMediaId` nullable until setup;
- `updatedAt`, `updatedById`.

Relationships: optional media references, many `SocialLink` rows, updater `User`.

Constraints/indexes: singleton key unique; email validation in application; foreign keys use `RESTRICT` for media.

### `SocialLink`

Purpose: ordered, editable social profiles.

Fields: `id`, `siteSettingsId`, `platform`, `label`, `url`, `sortOrder`, `isVisible`.

Constraints: unique `(siteSettingsId, platform)` and `(siteSettingsId, sortOrder)`; supported platform allowlist in Zod/domain.

### `Page`

Purpose: metadata/container for required editorial routes.

Fields: `id`, `key` (`HOME|ABOUT|CONTACT`), `title`, `seoTitle`, `seoDescription`, `ogMediaId`, `canonicalPath`, `isPublished`, timestamps, `updatedById`.

Relationships: many `PageSection`; optional OG media.

Constraints/indexes: unique `key`; unique `canonicalPath`; index `isPublished` is not important at this scale but may be combined with key by the unique constraint.

### `PageSection`

Purpose: an ordered instance of an approved section type.

Fields: `id`, `pageId`, `type`, `heading`, `eyebrow`, `payload Json`, `sortOrder`, `isVisible`, timestamps.

Relationships: many `PageSectionMedia`.

Constraints/indexes: unique `(pageId, sortOrder)`; index `(pageId, isVisible, sortOrder)`; type/payload validated on every write. The JSON payload contains only section-specific structured text/config, never arbitrary executable HTML or media URLs.

### `PageSectionMedia`

Purpose: referentially safe section-to-media association.

Fields: `sectionId`, `mediaId`, `role` (`BACKGROUND|PRIMARY|GALLERY|DECORATIVE`), `sortOrder`, optional `altOverride`.

Constraints/indexes: composite primary/unique identity; unique `(sectionId, role, sortOrder)`; indexes on `mediaId` for usage checks.

### `Room`

Purpose: accommodation marketing record.

Fields: `id`, `name`, `slug`, `shortDescription`, `description Json`, `sizeSqm Decimal?`, `maxAdults Int`, `maxChildren Int`, `bedSummary`, `viewSummary`, `featured`, `sortOrder`, `status`, `seoTitle`, `seoDescription`, `ogMediaId`, timestamps, `updatedById`.

Relationships: many `RoomFeature`, many `RoomMedia`, optional OG media.

Constraints/indexes:

- unique `slug`;
- unique `sortOrder` among active display records (enforced transactionally if partial uniqueness is inconvenient in Prisma);
- check constraints via SQL migration: `maxAdults >= 1`, `maxChildren >= 0`, `sizeSqm IS NULL OR sizeSqm > 0`;
- indexes `(status, sortOrder)` and `(featured, status, sortOrder)`.

There is intentionally no `price`, `availability`, `stock`, or reservation relation.

### `RoomFeature`

Purpose: manageable ordered feature list for a room.

Fields: `id`, `roomId`, `label`, `iconKey?`, `sortOrder`.

Constraints/indexes: unique `(roomId, sortOrder)`; index `roomId`; cascade delete with a hard-deleted room.

### `RoomMedia`

Purpose: ordered room gallery and hero selection.

Fields: `roomId`, `mediaId`, `role` (`HERO|GALLERY`), `sortOrder`, optional `altOverride`.

Constraints/indexes: unique `(roomId, role, sortOrder)`; index `mediaId`; application transaction guarantees exactly one hero for a published room.

### `Facility`

Purpose: facility/amenity marketing record.

Fields: `id`, `name`, `slug`, `shortDescription`, `description Json`, `openingHoursText?`, `featured`, `sortOrder`, `status`, SEO fields, `ogMediaId`, timestamps, `updatedById`.

Relationships: many `FacilityMedia`; optional OG media.

Constraints/indexes: unique `slug`; indexes `(status, sortOrder)` and `(featured, status, sortOrder)`.

### `FacilityMedia`

Purpose: facility hero/gallery association.

Fields and constraints mirror `RoomMedia`; publication requires one hero.

### `MediaAsset`

Purpose: metadata and lifecycle for a stored object.

Fields:

- `id`, `storageProvider`, `storageContainer`, `storageKey`, optional `publicUrl` cache;
- `originalFilename`, `mimeType`, `bytes`, `width`, `height`, `checksum`;
- `altText`, `caption?`, `credit?`, `focalX?`, `focalY?`;
- `status` (`PENDING|READY|FAILED|DELETED`);
- timestamps, `createdById`.

`storageKey` is a relative, server-generated key such as `2026/09/<uuid>.webp`; never store an absolute operating-system path or a user-supplied filename as the key. `storageContainer` is a stable logical name such as `local-media`; it does not expose the absolute root and can later hold an object-storage bucket/container name.

Constraints/indexes: unique `(storageProvider, storageContainer, storageKey)`; optional unique checksum for deduplication; indexes `(status, createdAt)` and normalized filename/search support if later needed. `bytes > 0`, dimensions positive for ready images, focal points within 0–1.

### `Promotion`

Purpose: scheduled public promotion-code campaign managed by staff.

Fields: `id`, `internalName`, `headline`, `body`, `code`, `terms?`, `status` (`DRAFT|PUBLISHED|ARCHIVED`), `startsAt?`, `endsAt?`, `priority Int`, `showAsPopup Boolean`, `version Int`, `publishedAt?`, timestamps, `createdById`, `updatedById`.

Constraints/indexes:

- check `length(trim(code)) > 0`, bounded field lengths, and `endsAt IS NULL OR startsAt IS NULL OR endsAt > startsAt`;
- index `(status, showAsPopup, startsAt, endsAt, priority)` for the public active-campaign query;
- index `(status, updatedAt desc)` for the admin list;
- use server-side time and a deterministic `priority desc, publishedAt desc, id` order when selecting one public popup.
- start `version` at 1 and increment it when public popup content/code/terms materially change so an updated campaign may display after an earlier version was dismissed.

Do not add discount amount, rate, eligibility, reservation, guest, or redemption tables/fields. Those belong to the external reservation provider.

### `ContactEnquiry`

Purpose: reliable record of contact-form submissions and delivery outcome.

Fields: `id`, `name`, `email`, `phone?`, `subject?`, `message`, `status` (`NEW|READ|ARCHIVED|DELIVERY_FAILED`), `deliveryMessageId?`, `createdAt`, `readAt?`, `archivedAt?`.

Constraints/indexes: indexes `(status, createdAt desc)` and `createdAt`; field lengths enforced with Zod plus database column limits. Do not store raw IP; store a short-lived rate-limit key outside this table if needed.

### Better Auth tables

Better Auth owns `User`, `Session`, `Account`, and `Verification` schema generated for its pinned version. Rivana extends `User` with `role`, `active`, and audit timestamps. Important indexes include unique normalized email, unique session token, session expiry, and user foreign keys. Public sign-up is disabled.

## Relationship overview

```text
User ──< Session / Account
User ──< authored/updated records
SiteSettings ──< SocialLink
Page ──< PageSection ──< PageSectionMedia >── MediaAsset
Room ──< RoomFeature
Room ──< RoomMedia >── MediaAsset
Facility ──< FacilityMedia >── MediaAsset
ContactEnquiry (standalone operational record)
Promotion (standalone scheduled marketing record)
```

## IDs, timestamps, and text

- IDs are application-generated CUID2 strings (`VARCHAR(32)`), chosen in Phase 2; do not mix strategies. The `SiteSettings` singleton uses the fixed key `default`.
- Store timestamps as timezone-aware PostgreSQL `timestamptz` in UTC; format in the presentation layer.
- Room size is `NUMERIC(6,2)` square metres, mapped to `number` at the repository boundary.
- Rich text is a sanitized structured JSON document with a strict schema, not raw HTML.
- Slugs are lower-case ASCII and immutable by default after publication; changing one requires an explicit redirect decision.

## Transactions

Use transactions for reorder operations, publishing validation plus status update, promotion publication, swapping media references, and destructive reference checks. Filesystem writes cannot participate in a PostgreSQL transaction; use the pending/finalize lifecycle documented in [architecture.md](./architecture.md).

## Migration and seed policy

- Prisma migrations are reviewed and committed; production uses `prisma migrate deploy`.
- Add SQL check/partial indexes in migrations where Prisma schema syntax is insufficient.
- Seed creates required page/settings records and the first admin from secure environment-provided values; it does not seed fake prices or availability.
- Content/image migration is an idempotent script with stable source keys, not hand-written production SQL.
