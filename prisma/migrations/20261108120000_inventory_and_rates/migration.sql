BEGIN;

-- Required for scalar equality in the GiST exclusions. Fail rather than
-- silently weakening overlap protection if the extension is unavailable.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "BlockReason" AS ENUM ('MAINTENANCE', 'OWNER_USE', 'OTHER');

-- CreateTable
CREATE TABLE "PhysicalRoom" (
    "id" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "roomTypeId" VARCHAR(32) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "PhysicalRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBlock" (
    "id" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "physicalRoomId" VARCHAR(32) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" "BlockReason" NOT NULL,
    "note" VARCHAR(500),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" VARCHAR(32) NOT NULL,

    CONSTRAINT "InventoryBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBaseRate" (
    "roomTypeId" VARCHAR(32) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "RoomBaseRate_pkey" PRIMARY KEY ("roomTypeId")
);

-- CreateTable
CREATE TABLE "RatePeriod" (
    "id" VARCHAR(32) NOT NULL,
    "roomTypeId" VARCHAR(32) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "label" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" VARCHAR(32),

    CONSTRAINT "RatePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhysicalRoom_roomTypeId_active_idx" ON "PhysicalRoom"("roomTypeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalRoom_branchId_label_key" ON "PhysicalRoom"("branchId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalRoom_id_roomTypeId_key" ON "PhysicalRoom"("id", "roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalRoom_id_branchId_key" ON "PhysicalRoom"("id", "branchId");

-- CreateIndex
CREATE INDEX "InventoryBlock_physicalRoomId_startDate_idx" ON "InventoryBlock"("physicalRoomId", "startDate");

-- CreateIndex
CREATE INDEX "InventoryBlock_branchId_startDate_idx" ON "InventoryBlock"("branchId", "startDate");

-- CreateIndex
CREATE INDEX "RatePeriod_roomTypeId_startDate_idx" ON "RatePeriod"("roomTypeId", "startDate");

-- AddForeignKey
ALTER TABLE "PhysicalRoom" ADD CONSTRAINT "PhysicalRoom_roomTypeId_branchId_fkey" FOREIGN KEY ("roomTypeId", "branchId") REFERENCES "Room"("id", "branchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PhysicalRoom" ADD CONSTRAINT "PhysicalRoom_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_physicalRoomId_branchId_fkey" FOREIGN KEY ("physicalRoomId", "branchId") REFERENCES "PhysicalRoom"("id", "branchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBaseRate" ADD CONSTRAINT "RoomBaseRate_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RoomBaseRate" ADD CONSTRAINT "RoomBaseRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL-only invariants (ADRs 016 and 020, spec 0003). Prisma cannot
-- represent CHECK or partial GiST exclusion constraints in its schema.
ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_dates_check"
  CHECK ("endDate" > "startDate");
ALTER TABLE "RoomBaseRate" ADD CONSTRAINT "RoomBaseRate_amount_currency_check"
  CHECK ("amountMinor" > 0 AND "currency" = 'USD');
ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_dates_amount_currency_check"
  CHECK ("endDate" > "startDate" AND "amountMinor" > 0 AND "currency" = 'USD');

ALTER TABLE "InventoryBlock" ADD CONSTRAINT "InventoryBlock_no_overlap"
  EXCLUDE USING gist (
    "physicalRoomId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("cancelledAt" IS NULL);

ALTER TABLE "RatePeriod" ADD CONSTRAINT "RatePeriod_no_overlap"
  EXCLUDE USING gist (
    "roomTypeId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("active");

COMMIT;
