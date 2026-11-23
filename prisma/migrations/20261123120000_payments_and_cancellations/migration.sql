BEGIN;

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'EXPIRED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "PaymentEventKind" AS ENUM ('TRANSACTION', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentEventOutcome" AS ENUM ('SUCCEEDED', 'DECLINED', 'SESSION_CLOSED', 'REFUND_SUCCEEDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "PaymentEventResult" AS ENUM ('APPLIED', 'IGNORED_MISMATCH', 'IGNORED_UNKNOWN', 'IGNORED_STATE');

-- CreateEnum
CREATE TYPE "CancellationRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CancellationRequestedBy" AS ENUM ('GUEST', 'STAFF');

-- CreateEnum
CREATE TYPE "CancellationClosedReason" AS ENUM ('STAFF_CANCELLED', 'NO_SHOW', 'CHECKED_IN');

-- Rename in place. The existing Reservation_hold_check keeps its enum
-- reference, along with the column default and any legacy rows.
ALTER TYPE "PaymentMethod" RENAME VALUE 'PAYMOB' TO 'ONLINE';

-- AlterEnum
ALTER TYPE "ReservationPaymentStatus" ADD VALUE 'FAILED';

-- AlterEnum
ALTER TYPE "OutboxStatus" ADD VALUE 'HELD';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payment" (
    "id" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerOrderId" VARCHAR(80),
    "providerTransactionId" VARCHAR(80),
    "checkoutUrl" VARCHAR(2048),
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "refundAttempt" INTEGER NOT NULL DEFAULT 0,
    "refundRequestedAt" TIMESTAMPTZ(3),
    "refundProviderId" VARCHAR(80),
    "refundedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" VARCHAR(32) NOT NULL,
    "paymentId" VARCHAR(32),
    "providerEventId" VARCHAR(120) NOT NULL,
    "kind" "PaymentEventKind" NOT NULL,
    "outcome" "PaymentEventOutcome" NOT NULL,
    "result" "PaymentEventResult" NOT NULL,
    "amountMinor" INTEGER,
    "currency" CHAR(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "requestedBy" "CancellationRequestedBy" NOT NULL,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'OPEN',
    "guestReason" VARCHAR(500),
    "decidedById" VARCHAR(32),
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" VARCHAR(500),
    "closedReason" "CancellationClosedReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTransactionId_key" ON "Payment"("providerTransactionId");

-- CreateIndex
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_reservationId_idx" ON "CancellationRequest"("reservationId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The new enum labels added to existing types are used only after this migration.
-- The predicates below use values from the new types created above.
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_positive_usd_check" CHECK ("amountMinor" > 0 AND "currency" = 'USD');

CREATE UNIQUE INDEX "Payment_one_initiated" ON "Payment"("reservationId") WHERE "status" = 'INITIATED';
CREATE UNIQUE INDEX "CancellationRequest_one_open" ON "CancellationRequest"("reservationId") WHERE "status" = 'OPEN';

ALTER TABLE "CancellationRequest"
    ADD CONSTRAINT "CancellationRequest_closed_reason_check" CHECK ("closedReason" IS NULL OR "status" = 'CLOSED');

COMMIT;
