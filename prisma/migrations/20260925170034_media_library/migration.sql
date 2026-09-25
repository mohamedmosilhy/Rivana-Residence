-- CreateEnum
CREATE TYPE "MediaRightsStatus" AS ENUM ('CONFIRMED', 'UNCONFIRMED');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "failureReason" VARCHAR(200),
ADD COLUMN     "rightsStatus" "MediaRightsStatus" NOT NULL DEFAULT 'UNCONFIRMED',
ADD COLUMN     "sourceReference" VARCHAR(255);

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "defaultOgMediaId" VARCHAR(32);

-- CreateIndex
CREATE INDEX "MediaAsset_sourceReference_idx" ON "MediaAsset"("sourceReference");

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_defaultOgMediaId_fkey" FOREIGN KEY ("defaultOgMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defence in depth: storage keys are server-generated relative paths made of
-- safe segments, so no key can name a hidden file, traverse, or contain
-- separators the filesystem might reinterpret.
ALTER TABLE "MediaAsset"
    ADD CONSTRAINT "MediaAsset_storageKey_charset_check" CHECK (
        "storageKey" ~ '^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*\.[a-z0-9]+$'
    );
