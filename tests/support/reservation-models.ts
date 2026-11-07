// The reservation-module tables planned in docs/database/data-model.md
// (M6-M13). Dependency rule D-9: their SQL lives only in
// src/infrastructure/db/prisma/repositories/reservations/** and
// …/reporting/**. Extend this list when a milestone adds a table.
export const RESERVATION_MODELS = [
  "PhysicalRoom",
  "InventoryBlock",
  "RoomBaseRate",
  "RatePeriod",
  "ServiceOffering",
  "Coupon",
  "CouponBranch",
  "CommercialSettings",
  "Reservation",
  "ReservationRoom",
  "ReservationNight",
  "ReservationService",
  "CouponRedemption",
  "BranchSyncCheckpoint",
  "Payment",
  "PaymentEvent",
  "CancellationRequest",
  "Guest",
  "PhoneVerification",
  "WhatsAppSettings",
  "WhatsAppTemplate",
  "Broadcast",
  "NotificationOutbox",
] as const;

/** Folders allowed to touch reservation tables (D-9). */
export const RESERVATION_SQL_FOLDERS = [
  "src/infrastructure/db/prisma/repositories/reservations/",
  "src/infrastructure/db/prisma/repositories/reporting/",
] as const;
