-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('AWAITING_PAYMENT', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('WEBSITE', 'STAFF', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAY_AT_HOTEL', 'PAYMOB');

-- CreateEnum
CREATE TYPE "ReservationPaymentStatus" AS ENUM ('NOT_REQUIRED', 'AWAITING', 'PAID', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NightRateSource" AS ENUM ('BASE', 'PERIOD', 'MANUAL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('BOOKING', 'GUEST_SESSION');

-- CreateEnum
CREATE TYPE "SyncCheckpointKind" AS ENUM ('STARTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Reservation" (
    "id" VARCHAR(32) NOT NULL,
    "reference" VARCHAR(16) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "source" "ReservationSource" NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guestId" VARCHAR(32),
    "guestName" VARCHAR(120) NOT NULL,
    "guestEmail" VARCHAR(320),
    "guestPhone" VARCHAR(32),
    "guestCountry" VARCHAR(2),
    "specialRequests" VARCHAR(1000),
    "internalNotes" VARCHAR(2000),
    "externalReference" VARCHAR(80),
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "accommodationMinor" INTEGER,
    "servicesMinor" INTEGER NOT NULL DEFAULT 0,
    "subtotalMinor" INTEGER,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxableMinor" INTEGER,
    "vatRateBasisPoints" INTEGER,
    "vatMinor" INTEGER,
    "totalMinor" INTEGER,
    "couponId" VARCHAR(32),
    "couponCode" VARCHAR(32),
    "couponKind" "CouponKind",
    "couponValue" INTEGER,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PAY_AT_HOTEL',
    "paymentStatus" "ReservationPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "holdExpiresAt" TIMESTAMPTZ(3),
    "pmsEnteredAt" TIMESTAMPTZ(3),
    "pmsEnteredById" VARCHAR(32),
    "privacyNoticeVersion" VARCHAR(40),
    "manageTokenHash" VARCHAR(64),
    "manageTokenExpiresAt" TIMESTAMPTZ(3),
    "idempotencyKeyHash" VARCHAR(64),
    "requestFingerprint" VARCHAR(64),
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" VARCHAR(32),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationRoom" (
    "id" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "roomTypeId" VARCHAR(32) NOT NULL,
    "physicalRoomId" VARCHAR(32),
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "consumesInventory" BOOLEAN NOT NULL,
    "subtotalMinor" INTEGER,

    CONSTRAINT "ReservationRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationNight" (
    "reservationRoomId" VARCHAR(32) NOT NULL,
    "night" DATE NOT NULL,
    "amountMinor" INTEGER,
    "rateSource" "NightRateSource",
    "ratePeriodId" VARCHAR(32),
    "label" VARCHAR(80),

    CONSTRAINT "ReservationNight_pkey" PRIMARY KEY ("reservationRoomId","night")
);

-- CreateTable
CREATE TABLE "ReservationService" (
    "reservationId" VARCHAR(32) NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "priceUnit" "ServicePriceUnit" NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "childPriceMinor" INTEGER,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "adultQuantity" INTEGER NOT NULL,
    "childQuantity" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "details" VARCHAR(300),

    CONSTRAINT "ReservationService_pkey" PRIMARY KEY ("reservationId","kind")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" VARCHAR(32) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "marketingOptInAt" TIMESTAMPTZ(3),
    "marketingConsentVersion" VARCHAR(40),
    "marketingOptOutAt" TIMESTAMPTZ(3),
    "blockedAt" TIMESTAMPTZ(3),
    "blockedById" VARCHAR(32),
    "blockReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" VARCHAR(32) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "tokenHash" VARCHAR(64),
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "clientKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "couponId" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "phone" VARCHAR(20),
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("reservationId")
);

-- CreateTable
CREATE TABLE "WhatsAppSettings" (
    "id" VARCHAR(32) NOT NULL,
    "businessPhoneNumber" VARCHAR(20),
    "providerPhoneNumberId" VARCHAR(64),
    "lastTestAt" TIMESTAMPTZ(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" VARCHAR(200),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "WhatsAppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" VARCHAR(32) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "providerName" VARCHAR(120) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "variables" JSONB NOT NULL,
    "previewText" VARCHAR(1024) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" VARCHAR(32) NOT NULL,
    "channel" "OutboxChannel" NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "reservationId" VARCHAR(32),
    "recipient" VARCHAR(320) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(200),
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchSyncCheckpoint" (
    "id" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "kind" "SyncCheckpointKind" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" VARCHAR(32) NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "BranchSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reference_key" ON "Reservation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_manageTokenHash_key" ON "Reservation"("manageTokenHash");

-- CreateIndex
CREATE INDEX "Reservation_branchId_status_checkIn_idx" ON "Reservation"("branchId", "status", "checkIn");

-- CreateIndex
CREATE INDEX "Reservation_branchId_checkIn_checkOut_idx" ON "Reservation"("branchId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Reservation_guestEmail_idx" ON "Reservation"("guestEmail");

-- CreateIndex
CREATE INDEX "Reservation_guestId_checkIn_idx" ON "Reservation"("guestId", "checkIn");

-- CreateIndex
CREATE INDEX "Reservation_status_holdExpiresAt_idx" ON "Reservation"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Reservation_branchId_source_pmsEnteredAt_idx" ON "Reservation"("branchId", "source", "pmsEnteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_id_branchId_key" ON "Reservation"("id", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_branchId_externalReference_key" ON "Reservation"("branchId", "externalReference");

-- CreateIndex
CREATE INDEX "ReservationRoom_branchId_roomTypeId_consumesInventory_check_idx" ON "ReservationRoom"("branchId", "roomTypeId", "consumesInventory", "checkIn", "checkOut");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_phone_key" ON "Guest"("phone");

-- CreateIndex
CREATE INDEX "Guest_blockedAt_idx" ON "Guest"("blockedAt");

-- CreateIndex
CREATE INDEX "Guest_name_idx" ON "Guest"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerification_tokenHash_key" ON "PhoneVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneVerification_clientKey_createdAt_idx" ON "PhoneVerification"("clientKey", "createdAt");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_releasedAt_idx" ON "CouponRedemption"("couponId", "releasedAt");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_phone_releasedAt_idx" ON "CouponRedemption"("couponId", "phone", "releasedAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "BranchSyncCheckpoint_branchId_recordedAt_idx" ON "BranchSyncCheckpoint"("branchId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_pmsEnteredById_fkey" FOREIGN KEY ("pmsEnteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_reservationId_branchId_fkey" FOREIGN KEY ("reservationId", "branchId") REFERENCES "Reservation"("id", "branchId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_roomTypeId_branchId_fkey" FOREIGN KEY ("roomTypeId", "branchId") REFERENCES "Room"("id", "branchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_physicalRoomId_roomTypeId_fkey" FOREIGN KEY ("physicalRoomId", "roomTypeId") REFERENCES "PhysicalRoom"("id", "roomTypeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationNight" ADD CONSTRAINT "ReservationNight_reservationRoomId_fkey" FOREIGN KEY ("reservationRoomId") REFERENCES "ReservationRoom"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationNight" ADD CONSTRAINT "ReservationNight_ratePeriodId_fkey" FOREIGN KEY ("ratePeriodId") REFERENCES "RatePeriod"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationService" ADD CONSTRAINT "ReservationService_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WhatsAppSettings" ADD CONSTRAINT "WhatsAppSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BranchSyncCheckpoint" ADD CONSTRAINT "BranchSyncCheckpoint_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BranchSyncCheckpoint" ADD CONSTRAINT "BranchSyncCheckpoint_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot represent CHECKs, partial NULLS NOT DISTINCT uniqueness,
-- or exclusion constraints. Do not replace these with ordinary @@unique.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_dates_check" CHECK ("checkOut" > "checkIn"),
  ADD CONSTRAINT "Reservation_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "Reservation_currency_check" CHECK ("currency" = 'USD'),
  ADD CONSTRAINT "Reservation_external_check" CHECK ("source" <> 'EXTERNAL' OR ("externalReference" IS NOT NULL AND length(trim("externalReference")) > 0)),
  ADD CONSTRAINT "Reservation_website_check" CHECK ("source" <> 'WEBSITE' OR ("guestEmail" IS NOT NULL AND "guestId" IS NOT NULL)),
  ADD CONSTRAINT "Reservation_hold_check" CHECK ("status" <> 'AWAITING_PAYMENT' OR ("paymentMethod" = 'PAYMOB' AND "holdExpiresAt" IS NOT NULL)),
  ADD CONSTRAINT "Reservation_snapshot_check" CHECK (
    ("source" = 'EXTERNAL' AND "accommodationMinor" IS NULL AND "subtotalMinor" IS NULL
      AND "taxableMinor" IS NULL AND "vatRateBasisPoints" IS NULL AND "vatMinor" IS NULL
      AND "totalMinor" IS NULL AND "servicesMinor" = 0 AND "discountMinor" = 0)
    OR
    ("accommodationMinor" IS NOT NULL AND "subtotalMinor" IS NOT NULL AND "taxableMinor" IS NOT NULL
      AND "vatRateBasisPoints" IS NOT NULL AND "vatMinor" IS NOT NULL AND "totalMinor" IS NOT NULL
      AND "accommodationMinor" >= 0 AND "servicesMinor" >= 0 AND "discountMinor" >= 0
      AND "taxableMinor" >= 0 AND "vatMinor" >= 0 AND "vatRateBasisPoints" BETWEEN 0 AND 10000
      AND "subtotalMinor"::bigint = "accommodationMinor"::bigint + "servicesMinor"::bigint
      AND "taxableMinor"::bigint = "subtotalMinor"::bigint - "discountMinor"::bigint
      AND "totalMinor"::bigint = "taxableMinor"::bigint + "vatMinor"::bigint)
  );
CREATE UNIQUE INDEX "Reservation_idempotency_key"
  ON "Reservation" ("source", "createdById", "idempotencyKeyHash") NULLS NOT DISTINCT
  WHERE "idempotencyKeyHash" IS NOT NULL;

ALTER TABLE "ReservationRoom"
  ADD CONSTRAINT "ReservationRoom_dates_occupancy_check" CHECK ("checkOut" > "checkIn" AND "adults" >= 1 AND "children" >= 0),
  ADD CONSTRAINT "ReservationRoom_subtotal_check" CHECK ("subtotalMinor" IS NULL OR "subtotalMinor" >= 0),
  ADD CONSTRAINT "ReservationRoom_no_double_assignment"
    EXCLUDE USING gist ("physicalRoomId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&)
    WHERE ("physicalRoomId" IS NOT NULL AND "consumesInventory");
ALTER TABLE "ReservationNight" ADD CONSTRAINT "ReservationNight_amount_check" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0);
ALTER TABLE "ReservationService"
  ADD CONSTRAINT "ReservationService_values_check" CHECK (
    "priceMinor" > 0 AND "amountMinor" >= 0 AND "adults" >= 1 AND "children" >= 0
    AND "nights" >= 1 AND "adultQuantity" >= 0 AND "childQuantity" >= 0
    AND ("childPriceMinor" IS NULL OR ("childPriceMinor" > 0 AND "priceUnit" IN ('PER_PERSON', 'PER_PERSON_PER_NIGHT')))
  );
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5);
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "WhatsAppSettings" ADD CONSTRAINT "WhatsAppSettings_singleton_check" CHECK ("id" = 'default');
CREATE UNIQUE INDEX "WhatsAppTemplate_active_purpose_language_key"
  ON "WhatsAppTemplate" ("purpose", "language") WHERE "active" AND "purpose" <> 'MARKETING';

-- Required configuration only. No invented number, token, or provider templates.
INSERT INTO "WhatsAppSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
