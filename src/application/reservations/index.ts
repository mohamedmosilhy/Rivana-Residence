// Public surface of the reservations application module (dependency rule D-8).
export type {
  ReservationUnitOfWork,
  ReservationRepository,
  ReservationInsert,
  StoredReservation,
  PhoneBookingRow,
  BookingCrypto,
  StoredReservationLine,
  StoredReservationNight,
  StoredReservationSnapshot,
  StayReplacement,
  ReservationChangeInsert,
  ReservationContactChange,
  RoomAssignmentRequest,
  SyncCheckpointWriter,
  SyncStatusReader,
  SyncStatusSnapshot,
} from "./ports";
export type { ReservationStorageContext } from "./storage-context";
export {
  CreateWebsiteReservation,
  type CreateWebsiteReservationContext,
  type WebsiteReservationResult,
} from "./create-website-reservation";

export {
  CreateStaffReservation,
  RecordExternalReservation,
  type StaffBookingContext,
  type ExternalReferenceReader,
} from "./create-staff-reservation";
export type {
  StaffReservationInput,
  ExternalReservationInput,
} from "./staff-reservation-input";
export {
  ListReservations,
  GetReservation,
  GetReservationHistory,
  type StaffReservationView,
  type StaffReservationReader,
  type StaffReservationQuery,
  type ReservationListItem,
} from "./staff-reservation-reads";
export {
  ModifyReservation,
  type ModifyReservationContext,
  type ModifyReservationInput,
} from "./modify-reservation";
export {
  CancelReservation,
  CANCELLATION_REASONS,
  type CancelReservationContext,
  type CancelReservationInput,
  type CancellationReason,
} from "./cancel-reservation";
export {
  MarkChangeEnteredInHotelSystem,
  type MarkChangeEnteredInput,
} from "./mark-change-entered";
export { UpdateReservationGuest } from "./update-reservation-guest";
export {
  ProcessPaymentCallback,
  refundAttemptKey,
  type ProcessPaymentCallbackContext,
} from "./process-payment-callback";
export {
  AssignPhysicalRoom,
  RecordFrontDeskTransition,
} from "./reservation-front-desk";
export {
  ViewGuestReservation,
  ListGuestReservations,
  ViewGuestSessionReservation,
  type GuestReservationReader,
  type GuestReservationRecord,
  type GuestReservationSummary,
  type GuestReservationView,
  type GuestBranchContact,
} from "./guest-reservation-reads";
export {
  MarkEnteredInHotelSystem,
  ResendManageLink,
  type ResendManageLinkContext,
} from "./reservation-guest-access";
export {
  GetSyncStatus,
  RecordSyncCheckpoint,
  type SyncCheckpointContext,
  type SyncStatusView,
} from "./branch-sync";
