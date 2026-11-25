BEGIN;

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'CLOSED');

-- AlterTable
ALTER TABLE "CancellationRequest" ADD COLUMN     "cancelReason" VARCHAR(32),
ADD COLUMN     "notifyGuest" BOOLEAN;

-- AlterTable
ALTER TABLE "ReservationChange" ADD COLUMN     "changeRequestId" VARCHAR(32);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "reservationVersion" INTEGER NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requested" JSONB NOT NULL,
    "requestedSummary" JSONB NOT NULL,
    "oldTotalMinor" INTEGER NOT NULL,
    "previewTotalMinor" INTEGER NOT NULL,
    "paidTotalMinor" INTEGER NOT NULL,
    "lastConflict" VARCHAR(60),
    "decidedById" VARCHAR(32),
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" VARCHAR(500),
    "closedReason" "CancellationClosedReason",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_status_createdAt_idx" ON "ChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeRequest_reservationId_createdAt_idx" ON "ChangeRequest"("reservationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationChange_changeRequestId_key" ON "ReservationChange"("changeRequestId");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationChange" ADD CONSTRAINT "ReservationChange_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Preserve the choices made by S9 before it had dedicated columns.
UPDATE "CancellationRequest" AS request
SET "notifyGuest" = request."decisionReason" IS NOT NULL,
    "cancelReason" = COALESCE((
        SELECT event."changes" ->> 'cancelReason'
        FROM "AuditEvent" AS event
        WHERE event."entityType" = 'CancellationRequest'
          AND event."entityId" = request."id"
          AND event."action" = 'cancellation-request.approved'
          AND event."changes" ->> 'cancelReason' IN
              ('GUEST_REQUEST', 'CROSS_SYSTEM_CONFLICT', 'INVALID_DETAILS', 'OTHER')
        ORDER BY event."occurredAt" DESC, event."id" DESC
        LIMIT 1
    ), 'OTHER')
WHERE request."requestedBy" = 'STAFF';

CREATE UNIQUE INDEX "ChangeRequest_one_open"
    ON "ChangeRequest"("reservationId") WHERE "status" = 'OPEN';

ALTER TABLE "ChangeRequest"
    ADD CONSTRAINT "ChangeRequest_totals_check"
        CHECK ("oldTotalMinor" >= 0 AND "previewTotalMinor" >= 0
            AND "paidTotalMinor" > 0 AND "previewTotalMinor" <> "paidTotalMinor"),
    ADD CONSTRAINT "ChangeRequest_decision_check"
        CHECK (("status" = 'OPEN') = ("decidedById" IS NULL AND "decidedAt" IS NULL)
            AND ("decidedById" IS NULL) = ("decidedAt" IS NULL)
            AND ("status" = 'CLOSED') = ("closedReason" IS NOT NULL)
            AND ("status" = 'REJECTED') = ("decisionReason" IS NOT NULL));

COMMIT;
