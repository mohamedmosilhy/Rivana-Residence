ALTER TABLE "ReservationService"
  ADD COLUMN "occupancyEffectiveFrom" DATE,
  ADD CONSTRAINT "ReservationService_occupancy_effective_date_check" CHECK (
    "occupancyEffectiveFrom" IS NULL OR "priceUnit" = 'PER_PERSON_PER_NIGHT'
  );
