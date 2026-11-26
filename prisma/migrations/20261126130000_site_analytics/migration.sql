BEGIN;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "analyticsSessionId" VARCHAR(32);

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" BIGSERIAL NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "branchId" VARCHAR(32),
    "name" VARCHAR(30) NOT NULL,
    "funnelStep" INTEGER,
    "bookingStep" VARCHAR(20),
    "path" VARCHAR(200),
    "roomId" VARCHAR(32),
    "sessionId" VARCHAR(32),
    "visitorHash" CHAR(32),
    "referrerHost" VARCHAR(100),
    "utmSource" VARCHAR(60),
    "utmMedium" VARCHAR(60),
    "utmCampaign" VARCHAR(60),
    "device" VARCHAR(10),
    "outcome" VARCHAR(40),
    "stayCheckIn" DATE,
    "stayCheckOut" DATE,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDailyTotal" (
    "date" DATE NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "dimension" VARCHAR(30) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "visitors" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "SiteDailyTotal_pkey" PRIMARY KEY ("date","branchId","dimension","key")
);

-- CreateTable
CREATE TABLE "AnalyticsSalt" (
    "day" DATE NOT NULL,
    "salt" BYTEA NOT NULL,

    CONSTRAINT "AnalyticsSalt_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "SiteEvent_occurredAt_idx" ON "SiteEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "SiteEvent_branchId_occurredAt_idx" ON "SiteEvent"("branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "SiteEvent_sessionId_name_idx" ON "SiteEvent"("sessionId", "name");

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ADR 029: fixed values at the storage boundary.
ALTER TABLE "SiteEvent"
    ADD CONSTRAINT "SiteEvent_name_check" CHECK ("name" IN (
        'PAGE_VIEW', 'STEP_VIEW', 'SEARCH', 'QUOTE', 'CODE_REQUESTED',
        'PHONE_VERIFIED', 'BOOKING_SUBMITTED', 'BOOKING_CONFIRMED', 'CHECKOUT_REFUSED'
    )),
    ADD CONSTRAINT "SiteEvent_funnelStep_check" CHECK ("funnelStep" BETWEEN 1 AND 8),
    ADD CONSTRAINT "SiteEvent_bookingStep_check" CHECK (
        CASE WHEN "name" = 'STEP_VIEW' THEN "bookingStep" IS NOT NULL AND "bookingStep" IN (
            'SEARCH', 'DETAILS', 'VERIFY', 'EXTRAS', 'PAYMENT', 'REVIEW', 'CONFIRMED',
            'PAYMENT_RETURN', 'MANAGE', 'FIND', 'CHANGE'
        ) ELSE "bookingStep" IS NULL END
    ),
    ADD CONSTRAINT "SiteEvent_device_check" CHECK ("device" IN ('MOBILE', 'TABLET', 'DESKTOP')),
    ADD CONSTRAINT "SiteEvent_sessionId_check" CHECK (
        CASE WHEN "sessionId" IS NULL THEN "name" = 'SEARCH' ELSE "sessionId" ~ '^[0-9a-f]{32}$' END
    ),
    ADD CONSTRAINT "SiteEvent_visitorHash_check" CHECK ("visitorHash" ~ '^[0-9a-f]{32}$'),
    ADD CONSTRAINT "SiteEvent_stay_check" CHECK (
        ("stayCheckIn" IS NULL AND "stayCheckOut" IS NULL)
        OR ("name" = 'SEARCH' AND "stayCheckIn" IS NOT NULL AND "stayCheckOut" IS NOT NULL AND "stayCheckOut" > "stayCheckIn")
    );

ALTER TABLE "AnalyticsSalt"
    ADD CONSTRAINT "AnalyticsSalt_size_check" CHECK (octet_length("salt") = 32);

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_analyticsSessionId_check" CHECK (
        "analyticsSessionId" IS NULL OR (
            "paymentMethod" = 'ONLINE' AND "analyticsSessionId" ~ '^[0-9a-f]{32}$'
        )
    );

COMMIT;
