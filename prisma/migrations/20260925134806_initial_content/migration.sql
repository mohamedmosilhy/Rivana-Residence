-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PageKey" AS ENUM ('HOME', 'ABOUT', 'CONTACT');

-- CreateEnum
CREATE TYPE "PageSectionType" AS ENUM ('HERO', 'RICH_TEXT', 'IMAGE_TEXT_SPLIT', 'GALLERY', 'FEATURE_GRID', 'ROOM_GRID', 'FACILITY_GRID', 'CONTACT_CTA', 'STATS');

-- CreateEnum
CREATE TYPE "PageSectionMediaRole" AS ENUM ('BACKGROUND', 'PRIMARY', 'GALLERY', 'DECORATIVE');

-- CreateEnum
CREATE TYPE "EntityMediaRole" AS ENUM ('HERO', 'GALLERY');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED', 'DELIVERY_FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" VARCHAR(2048),
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" VARCHAR(32) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Cairo',
    "siteName" VARCHAR(120) NOT NULL,
    "tagline" VARCHAR(240),
    "phone" VARCHAR(40),
    "email" VARCHAR(320),
    "addressLine1" VARCHAR(180),
    "addressLine2" VARCHAR(180),
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "mapEmbedUrl" VARCHAR(2048),
    "footerText" VARCHAR(500),
    "defaultSeoTitle" VARCHAR(70),
    "defaultSeoDescription" VARCHAR(170),
    "logoMediaId" VARCHAR(32),
    "stickyLogoMediaId" VARCHAR(32),
    "faviconMediaId" VARCHAR(32),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" VARCHAR(32) NOT NULL,
    "siteSettingsId" VARCHAR(32) NOT NULL,
    "platform" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" VARCHAR(32) NOT NULL,
    "key" "PageKey" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(170),
    "ogMediaId" VARCHAR(32),
    "canonicalPath" VARCHAR(255) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSection" (
    "id" VARCHAR(32) NOT NULL,
    "pageId" VARCHAR(32) NOT NULL,
    "type" "PageSectionType" NOT NULL,
    "heading" VARCHAR(160),
    "eyebrow" VARCHAR(80),
    "payload" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSectionMedia" (
    "sectionId" VARCHAR(32) NOT NULL,
    "mediaId" VARCHAR(32) NOT NULL,
    "role" "PageSectionMediaRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "altOverride" VARCHAR(300),

    CONSTRAINT "PageSectionMedia_pkey" PRIMARY KEY ("sectionId","role","sortOrder")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "shortDescription" VARCHAR(300) NOT NULL,
    "description" JSONB NOT NULL,
    "sizeSqm" DECIMAL(6,2),
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "bedSummary" VARCHAR(160),
    "viewSummary" VARCHAR(160),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(170),
    "ogMediaId" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomFeature" (
    "id" VARCHAR(32) NOT NULL,
    "roomId" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "iconKey" VARCHAR(60),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RoomFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMedia" (
    "roomId" VARCHAR(32) NOT NULL,
    "mediaId" VARCHAR(32) NOT NULL,
    "role" "EntityMediaRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "altOverride" VARCHAR(300),

    CONSTRAINT "RoomMedia_pkey" PRIMARY KEY ("roomId","role","sortOrder")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "shortDescription" VARCHAR(300) NOT NULL,
    "description" JSONB NOT NULL,
    "openingHoursText" VARCHAR(500),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(170),
    "ogMediaId" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityMedia" (
    "facilityId" VARCHAR(32) NOT NULL,
    "mediaId" VARCHAR(32) NOT NULL,
    "role" "EntityMediaRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "altOverride" VARCHAR(300),

    CONSTRAINT "FacilityMedia_pkey" PRIMARY KEY ("facilityId","role","sortOrder")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" VARCHAR(32) NOT NULL,
    "storageProvider" VARCHAR(40) NOT NULL,
    "storageContainer" VARCHAR(100) NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "publicUrl" VARCHAR(2048),
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" VARCHAR(128),
    "altText" VARCHAR(300) NOT NULL,
    "caption" VARCHAR(500),
    "credit" VARCHAR(300),
    "focalX" DECIMAL(4,3),
    "focalY" DECIMAL(4,3),
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" VARCHAR(32),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" VARCHAR(32) NOT NULL,
    "internalName" VARCHAR(120) NOT NULL,
    "headline" VARCHAR(160) NOT NULL,
    "body" VARCHAR(600) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "terms" VARCHAR(1200),
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "showAsPopup" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" VARCHAR(32),
    "updatedById" VARCHAR(32),

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEnquiry" (
    "id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40),
    "subject" VARCHAR(160),
    "message" VARCHAR(4000) NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "deliveryMessageId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ContactEnquiry_pkey" PRIMARY KEY ("id")
);

-- Domain constraints that Prisma schema syntax cannot express.
ALTER TABLE "SiteSettings"
    ADD CONSTRAINT "SiteSettings_singleton_check" CHECK ("id" = 'default'),
    ADD CONSTRAINT "SiteSettings_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "SiteSettings_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

ALTER TABLE "Page"
    ADD CONSTRAINT "Page_canonicalPath_check" CHECK ("canonicalPath" LIKE '/%');

ALTER TABLE "Room"
    ADD CONSTRAINT "Room_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "Room_maxAdults_check" CHECK ("maxAdults" >= 1),
    ADD CONSTRAINT "Room_maxChildren_check" CHECK ("maxChildren" >= 0),
    ADD CONSTRAINT "Room_sizeSqm_check" CHECK ("sizeSqm" IS NULL OR "sizeSqm" > 0);

ALTER TABLE "Facility"
    ADD CONSTRAINT "Facility_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "MediaAsset"
    ADD CONSTRAINT "MediaAsset_bytes_check" CHECK ("bytes" > 0),
    ADD CONSTRAINT "MediaAsset_dimensions_check" CHECK (
        ("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)
    ),
    ADD CONSTRAINT "MediaAsset_ready_dimensions_check" CHECK (
        "status" <> 'READY' OR ("width" IS NOT NULL AND "height" IS NOT NULL)
    ),
    ADD CONSTRAINT "MediaAsset_focalX_check" CHECK ("focalX" IS NULL OR "focalX" BETWEEN 0 AND 1),
    ADD CONSTRAINT "MediaAsset_focalY_check" CHECK ("focalY" IS NULL OR "focalY" BETWEEN 0 AND 1),
    ADD CONSTRAINT "MediaAsset_storageKey_check" CHECK (
        "storageKey" !~ '^/' AND "storageKey" !~ '(^|/)\.\.(/|$)'
    );

ALTER TABLE "Promotion"
    ADD CONSTRAINT "Promotion_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
    ADD CONSTRAINT "Promotion_window_check" CHECK (
        "endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt"
    ),
    ADD CONSTRAINT "Promotion_priority_check" CHECK ("priority" BETWEEN -1000 AND 1000),
    ADD CONSTRAINT "Promotion_version_check" CHECK ("version" >= 1);

ALTER TABLE "ContactEnquiry"
    ADD CONSTRAINT "ContactEnquiry_name_check" CHECK (length(trim("name")) > 0),
    ADD CONSTRAINT "ContactEnquiry_message_check" CHECK (length(trim("message")) > 0);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SocialLink_siteSettingsId_platform_key" ON "SocialLink"("siteSettingsId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "SocialLink_siteSettingsId_sortOrder_key" ON "SocialLink"("siteSettingsId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Page_key_key" ON "Page"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Page_canonicalPath_key" ON "Page"("canonicalPath");

-- CreateIndex
CREATE INDEX "PageSection_pageId_isVisible_sortOrder_idx" ON "PageSection"("pageId", "isVisible", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PageSection_pageId_sortOrder_key" ON "PageSection"("pageId", "sortOrder");

-- CreateIndex
CREATE INDEX "PageSectionMedia_mediaId_idx" ON "PageSectionMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");

-- Archived records leave display ordering; active records remain deterministic.
CREATE UNIQUE INDEX "Room_active_sortOrder_key" ON "Room"("sortOrder") WHERE "status" <> 'ARCHIVED';

-- CreateIndex
CREATE INDEX "Room_status_sortOrder_idx" ON "Room"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "Room_featured_status_sortOrder_idx" ON "Room"("featured", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "RoomFeature_roomId_idx" ON "RoomFeature"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomFeature_roomId_sortOrder_key" ON "RoomFeature"("roomId", "sortOrder");

-- CreateIndex
CREATE INDEX "RoomMedia_mediaId_idx" ON "RoomMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_slug_key" ON "Facility"("slug");

CREATE UNIQUE INDEX "Facility_active_sortOrder_key" ON "Facility"("sortOrder") WHERE "status" <> 'ARCHIVED';

-- CreateIndex
CREATE INDEX "Facility_status_sortOrder_idx" ON "Facility"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "Facility_featured_status_sortOrder_idx" ON "Facility"("featured", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "FacilityMedia_mediaId_idx" ON "FacilityMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_checksum_key" ON "MediaAsset"("checksum");

-- CreateIndex
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageProvider_storageContainer_storageKey_key" ON "MediaAsset"("storageProvider", "storageContainer", "storageKey");

-- CreateIndex
CREATE INDEX "Promotion_status_showAsPopup_startsAt_endsAt_priority_idx" ON "Promotion"("status", "showAsPopup", "startsAt", "endsAt", "priority");

-- CreateIndex
CREATE INDEX "Promotion_status_updatedAt_idx" ON "Promotion"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContactEnquiry_status_createdAt_idx" ON "ContactEnquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactEnquiry_createdAt_idx" ON "ContactEnquiry"("createdAt");

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_stickyLogoMediaId_fkey" FOREIGN KEY ("stickyLogoMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_faviconMediaId_fkey" FOREIGN KEY ("faviconMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_siteSettingsId_fkey" FOREIGN KEY ("siteSettingsId") REFERENCES "SiteSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_ogMediaId_fkey" FOREIGN KEY ("ogMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSection" ADD CONSTRAINT "PageSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSectionMedia" ADD CONSTRAINT "PageSectionMedia_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PageSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSectionMedia" ADD CONSTRAINT "PageSectionMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ogMediaId_fkey" FOREIGN KEY ("ogMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomFeature" ADD CONSTRAINT "RoomFeature_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMedia" ADD CONSTRAINT "RoomMedia_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMedia" ADD CONSTRAINT "RoomMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_ogMediaId_fkey" FOREIGN KEY ("ogMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMedia" ADD CONSTRAINT "FacilityMedia_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityMedia" ADD CONSTRAINT "FacilityMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
