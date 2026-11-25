// Public surface of the reservations application module (dependency rule D-8).
export type {
  ReservationUnitOfWork,
  CancellationRequestStore,
  CancellationRequestReader,
  CancellationRequestRecord,
  CancellationRequestListItem,
  GuestCancellationRequest,
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
  DecideCancellationRequest,
  ListCancellationRequests,
  type DecideCancellationContext,
  type DecisionResult,
} from "./decide-cancellation-request";
export { CompleteRefund, type CompleteRefundContext } from "./complete-refund";
export { RefundDispatcher, type SendRefundContext } from "./send-refund";
export {
  CancelPaidReservation,
  type CancelPaidReservationContext,
} from "./cancel-paid-reservation";
export {
  RetryRefund,
  ListReservationPayments,
  type RetryRefundContext,
} from "./retry-refund";
export {
  ApplyGuestChange,
  PreviewGuestChange,
  type GuestChangeContext,
} from "./guest-reservation-changes";
export type { GuestReservationAccess } from "./guest-reservation-write-access";
export {
  RequestCancellation,
  type RequestCancellationContext,
} from "./request-cancellation";
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
  ExpirePaymentHolds,
  type ExpirePaymentHoldsContext,
  type ExpirePaymentHoldsSummary,
} from "./expire-payment-holds";
export {
  ReconcilePayments,
  type ReconcilePaymentsContext,
  type ReconcilePaymentsSummary,
} from "./reconcile-payments";
export {
  AssignPhysicalRoom,
  RecordFrontDeskTransition,
  type FrontDeskTransitionContext,
} from "./reservation-front-desk";
export {
  ViewGuestReservation,
  ListGuestReservations,
  ViewGuestSessionReservation,
  unlinkedReservationPhone,
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

export type { GuestChangePreview } from "./guest-change-preview";
