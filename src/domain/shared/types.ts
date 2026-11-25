// Staff roles (ADR 018). The database enum keeps its original name,
// `AdminRole`. Receptionists and Managers are branch scoped; Admins are
// implicitly all-branch; Editors are CMS-only with no branch scope (Q-01).
export const STAFF_ROLES = [
  "EDITOR",
  "ADMIN",
  "RECEPTIONIST",
  "MANAGER",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

// A listing is a room type or an apartment type (Q-43, ADR 026).
export const ACCOMMODATION_TYPES = ["ROOM", "APARTMENT"] as const;
export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number];

export const MEDIA_STATUSES = [
  "PENDING",
  "READY",
  "FAILED",
  "DELETED",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const ENQUIRY_STATUSES = [
  "NEW",
  "READ",
  "ARCHIVED",
  "DELIVERY_FAILED",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export type RichTextDocument = Readonly<{
  type: "doc";
  content: readonly Readonly<Record<string, unknown>>[];
}>;

// Domain mirrors of the persisted enums (M8 reservations, M9 payments and requests).
export const RESERVATION_STATUSES = [
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export const RESERVATION_SOURCES = ["WEBSITE", "STAFF", "EXTERNAL"] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];
export const PAYMENT_METHODS = ["PAY_AT_HOTEL", "ONLINE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const RESERVATION_PAYMENT_STATUSES = [
  "NOT_REQUIRED",
  "AWAITING",
  "PAID",
  "REFUND_PENDING",
  "REFUNDED",
  "FAILED",
] as const;
export type ReservationPaymentStatus =
  (typeof RESERVATION_PAYMENT_STATUSES)[number];
export const PAYMENT_STATUSES = [
  "INITIATED",
  "SUCCEEDED",
  "EXPIRED",
  "FAILED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const CANCELLATION_REQUEST_STATUSES = [
  "OPEN",
  "APPROVED",
  "REJECTED",
  "REFUND_PENDING",
  "REFUND_FAILED",
  "COMPLETED",
  "CLOSED",
] as const;
export type CancellationRequestStatus =
  (typeof CANCELLATION_REQUEST_STATUSES)[number];
export const CANCELLATION_CLOSED_REASONS = [
  "STAFF_CANCELLED",
  "NO_SHOW",
  "CHECKED_IN",
] as const;
export type CancellationClosedReason =
  (typeof CANCELLATION_CLOSED_REASONS)[number];
export const VERIFICATION_PURPOSES = ["BOOKING", "GUEST_SESSION"] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];
/** How a verification code was delivered, and so what it proves (ADR 031). */
export const VERIFICATION_CHANNELS = ["WHATSAPP", "EMAIL"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];
export const SYNC_CHECKPOINT_KINDS = ["STARTED", "COMPLETED"] as const;
export type SyncCheckpointKind = (typeof SYNC_CHECKPOINT_KINDS)[number];
