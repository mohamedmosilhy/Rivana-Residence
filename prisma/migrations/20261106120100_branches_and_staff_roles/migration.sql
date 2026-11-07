-- M4: branches own rooms, facilities, and pages; staff branch assignments;
-- the audit log (ADR 017, ADR 018, ADR 026; spec 0001).
--
-- Additive only: no column or table is renamed or dropped, and every existing
-- row keeps its content. Order: expand (new types, tables, nullable columns),
-- backfill (first branch from SiteSettings, then every room, facility, and
-- page), constrain (NOT NULL, unique keys, foreign keys, checks).

-- ===========================================================================
-- 1. Expand
-- ===========================================================================

CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AccommodationType" AS ENUM ('ROOM', 'APARTMENT');

CREATE TABLE "Branch" (
    "id" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(300),
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "onlineBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Cairo',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "phone" VARCHAR(40),
    "email" VARCHAR(320),
    "addressLine1" VARCHAR(180),
    "addressLine2" VARCHAR(180),
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "mapEmbedUrl" VARCHAR(2048),
    "checkInTime" VARCHAR(5),
    "checkOutTime" VARCHAR(5),
    "heroMediaId" VARCHAR(32),
    "syncReminderIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "syncFollowUpMinutes" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- Admins are implicitly all-branch and Editors have no branch scope, so only
-- Receptionists and Managers get rows (enforced by the staff CLI).
CREATE TABLE "StaffBranchAssignment" (
    "userId" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" VARCHAR(32),

    CONSTRAINT "StaffBranchAssignment_pkey" PRIMARY KEY ("userId","branchId")
);

-- actorId and branchId are plain text on purpose: history survives the
-- removal of a user and any later branch change. Append-only by convention;
-- revoking UPDATE/DELETE from the runtime role is a Phase 12 task.
CREATE TABLE "AuditEvent" (
    "id" VARCHAR(32) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" VARCHAR(16) NOT NULL,
    "actorId" VARCHAR(32),
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32),
    "reason" VARCHAR(500),
    "changes" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- New columns start nullable so existing rows can be backfilled.
ALTER TABLE "Room"
    ADD COLUMN "branchId" VARCHAR(32),
    ADD COLUMN "accommodationType" "AccommodationType" NOT NULL DEFAULT 'ROOM',
    ADD COLUMN "bedroomCount" SMALLINT,
    ADD COLUMN "bathroomCount" SMALLINT;
ALTER TABLE "Facility" ADD COLUMN "branchId" VARCHAR(32);
ALTER TABLE "Page" ADD COLUMN "branchId" VARCHAR(32);
-- Enquiries received before branch sites existed keep a null branch.
ALTER TABLE "ContactEnquiry" ADD COLUMN "branchId" VARCHAR(32);

-- ===========================================================================
-- 2. Backfill
-- ===========================================================================

-- The first branch, New Cairo, takes today's brand contact, address,
-- coordinates, map, and time zone from SiteSettings so the public site does
-- not change. The id is a CUID2 generated once (SQL cannot generate CUID2);
-- the seed uses the same value. Without a SiteSettings row (a fresh database)
-- the branch still exists, with the column defaults. NOT EXISTS keeps the
-- insert to exactly one branch.
INSERT INTO "Branch" (
    "id", "slug", "name", "summary", "status", "timeZone",
    "phone", "email", "addressLine1", "addressLine2", "city", "country",
    "latitude", "longitude", "mapEmbedUrl", "sortOrder", "updatedAt"
)
SELECT
    'cwiuqp6uf1q5i1ic4vhawnmw',
    'new-cairo',
    COALESCE(s."siteName", 'Rivana Residence'),
    LEFT(s."tagline", 300),
    'ACTIVE',
    COALESCE(s."timeZone", 'Africa/Cairo'),
    s."phone", s."email", s."addressLine1", s."addressLine2", s."city", s."country",
    s."latitude", s."longitude", s."mapEmbedUrl",
    0,
    CURRENT_TIMESTAMP
FROM (SELECT 1) AS one
LEFT JOIN "SiteSettings" AS s ON s."id" = 'default'
WHERE NOT EXISTS (SELECT 1 FROM "Branch" WHERE "slug" = 'new-cairo');

UPDATE "Room"     SET "branchId" = 'cwiuqp6uf1q5i1ic4vhawnmw' WHERE "branchId" IS NULL;
UPDATE "Facility" SET "branchId" = 'cwiuqp6uf1q5i1ic4vhawnmw' WHERE "branchId" IS NULL;
UPDATE "Page"     SET "branchId" = 'cwiuqp6uf1q5i1ic4vhawnmw' WHERE "branchId" IS NULL;

-- ===========================================================================
-- 3. Constrain
-- ===========================================================================

ALTER TABLE "Room" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Facility" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Page" ALTER COLUMN "branchId" SET NOT NULL;

-- Page keys and canonical paths are unique within a branch (ADR 026).
DROP INDEX "Page_key_key";
DROP INDEX "Page_canonicalPath_key";
CREATE UNIQUE INDEX "Page_branchId_key_key" ON "Page"("branchId", "key");
CREATE UNIQUE INDEX "Page_branchId_canonicalPath_key" ON "Page"("branchId", "canonicalPath");

-- Display order is unique per branch among non-archived listings (SQL only;
-- Prisma does not model partial indexes). Replaces the global indexes.
DROP INDEX "Room_active_sortOrder_key";
CREATE UNIQUE INDEX "Room_branch_active_sortOrder_key" ON "Room"("branchId", "sortOrder") WHERE "status" <> 'ARCHIVED';
DROP INDEX "Facility_active_sortOrder_key";
CREATE UNIQUE INDEX "Facility_branch_active_sortOrder_key" ON "Facility"("branchId", "sortOrder") WHERE "status" <> 'ARCHIVED';

-- Composite target for same-branch foreign keys from units and reservation
-- lines (ADR 017).
CREATE UNIQUE INDEX "Room_id_branchId_key" ON "Room"("id", "branchId");

CREATE UNIQUE INDEX "Branch_slug_key" ON "Branch"("slug");
CREATE INDEX "Branch_status_sortOrder_idx" ON "Branch"("status", "sortOrder");
CREATE INDEX "StaffBranchAssignment_branchId_idx" ON "StaffBranchAssignment"("branchId");
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "AuditEvent_branchId_occurredAt_idx" ON "AuditEvent"("branchId", "occurredAt");
CREATE INDEX "ContactEnquiry_branchId_createdAt_idx" ON "ContactEnquiry"("branchId", "createdAt");
CREATE INDEX "Facility_branchId_status_sortOrder_idx" ON "Facility"("branchId", "status", "sortOrder");
CREATE INDEX "Room_branchId_status_sortOrder_idx" ON "Room"("branchId", "status", "sortOrder");

-- Branches are deactivated, never deleted: every reference restricts deletes.
ALTER TABLE "Page" ADD CONSTRAINT "Page_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Removing a user removes their assignments; a branch with staff cannot go.
ALTER TABLE "StaffBranchAssignment" ADD CONSTRAINT "StaffBranchAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffBranchAssignment" ADD CONSTRAINT "StaffBranchAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks Prisma cannot express. The domain schema (src/domain/branches)
-- applies the same rules with friendly messages.

-- URL-safe slug that cannot shadow a top-level route or a legacy *.html path
-- (ADR 026). Kept in step with RESERVED_BRANCH_SLUGS.
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_slug_check" CHECK (
    "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND "slug" NOT IN ('admin', 'api', 'media', 'reservations', 'book', 'sitemap.xml', 'robots.txt')
    AND "slug" NOT LIKE '%.html'
);
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_name_check" CHECK (length(btrim("name")) > 0);
-- One currency for every branch (ADR 020).
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_currency_check" CHECK ("currency" = 'USD');
-- HH:MM in the branch time zone.
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_times_check" CHECK (
    ("checkInTime" IS NULL OR "checkInTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    AND ("checkOutTime" IS NULL OR "checkOutTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
-- Sync reminder interval 10-240 minutes, follow-up 5-60 and shorter (Q-20).
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_sync_check" CHECK (
    "syncReminderIntervalMinutes" BETWEEN 10 AND 240
    AND "syncFollowUpMinutes" BETWEEN 5 AND 60
    AND "syncFollowUpMinutes" < "syncReminderIntervalMinutes"
);
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_coordinates_check" CHECK (
    ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
    AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "Room" ADD CONSTRAINT "Room_unit_counts_check" CHECK (
    ("bedroomCount" IS NULL OR "bedroomCount" >= 0)
    AND ("bathroomCount" IS NULL OR "bathroomCount" >= 0)
);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorType_check" CHECK ("actorType" IN ('STAFF', 'GUEST', 'SYSTEM'));
