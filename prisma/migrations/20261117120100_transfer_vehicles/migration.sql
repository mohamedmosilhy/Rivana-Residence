-- The preceding migration commits the enum value before these checks use it.
ALTER TABLE "ServiceOffering" ADD COLUMN "maxVehicles" INTEGER;
ALTER TABLE "ReservationService" ADD COLUMN vehicles INTEGER;
UPDATE "ServiceOffering" SET "maxVehicles" = 3 WHERE kind = 'AIRPORT_TRANSFER';
UPDATE "ReservationService" SET vehicles = 1 WHERE kind = 'AIRPORT_TRANSFER';
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_vehicles_check" CHECK (
  (kind = 'AIRPORT_TRANSFER' AND "maxVehicles" IS NOT NULL AND "maxVehicles" BETWEEN 1 AND 10)
  OR (kind = 'BREAKFAST' AND "maxVehicles" IS NULL)
), ADD CONSTRAINT "ServiceOffering_vehicle_unit_check" CHECK (
  "priceUnit" <> 'PER_VEHICLE' OR (kind = 'AIRPORT_TRANSFER' AND "childPriceMinor" IS NULL)
);
ALTER TABLE "ReservationService" ADD CONSTRAINT "ReservationService_vehicles_check" CHECK (
  (kind = 'AIRPORT_TRANSFER' AND vehicles IS NOT NULL AND vehicles BETWEEN 1 AND 10)
  OR (kind = 'BREAKFAST' AND vehicles IS NULL)
), ADD CONSTRAINT "ReservationService_vehicle_unit_check" CHECK (
  "priceUnit" <> 'PER_VEHICLE' OR (kind = 'AIRPORT_TRANSFER' AND "childPriceMinor" IS NULL AND "adultQuantity" = vehicles AND "childQuantity" = 0)
);
