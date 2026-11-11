BEGIN;

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('BREAKFAST', 'AIRPORT_TRANSFER');

-- CreateEnum
CREATE TYPE "ServicePriceUnit" AS ENUM ('PER_BOOKING', 'PER_NIGHT', 'PER_PERSON', 'PER_PERSON_PER_NIGHT');

-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "ServiceOffering" (
    "id" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "priceUnit" "ServicePriceUnit" NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "childPriceMinor" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(300),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" VARCHAR(32) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "percentBasisPoints" INTEGER,
    "amountMinor" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerPhone" INTEGER,
    "allBranches" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" VARCHAR(32),
    "updatedById" VARCHAR(32),

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponBranch" (
    "couponId" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,

    CONSTRAINT "CouponBranch_pkey" PRIMARY KEY ("couponId","branchId")
);

-- CreateTable
CREATE TABLE "CommercialSettings" (
    "id" VARCHAR(32) NOT NULL,
    "vatRateBasisPoints" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "CommercialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOffering_branchId_kind_key" ON "ServiceOffering"("branchId", "kind");

-- CreateIndex
CREATE INDEX "CouponBranch_branchId_idx" ON "CouponBranch"("branchId");

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CouponBranch" ADD CONSTRAINT "CouponBranch_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CouponBranch" ADD CONSTRAINT "CouponBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommercialSettings" ADD CONSTRAINT "CommercialSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Prisma cannot represent these checks or an expression unique index.
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_price_currency_check"
  CHECK ("priceMinor" > 0 AND "currency" = 'USD');
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_child_price_check"
  CHECK ("childPriceMinor" IS NULL OR
    ("childPriceMinor" > 0 AND "priceUnit" IN ('PER_PERSON', 'PER_PERSON_PER_NIGHT')));

CREATE UNIQUE INDEX "Coupon_code_upper_key" ON "Coupon" (upper("code"));
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_value_check" CHECK (
  ("kind" = 'PERCENT' AND "percentBasisPoints" IS NOT NULL
    AND "percentBasisPoints" BETWEEN 1 AND 10000 AND "amountMinor" IS NULL)
  OR ("kind" = 'FIXED' AND "amountMinor" IS NOT NULL
    AND "amountMinor" > 0 AND "percentBasisPoints" IS NULL)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_currency_check" CHECK ("currency" = 'USD');
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_dates_check"
  CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_limits_check" CHECK (
  ("maxRedemptions" IS NULL OR "maxRedemptions" >= 1)
  AND ("maxRedemptionsPerPhone" IS NULL OR "maxRedemptionsPerPhone" >= 1)
);
ALTER TABLE "CommercialSettings" ADD CONSTRAINT "CommercialSettings_singleton_check"
  CHECK ("id" = 'default');
ALTER TABLE "CommercialSettings" ADD CONSTRAINT "CommercialSettings_vat_check"
  CHECK ("vatRateBasisPoints" BETWEEN 0 AND 10000);

-- Required production data, not a runtime fallback or fictional demo rate.
INSERT INTO "CommercialSettings" ("id", "vatRateBasisPoints", "updatedAt")
VALUES ('default', 1500, CURRENT_TIMESTAMP);

COMMIT;
