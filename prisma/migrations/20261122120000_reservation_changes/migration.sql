-- M8-T9: change history and the "changed, update hotel system" flag (Q-83, Q-84).
ALTER TABLE "Reservation"
  ADD COLUMN "changeSeq" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pmsUpdatePendingSince" TIMESTAMPTZ(3);

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_changeSeq_check" CHECK ("changeSeq" >= 0),
  ADD CONSTRAINT "Reservation_pmsUpdatePending_check" CHECK (
    "pmsUpdatePendingSince" IS NULL OR "pmsEnteredAt" IS NOT NULL
  );

CREATE TABLE "ReservationChange" (
    "id" VARCHAR(32) NOT NULL,
    "reservationId" VARCHAR(32) NOT NULL,
    "branchId" VARCHAR(32) NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "actorType" VARCHAR(16) NOT NULL,
    "actorId" VARCHAR(32),
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "oldTotalMinor" INTEGER,
    "newTotalMinor" INTEGER,
    "overrideFromMinor" INTEGER,
    "overrideToMinor" INTEGER,
    "overrideReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReservationChange_seq_check" CHECK ("seq" > 0),
    CONSTRAINT "ReservationChange_kind_check" CHECK ("kind" IN ('STAY')),
    CONSTRAINT "ReservationChange_amounts_check" CHECK (
      ("oldTotalMinor" IS NULL OR "oldTotalMinor" >= 0)
      AND ("newTotalMinor" IS NULL OR "newTotalMinor" >= 0)
    ),
    -- A price override records original, overridden amount, and a reason together.
    CONSTRAINT "ReservationChange_override_check" CHECK (
      ("overrideFromMinor" IS NULL) = ("overrideToMinor" IS NULL)
      AND ("overrideToMinor" IS NULL) = ("overrideReason" IS NULL)
      AND ("overrideFromMinor" IS NULL OR ("overrideFromMinor" >= 0 AND "overrideToMinor" >= 0))
      AND ("overrideReason" IS NULL OR length(btrim("overrideReason")) > 0)
    )
);

CREATE UNIQUE INDEX "ReservationChange_reservationId_seq_key" ON "ReservationChange"("reservationId", "seq");
CREATE INDEX "ReservationChange_branchId_createdAt_idx" ON "ReservationChange"("branchId", "createdAt");

ALTER TABLE "ReservationChange" ADD CONSTRAINT "ReservationChange_reservationId_branchId_fkey"
  FOREIGN KEY ("reservationId", "branchId") REFERENCES "Reservation"("id", "branchId") ON DELETE RESTRICT ON UPDATE RESTRICT;
