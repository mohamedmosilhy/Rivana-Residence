BEGIN;

-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "PhoneVerification" ADD COLUMN     "channel" "VerificationChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "email" VARCHAR(320);

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "verificationChannel" "VerificationChannel",
ADD COLUMN     "verifiedEmail" VARCHAR(320);

-- CreateIndex
CREATE INDEX "PhoneVerification_email_createdAt_idx" ON "PhoneVerification"("email", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_verifiedEmail_idx" ON "Reservation"("verifiedEmail");

-- An email code carries its normalized email; a WhatsApp code carries none (ADR 031).
-- The previous release keeps inserting WhatsApp rows through the column default.
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_channel_email_check"
  CHECK (("channel" = 'EMAIL') = ("email" IS NOT NULL) AND ("email" IS NULL OR "email" = lower("email")));

-- Only website bookings record how the guest was verified. A website booking
-- written by the previous release during a deploy leaves it null, which reads
-- as WHATSAPP: that release could verify only by WhatsApp.
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_verification_channel_check"
  CHECK ("verificationChannel" IS NULL OR "source" = 'WEBSITE');

-- The email an EMAIL code proved, kept apart from the editable contact email so
-- the per email cap cannot be dodged by changing the contact (ADR 031).
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_verified_email_check"
  CHECK (COALESCE("verificationChannel" = 'EMAIL', false) = ("verifiedEmail" IS NOT NULL)
    AND ("verifiedEmail" IS NULL OR "verifiedEmail" = lower("verifiedEmail")));

UPDATE "Reservation" SET "verificationChannel" = 'WHATSAPP' WHERE "source" = 'WEBSITE';

-- CreateTable
CREATE TABLE "VerificationSettings" (
    "id" VARCHAR(32) NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "VerificationSettings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VerificationSettings" ADD CONSTRAINT "VerificationSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The Admin switch for email codes starts off (Q-99); only an Admin turns it on.
INSERT INTO "VerificationSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

COMMIT;
