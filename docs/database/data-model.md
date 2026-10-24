# Data model

PostgreSQL is the system of record for content, staff identity, enquiries, promotions, media metadata, and (planned) branches, inventory, prices, and reservations. Binary images live in the configured media store (a persistent server directory). Prisma is the migration and persistence adapter, not the domain model; it is imported only under `src/infrastructure/db`.

The implemented schema is `prisma/schema.prisma` (3 migrations). Tables marked *planned* are specified here and added by milestone migrations ([migrations-and-seeding.md](./migrations-and-seeding.md)).

## Conventions

- IDs are application-generated CUID2 strings (`VARCHAR(32)`); do not mix strategies. The `SiteSettings` singleton uses the fixed key `default`.
- Instants are `timestamptz(3)` in UTC, formatted in the presentation layer. Every Prisma connection sets `-c TimeZone=UTC`, because the pg adapter exchanges instants as zone-less UTC wall time (see `src/infrastructure/db/prisma/client.ts`).
- Stay dates are `DATE`, never instants (ADR 020). Money is `INTEGER` minor units (cents) with a `currency` column; the currency is USD.
- Strings are bounded `VARCHAR`s. Room size is `NUMERIC(6,2)` square metres, mapped to `number` at the repository boundary.
- Rich text is a strict structured JSON document, not raw HTML.
- Slugs are lower-case ASCII and immutable by default after publication; changing one requires an explicit redirect decision.
- `CHECK`, exclusion, and partial-index constraints that Prisma cannot express live in SQL migrations, with a comment.
- Deletes are `RESTRICT` unless a child is owned outright.

## Tables at a glance

| Area | Tables | Status |
| --- | --- | --- |
| Staff identity | `User`, `Session`, `Account`, `Verification`, `LoginThrottle` | Implemented; `User.role` gains values and `StaffBranchAssignment` is planned (M4) |
| Site and pages | `SiteSettings`, `SocialLink`, `Page`, `PageSection`, `PageSectionMedia` | Implemented |
| Rooms and facilities | `Room`, `RoomFeature`, `RoomMedia`, `Facility`, `FacilityMedia` | Implemented; `Room.branchId` planned (M4) |
| Media | `MediaAsset` | Implemented |
| Marketing and enquiries | `Promotion`, `ContactEnquiry` | Implemented |
| Branches | `Branch`, `StaffBranchAssignment` | Planned (M4) |
| Inventory | `PhysicalRoom`, `InventoryBlock` | Planned (M5–M6) |
| Pricing | `RoomBaseRate`, `RatePeriod` | Planned (M6) |
| Reservations | `Reservation`, `ReservationRoom`, `ReservationNight`, `BranchSyncCheckpoint` | Planned (M7; checkpoints M9) |
| Guests | `Guest` (verified phone profiles, blocking), `PhoneVerification` | Planned (M7) |
| Cross-cutting | `AuditEvent` (M4), `NotificationOutbox` (M7) | Planned |

## Content and identity tables

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

`Room` holds marketing fields only. Its branch, physical rooms, prices, and reservation lines are separate tables that reference it (planned, below).

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

A promotion never carries a discount amount, eligibility, or redemption data. Price changes for offers are `RatePeriod` rows of kind `OFFER` (planned, below).

### `ContactEnquiry`

Purpose: reliable record of contact-form submissions and delivery outcome.

Fields: `id`, `name`, `email`, `phone?`, `subject?`, `message`, `status` (`NEW|READ|ARCHIVED|DELIVERY_FAILED`), `deliveryMessageId?`, `createdAt`, `readAt?`, `archivedAt?`.

Constraints/indexes: indexes `(status, createdAt desc)` and `createdAt`; field lengths enforced with Zod plus database column limits. Do not store raw IP; store a short-lived rate-limit key outside this table if needed.

### Better Auth tables

Better Auth owns `User`, `Session`, `Account`, and `Verification` schema for its pinned version (1.7.6, migration `20260925141030_auth`). Rivana extends `User` with `role`, `active`, and audit timestamps. Important indexes include unique normalized email (with a lower-case CHECK), unique session token, session expiry, and user foreign keys (cascade). Sessions store no IP address. `LoginThrottle` holds HMAC-keyed failed sign-in counters. Public sign-up is disabled; staff are provisioned with `npm run staff`.

## Operations tables (planned)

### Changes to existing tables

| Table | Change | Why |
| --- | --- | --- |
| `Room` | `+ branchId VARCHAR(32) NOT NULL` → `Branch.id` (`RESTRICT`); `@@unique([id, branchId])`; `@@index([branchId, status, sortOrder])` | Branch ownership (ADR 017); composite-FK target |
| `User` | role enum gains `RECEPTIONIST`, `MANAGER` (`ALTER TYPE "AdminRole" ADD VALUE`) | ADR 018 |
| `LoginThrottle` | no schema change; reused with namespaced HMAC keys (`rsv-create:`, `rsv-lookup:`) for public rate limits | Reuse of an atomic counter store |

No existing column is renamed or dropped.

### New tables (sketch)

```prisma
enum BranchStatus       { ACTIVE INACTIVE }
enum ReservationStatus  { PENDING CONFIRMED DECLINED CANCELLED CHECKED_IN CHECKED_OUT NO_SHOW }
enum ReservationSource  { WEBSITE STAFF EXTERNAL }
enum PaymentMethod      { PAY_AT_HOTEL }
enum NightRateSource    { BASE SEASONAL OFFER MANUAL }
enum RatePeriodKind     { SEASONAL OFFER }
enum BlockReason        { MAINTENANCE OWNER_USE OTHER }
enum OutboxStatus       { PENDING SENT FAILED }
enum OutboxChannel      { EMAIL WHATSAPP }
enum VerificationPurpose { BOOKING GUEST_SESSION }
enum SyncCheckpointKind { STARTED COMPLETED }

model Branch {
  id                   String       @id @db.VarChar(32)
  slug                 String       @unique @db.VarChar(80)
  name                 String       @db.VarChar(120)
  summary              String?      @db.VarChar(300)
  status               BranchStatus @default(ACTIVE)
  onlineBookingEnabled Boolean      @default(false)
  timeZone             String       @default("Africa/Cairo") @db.VarChar(100)
  currency             String       @default("USD") @db.Char(3)
  phone / email / addressLine1 / addressLine2 / city / country / latitude / longitude   (as SiteSettings)
  checkInTime          String?      @db.VarChar(20)
  checkOutTime         String?      @db.VarChar(20)
  heroMediaId          String?      @db.VarChar(32)   // → MediaAsset RESTRICT
  syncReminderIntervalMinutes Int  @default(30)       // CHECK 10–240 (Q-20)
  syncFollowUpMinutes         Int  @default(10)       // CHECK 5–60 and < interval
  sortOrder            Int
  createdAt / updatedAt / updatedById
}

model StaffBranchAssignment {
  userId      String   @db.VarChar(32)   // → User CASCADE
  branchId    String   @db.VarChar(32)   // → Branch RESTRICT
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  createdById String?  @db.VarChar(32)
  @@id([userId, branchId])
  @@index([branchId])
}

model PhysicalRoom {
  id         String  @id @db.VarChar(32)
  branchId   String  @db.VarChar(32)
  roomTypeId String  @db.VarChar(32)   // (roomTypeId, branchId) → Room(id, branchId)
  label      String  @db.VarChar(40)   // "204"
  active     Boolean @default(true)
  notes      String? @db.VarChar(500)
  createdAt / updatedAt / updatedById
  @@unique([branchId, label])
  @@unique([id, roomTypeId])            // composite-FK target for assignments
  @@index([roomTypeId, active])
}

model InventoryBlock {
  id             String      @id @db.VarChar(32)
  branchId       String      @db.VarChar(32)
  physicalRoomId String      @db.VarChar(32)
  startDate      DateTime    @db.Date
  endDate        DateTime    @db.Date          // exclusive
  reason         BlockReason
  note           String?     @db.VarChar(500)
  cancelledAt    DateTime?   @db.Timestamptz(3)
  cancelledById  String?     @db.VarChar(32)
  createdAt / createdById
  @@index([physicalRoomId, startDate])
  @@index([branchId, startDate])
}

model RoomBaseRate {
  roomTypeId  String   @id @db.VarChar(32)   // → Room RESTRICT
  amountMinor Int
  updatedAt / updatedById
}

model RatePeriod {
  id          String         @id @db.VarChar(32)
  roomTypeId  String         @db.VarChar(32)
  kind        RatePeriodKind
  startDate   DateTime       @db.Date
  endDate     DateTime       @db.Date        // exclusive
  amountMinor Int
  label       String?        @db.VarChar(80)
  active      Boolean        @default(true)
  createdAt / updatedAt / updatedById
  @@index([roomTypeId, startDate])
}

model Reservation {
  id                   String            @id @db.VarChar(32)
  reference            String            @unique @db.VarChar(16)
  branchId             String            @db.VarChar(32)
  source               ReservationSource
  status               ReservationStatus
  version              Int               @default(1)
  checkIn              DateTime          @db.Date
  checkOut             DateTime          @db.Date
  guestId              String?           @db.VarChar(32)   // → Guest RESTRICT; required for WEBSITE (CHECK)
  guestName            String            @db.VarChar(120)
  guestEmail           String?           @db.VarChar(320)   // required for WEBSITE (app rule)
  guestPhone           String?           @db.VarChar(32)
  guestCountry         String?           @db.VarChar(2)
  specialRequests      String?           @db.VarChar(1000)
  internalNotes        String?           @db.VarChar(2000)
  externalReference    String?           @db.VarChar(80)
  currency             String            @default("USD") @db.Char(3)
  totalMinor           Int?              // null only for unpriced EXTERNAL
  paymentMethod        PaymentMethod     @default(PAY_AT_HOTEL)
  manageTokenHash      String?           @unique @db.VarChar(64)
  manageTokenExpiresAt DateTime?         @db.Timestamptz(3)
  idempotencyKeyHash   String?           @db.VarChar(64)
  requestFingerprint   String?           @db.VarChar(64)
  statusChangedAt      DateTime          @db.Timestamptz(3)
  createdAt / updatedAt
  createdById          String?           @db.VarChar(32)   // staff; null for WEBSITE
  @@unique([id, branchId])              // composite-FK target for ReservationRoom
  @@unique([branchId, externalReference])
  @@unique([source, createdById, idempotencyKeyHash])  // see note
  @@index([branchId, status, checkIn])
  @@index([branchId, checkIn, checkOut])
  @@index([guestEmail])
  @@index([guestId, checkIn])
}

model ReservationRoom {
  id                String  @id @db.VarChar(32)
  reservationId     String  @db.VarChar(32)   // → Reservation CASCADE
  branchId          String  @db.VarChar(32)   // (roomTypeId, branchId) → Room(id, branchId)
  roomTypeId        String  @db.VarChar(32)
  physicalRoomId    String? @db.VarChar(32)   // (physicalRoomId, roomTypeId) → PhysicalRoom(id, roomTypeId)
  checkIn           DateTime @db.Date         // = reservation stay (v1), kept for constraints/queries
  checkOut          DateTime @db.Date
  adults            Int
  children          Int     @default(0)
  consumesInventory Boolean
  subtotalMinor     Int?
  @@index([branchId, roomTypeId, consumesInventory, checkIn, checkOut])
}

model ReservationNight {
  reservationRoomId String          @db.VarChar(32)   // → ReservationRoom CASCADE
  night             DateTime        @db.Date
  amountMinor       Int?
  rateSource        NightRateSource?
  ratePeriodId      String?         @db.VarChar(32)   // historical pointer, SET NULL
  label             String?         @db.VarChar(80)
  @@id([reservationRoomId, night])
}

model AuditEvent {
  id         String   @id @db.VarChar(32)
  occurredAt DateTime @default(now()) @db.Timestamptz(3)
  actorType  String   @db.VarChar(16)    // STAFF | GUEST | SYSTEM
  actorId    String?  @db.VarChar(32)
  action     String   @db.VarChar(80)
  entityType String   @db.VarChar(40)
  entityId   String   @db.VarChar(32)
  branchId   String?  @db.VarChar(32)
  reason     String?  @db.VarChar(500)
  changes    Json?
  @@index([entityType, entityId, occurredAt])
  @@index([branchId, occurredAt])
}

model Guest {
  id              String    @id @db.VarChar(32)
  phone           String    @unique @db.VarChar(20)   // normalized E.164
  name            String    @db.VarChar(120)          // latest used
  email           String?   @db.VarChar(320)          // latest used
  phoneVerifiedAt DateTime? @db.Timestamptz(3)        // null for staff-entered profiles
  blockedAt       DateTime? @db.Timestamptz(3)
  blockedById     String?   @db.VarChar(32)
  blockReason     String?   @db.VarChar(500)
  createdAt / updatedAt
  @@index([blockedAt])
  @@index([name])
}

model PhoneVerification {
  id          String              @id @db.VarChar(32)
  phone       String              @db.VarChar(20)
  purpose     VerificationPurpose
  codeHash    String              @db.VarChar(64)
  attempts    Int                 @default(0)
  expiresAt   DateTime            @db.Timestamptz(3)    // created + 10 minutes
  verifiedAt  DateTime?           @db.Timestamptz(3)
  tokenHash   String?             @unique @db.VarChar(64) // verification token / guest session (30 minutes)
  tokenExpiresAt DateTime?        @db.Timestamptz(3)
  consumedAt  DateTime?           @db.Timestamptz(3)    // BOOKING token used by a reservation
  clientKey   String              @db.VarChar(80)       // HMAC of the client address, for limits
  createdAt   DateTime            @default(now()) @db.Timestamptz(3)
  @@index([phone, createdAt])
  @@index([clientKey, createdAt])
}

model NotificationOutbox {
  id            String       @id @db.VarChar(32)
  channel       OutboxChannel
  kind          String       @db.VarChar(60)    // reservation.request-received, …
  reservationId String?      @db.VarChar(32)
  recipient     String       @db.VarChar(320)   // email address or E.164 phone
  payload       Json                            // template data, no secrets except manage URL
  status        OutboxStatus @default(PENDING)
  attempts      Int          @default(0)
  lastError     String?      @db.VarChar(200)
  availableAt   DateTime     @db.Timestamptz(3)
  sentAt        DateTime?    @db.Timestamptz(3)
  createdAt     DateTime     @default(now()) @db.Timestamptz(3)
  @@index([status, availableAt])
}

model BranchSyncCheckpoint {           // Q-20
  id           String   @id @db.VarChar(32)
  branchId     String   @db.VarChar(32)
  kind         SyncCheckpointKind
  recordedAt   DateTime @default(now()) @db.Timestamptz(3)
  recordedById String   @db.VarChar(32)
  note         String?  @db.VarChar(500)
  @@index([branchId, recordedAt])
}
```

Notes:

- **Idempotency uniqueness.** Postgres treats `NULL`s as distinct in unique constraints. The migration instead creates `UNIQUE NULLS NOT DISTINCT ("source", "createdById", "idempotencyKeyHash")` (PostgreSQL 15+), so public (`createdById IS NULL`) keys are also unique. Rows without a key (none in v1) are excluded with a partial index.
- **Manage token in outbox payload.** The token appears only inside the queued email payload until the email is sent. The dispatcher then replaces it with `null`. Never log payloads.
- **The manage token is not stored in plaintext anywhere else.**
- **Verification codes** are sent by WhatsApp directly from the verification use case, not through the outbox, because they must arrive within seconds and no other write depends on them. Only the code's hash is stored.
- **Retention:** guest and reservation rows are kept indefinitely (Q-13). Verification rows are also kept, as evidence for abuse investigations; their code and token hashes are useless after expiry.

### SQL-only constraints (migration)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"     ADD CHECK ("checkOut" > "checkIn");
ALTER TABLE "ReservationRoom" ADD CHECK ("checkOut" > "checkIn" AND "adults" >= 1 AND "children" >= 0);
ALTER TABLE "InventoryBlock"  ADD CHECK ("endDate" > "startDate");
ALTER TABLE "RatePeriod"      ADD CHECK ("endDate" > "startDate" AND "amountMinor" > 0);
ALTER TABLE "RoomBaseRate"    ADD CHECK ("amountMinor" > 0);
ALTER TABLE "ReservationNight" ADD CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0);
ALTER TABLE "Reservation"     ADD CHECK ("source" <> 'EXTERNAL' OR "externalReference" IS NOT NULL);
ALTER TABLE "Reservation"     ADD CHECK ("source" <> 'WEBSITE'  OR ("guestEmail" IS NOT NULL AND "guestId" IS NOT NULL));
ALTER TABLE "Branch"          ADD CHECK ("syncReminderIntervalMinutes" BETWEEN 10 AND 240 AND "syncFollowUpMinutes" BETWEEN 5 AND 60 AND "syncFollowUpMinutes" < "syncReminderIntervalMinutes");

-- Same-branch guarantees (composite FKs)
ALTER TABLE "ReservationRoom" ADD FOREIGN KEY ("roomTypeId","branchId") REFERENCES "Room"("id","branchId");
ALTER TABLE "ReservationRoom" ADD FOREIGN KEY ("physicalRoomId","roomTypeId") REFERENCES "PhysicalRoom"("id","roomTypeId");
ALTER TABLE "PhysicalRoom"    ADD FOREIGN KEY ("roomTypeId","branchId") REFERENCES "Room"("id","branchId");
-- ReservationRoom.branchId must equal Reservation.branchId: FK (reservationId, branchId) → Reservation(id, branchId)

-- No double assignment of a physical room; no overlapping blocks; no overlapping same-kind rate periods
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_no_double_assignment"
  EXCLUDE USING gist ("physicalRoomId" WITH =, daterange("checkIn","checkOut",'[)') WITH &&)
  WHERE ("physicalRoomId" IS NOT NULL AND "consumesInventory");
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_no_overlap"
  EXCLUDE USING gist ("physicalRoomId" WITH =, daterange("startDate","endDate",'[)') WITH &&)
  WHERE ("cancelledAt" IS NULL);
ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_no_same_kind_overlap"
  EXCLUDE USING gist ("roomTypeId" WITH =, "kind" WITH =, daterange("startDate","endDate",'[)') WITH &&)
  WHERE ("active");
```

Prisma does not model exclusion constraints. The project already keeps `CHECK` constraints in SQL migrations, and `prisma migrate diff` reported no drift with them in Phase 11. In M4/M6 we must verify that `migrate diff` stays clean with exclusion constraints and with expression-based composite FKs. If Prisma insists on modelling the composite FKs, they move into `schema.prisma` as `@relation(fields: [roomTypeId, branchId], references: [id, branchId])`.

## Entity-relationship diagram

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ Account : has
  User ||--o{ StaffBranchAssignment : "works at (planned)"
  SiteSettings ||--o{ SocialLink : lists
  Page ||--o{ PageSection : contains
  PageSection ||--o{ PageSectionMedia : shows
  MediaAsset ||--o{ PageSectionMedia : "used by"
  Branch ||--o{ Room : "owns (planned)"
  Room ||--o{ RoomFeature : lists
  Room ||--o{ RoomMedia : shows
  MediaAsset ||--o{ RoomMedia : "used by"
  Facility ||--o{ FacilityMedia : shows
  MediaAsset ||--o{ FacilityMedia : "used by"
  Branch ||--o{ StaffBranchAssignment : "staffed by"
  Branch ||--o{ PhysicalRoom : has
  Branch ||--o{ Reservation : takes
  Branch ||--o{ BranchSyncCheckpoint : records
  Room ||--o{ PhysicalRoom : "type of"
  Room ||--o| RoomBaseRate : "priced by"
  Room ||--o{ RatePeriod : "date prices"
  Room ||--o{ ReservationRoom : "booked as"
  PhysicalRoom ||--o{ InventoryBlock : "blocked by"
  PhysicalRoom |o--o{ ReservationRoom : "assigned to"
  Reservation ||--|{ ReservationRoom : lines
  ReservationRoom ||--|{ ReservationNight : "price snapshot"
  Reservation ||--o{ NotificationOutbox : "messages (email, WhatsApp)"
  Guest ||--o{ Reservation : "books (verified phone)"

  Room {
    string slug UK
    enum status
    int maxAdults
    int maxChildren
    string branchId FK "planned"
  }
  Reservation {
    string reference UK
    enum status
    enum source
    date checkIn
    date checkOut
    int totalMinor
    int version
  }
  ReservationRoom {
    string roomTypeId FK
    string physicalRoomId FK
    bool consumesInventory
  }
```

`Promotion`, `ContactEnquiry`, `AuditEvent`, `Verification`, and `LoginThrottle` are standalone. Records also reference their creating or updating `User` (`updatedById`, `createdById`); `AuditEvent.actorId` is deliberately not a foreign key, so history survives user removal.

## Transactions

- Content: reorder operations, publication validation plus status change, promotion publication, media reference swaps, and destructive reference checks run in transactions. Filesystem writes cannot join a database transaction, so media uses the pending/finalize lifecycle ([../architecture/overview.md](../architecture/overview.md#error-handling)).
- Operations: every multi-step write runs in one unit-of-work transaction, and availability-reducing writes take the room-type lock first ([integrity-and-concurrency.md](./integrity-and-concurrency.md)).

## Deletion behavior

| Relationship | On delete | Reason |
| --- | --- | --- |
| Branch → anything | `RESTRICT` | Branches are deactivated, never deleted |
| Room → PhysicalRoom/rates/reservation lines | `RESTRICT` | A room type with inventory or history cannot be hard-deleted; the existing CMS archive flow still works |
| Reservation → lines → nights | `CASCADE` | Defined for integrity only. Reservations are never deleted; data is kept indefinitely (Q-13) |
| Guest → Reservation | `RESTRICT` | Guest profiles are never deleted; blocking is a status, not a deletion |
| PhysicalRoom → blocks/assignments | `RESTRICT` | Units are deactivated, not deleted, once used |
| User → StaffBranchAssignment | `CASCADE` | Removing a user removes assignments; audit rows keep `actorId` as text (no FK) so history survives |
| RatePeriod → ReservationNight.ratePeriodId | `SET NULL` | The snapshot keeps the amount and label |

## Invariants checklist

| Id | Invariant | Enforced by |
| --- | --- | --- |
| DB-1 | Reservation lines and physical rooms belong to the reservation's branch and room type | Composite FKs |
| DB-2 | `checkOut > checkIn` everywhere | CHECK |
| DB-3 | One physical room is never assigned to overlapping active stays | Exclusion constraint |
| DB-4 | Blocks on one room do not overlap | Exclusion constraint |
| DB-5 | Same-kind rate periods do not overlap | Exclusion constraint |
| DB-6 | References are unique | Unique index |
| DB-7 | Idempotency keys are unique per source and actor | Unique (NULLS NOT DISTINCT) |
| DB-8 | External references are unique per branch | Unique index |
| DB-9 | Room-type capacity is never oversold | Room-type lock plus count in one transaction (ADR 016); proven by concurrency tests |
| DB-10 | Audit is append-only | Runtime role lacks `UPDATE`/`DELETE` on `AuditEvent` (Phase 12 grants) |
| DB-11 | One guest profile per phone number | Unique `Guest.phone` (normalized E.164) |
| DB-12 | A website reservation always has a guest profile | CHECK `source <> 'WEBSITE' OR "guestId" IS NOT NULL` |
