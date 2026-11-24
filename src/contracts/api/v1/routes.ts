import {
  Coupon,
  CouponInput,
  CouponPatch,
  CouponQuery,
  CouponList,
} from "./coupons";
import { z } from "zod";

import {
  RoomTypeQuery,
  BranchDetail,
  BranchInput,
  BranchList,
  BranchPatch,
  RoomTypeDetail,
  RoomTypeList,
  StaffBranch,
  StaffBranchList,
  UpdatedStaffBranch,
} from "./branches";
import { AvailabilityQuery, AvailabilityResponse } from "./availability";
import { SyncCheckpointRequest, SyncQuery, SyncStatus } from "./branch-sync";
import { PaymentCallbackAck } from "./payments";
import { QuoteRequest, QuoteResponse } from "./quotes";
import {
  CancelReservationRequest,
  CreateStaffReservationRequest,
  ModifyReservationStayRequest,
  PmsUpdateRequest,
  UpdateReservationGuestRequest,
  RoomAssignmentInput,
  ReservationOperationNote,
  RecordExternalReservationRequest,
  StaffReservationQuery,
  StaffReservationDetail,
  StaffReservationList,
  StaffReservationHistory,
  IdempotencyKey,
  WebsiteReservationCreated,
  WebsiteReservationReplayed,
  WebsiteReservationRequest,
} from "./reservations";
import { HealthResponse } from "./health";
import {
  BlockGuestRequest,
  GuestDetail,
  GuestList,
  GuestQuery,
  GuestReservation,
  GuestReservationList,
} from "./guests";
import {
  Block,
  BlockInput,
  AvailabilityGrid,
  AvailabilityGridQuery,
  BlockList,
  BlockPatch,
  BlockQuery,
  PhysicalRoom,
  PhysicalRoomInput,
  PhysicalRoomList,
  PhysicalRoomPatch,
} from "./inventory";
import {
  BaseRateInput,
  RateCalendar,
  RatePeriod,
  RatePeriodInput,
  RatePeriodPatch,
  RateQuery,
} from "./pricing";
import {
  CommercialSettings,
  CommercialSettingsInput,
  ServiceOffering,
  ServiceOfferingInput,
  ServiceOfferingList,
} from "./commercial";
import { Money } from "./primitives";
import {
  WhatsAppSettingsInput,
  WhatsAppSetup,
  WhatsAppTemplate,
  WhatsAppTemplateInput,
  WhatsAppTemplateList,
  WhatsAppTemplatePatch,
  WhatsAppTestMessageInput,
  WhatsAppTestMessageResult,
} from "./whatsapp";

import {
  PhoneVerificationRequest,
  PhoneVerificationConfirmation,
  PhoneVerificationRequested,
  PhoneVerificationConfirmed,
} from "./phone-verifications";

/** One documented endpoint. The OpenAPI document is generated from these. */
export type ApiRoute = Readonly<{
  method: "get" | "post" | "put" | "patch" | "delete";
  /** OpenAPI path, e.g. `/api/v1/staff/reservations/{id}`. */
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  security: "public" | "staff" | "guest" | "webhook";
  request?: z.ZodType;
  requestOptional?: boolean;
  /** Query parameters, documented from the object's keys. */
  query?: z.ZodObject;
  /** Request headers the endpoint reads (for example `Idempotency-Key`). */
  headers?: readonly Readonly<{
    name: string;
    required: boolean;
    description: string;
    schema: z.ZodType;
  }>[];
  responses: Readonly<
    Record<
      number,
      Readonly<{
        description: string;
        schema?: z.ZodType;
        headers?: Readonly<Record<string, string>>;
      }>
    >
  >;
  /** Problem codes this endpoint can return. */
  errors: readonly string[];
}>;

const staffReservationPath = "/api/v1/staff/reservations";
const staffReservationKey = [
  {
    name: "Idempotency-Key",
    required: true,
    description:
      "8 to 128 printable ASCII characters. Matching requests replay the reservation.",
    schema: IdempotencyKey,
  },
];
const staffReadErrors = ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"];
const staffWriteErrors = [
  ...staffReadErrors,
  "CROSS_SITE_REQUEST",
  "MALFORMED_JSON",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "VALIDATION",
  "MISSING_IDEMPOTENCY_KEY",
  "IDEMPOTENCY_KEY_REUSED",
  "INVENTORY_UNAVAILABLE",
  "TRY_AGAIN",
];
const staffWriteResponses = {
  201: {
    description: "Confirmed reservation created.",
    schema: StaffReservationDetail,
    headers: { Location: "The staff reservation detail URL." },
  },
  200: {
    description: "The current reservation on a matching replay.",
    schema: StaffReservationDetail,
  },
};

const ifMatch = [
  {
    name: "If-Match",
    required: true,
    description:
      'The reservation version from the last read, formatted as "v<version>". Missing returns 428, an old one 412.',
    schema: z.string().regex(/^(?:W\/)?"?v\d{1,10}"?$/),
  },
];
const changeErrors = [
  ...staffReadErrors,
  "CROSS_SITE_REQUEST",
  "MALFORMED_JSON",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "VALIDATION",
  "PRECONDITION_REQUIRED",
  "STALE_VERSION",
  "INVALID_TRANSITION",
  "TRY_AGAIN",
];
const changeResponse = (description: string) => ({
  200: {
    description,
    schema: StaffReservationDetail,
    headers: { ETag: 'New reservation version formatted as "v<version>".' },
  },
});

export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: "post",
    path: "/api/v1/reservations",
    operationId: "createWebsiteReservation",
    summary:
      "API-P7. Create a website booking. Requires an `Idempotency-Key` header (8 to 128 printable characters) and a booking token from API-P10. Consumes the token and locks inventory. Pay at hotel confirms immediately. Online booking holds inventory and opens hosted checkout. Five requests per client per hour, on top of the per phone cap.",
    tag: "Reservations",
    security: "public",
    headers: [
      {
        name: "Idempotency-Key",
        required: true,
        description:
          "8 to 128 printable ASCII characters. A retry with the same key and body replays the booking.",
        schema: IdempotencyKey,
      },
    ],
    request: WebsiteReservationRequest,
    responses: {
      201: {
        description:
          "Booking confirmed for pay at hotel or awaiting online payment with a checkout URL. `manageUrl` is returned once.",
        schema: WebsiteReservationCreated,
      },
      200: {
        description:
          "Replay of the same key and body: the same reference, `manageUrl` null.",
        schema: WebsiteReservationReplayed,
      },
    },
    errors: [
      "MISSING_IDEMPOTENCY_KEY",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION",
      "IDEMPOTENCY_KEY_REUSED",
      "PHONE_NOT_VERIFIED",
      "PHONE_BLOCKED",
      "NOT_FOUND",
      "BRANCH_NOT_BOOKABLE",
      "PAYMENT_METHOD_UNAVAILABLE",
      "PAYMENT_UNAVAILABLE",
      "INVENTORY_UNAVAILABLE",
      "PRICE_CHANGED",
      "COUPON_INVALID",
      "SERVICE_UNAVAILABLE",
      "BOOKING_LIMIT_REACHED",
      "RATE_LIMITED",
      "TRY_AGAIN",
    ],
  },
  {
    method: "post",
    path: "/api/v1/payments/callback",
    operationId: "receivePaymentCallback",
    summary:
      "API-P8. Payment gateway callback. The body is the gateway's own payload (64 KB cap). The configured adapter verifies the raw bytes. A verified event is recorded once and answers `200`, also for duplicates and for events that change nothing. A failed verification answers `401` with no detail. No session and no CSRF.",
    tag: "Payments",
    security: "webhook",
    responses: {
      200: {
        description: "A verified event was recorded.",
        schema: PaymentCallbackAck,
      },
    },
    errors: ["WEBHOOK_SIGNATURE_INVALID", "PAYLOAD_TOO_LARGE", "TRY_AGAIN"],
  },
  {
    method: "get",
    path: staffReservationPath,
    operationId: "listStaffReservations",
    summary:
      "API-S1. List reservations in authorized branches. Date filters overlap the half-open stay.",
    tag: "Reservations",
    security: "staff",
    query: StaffReservationQuery,
    responses: {
      200: { description: "Reservation page.", schema: StaffReservationList },
    },
    errors: [...staffReadErrors, "INVALID_QUERY"],
  },
  {
    method: "get",
    path: staffReservationPath + "/{id}",
    operationId: "getStaffReservation",
    summary: "API-S2. Read a staff reservation and its version ETag.",
    tag: "Reservations",
    security: "staff",
    responses: {
      200: {
        description: "Reservation detail.",
        schema: StaffReservationDetail,
        headers: { ETag: 'Reservation version formatted as "v<version>".' },
      },
    },
    errors: staffReadErrors,
  },
  {
    method: "post",
    path: staffReservationPath,
    operationId: "createStaffReservation",
    summary:
      "API-S3. Confirm a staff pay-at-hotel reservation from the branch’s current date onwards.",
    tag: "Reservations",
    security: "staff",
    headers: staffReservationKey,
    request: CreateStaffReservationRequest,
    responses: staffWriteResponses,
    errors: [...staffWriteErrors, "SERVICE_UNAVAILABLE", "COUPON_INVALID"],
  },
  {
    method: "post",
    path: "/api/v1/staff/external-reservations",
    operationId: "recordExternalReservation",
    summary:
      "API-S4. Record an existing or historical hotel-system booking and reserve its inventory.",
    tag: "Reservations",
    security: "staff",
    headers: staffReservationKey,
    request: RecordExternalReservationRequest,
    responses: staffWriteResponses,
    errors: [...staffWriteErrors, "EXTERNAL_REFERENCE_EXISTS"],
  },
  {
    method: "patch",
    path: staffReservationPath + "/{id}",
    operationId: "updateReservationGuest",
    summary:
      "API-S5. Edit a nonterminal reservation’s guest details and notes. A website booking keeps its verified phone. Correcting the delivery phone or an existing email revokes the current manage link.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: UpdateReservationGuestRequest,
    responses: changeResponse("The edited reservation."),
    errors: changeErrors,
  },
  {
    method: "put",
    path: staffReservationPath + "/{id}/rooms/{lineId}/assignment",
    operationId: "assignPhysicalRoom",
    summary:
      "API-S10. Assign an available unit to a confirmed reservation line, or unassign it with null.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: RoomAssignmentInput,
    responses: changeResponse("The reservation with its current assignments."),
    errors: [...changeErrors, "ROOM_BLOCKED", "ROOM_ALREADY_ASSIGNED"],
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/check-in",
    operationId: "checkInReservation",
    summary:
      "API-S11. Check in a confirmed reservation from its arrival date when every line is assigned.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    responses: changeResponse("The checked-in reservation."),
    errors: changeErrors,
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/check-out",
    operationId: "checkOutReservation",
    summary:
      "API-S12. Check out a reservation. Early departure shortens the operational stay and caps the existing manage link expiry at 30 days after checkout.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    responses: changeResponse("The checked-out reservation."),
    errors: changeErrors,
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/no-show",
    operationId: "markReservationNoShow",
    summary:
      "API-S13. Mark a confirmed reservation as a no-show on or after its arrival date.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: ReservationOperationNote,
    requestOptional: true,
    responses: changeResponse("The no-show reservation."),
    errors: changeErrors,
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/manage-link",
    operationId: "resendReservationManageLink",
    summary: "API-S14. Rotate a manage link and queue it for delivery.",
    tag: "Reservations",
    security: "staff",
    responses: { 202: { description: "Manage link queued." } },
    errors: [
      ...staffReadErrors,
      "CROSS_SITE_REQUEST",
      "INVALID_TRANSITION",
      "CONFLICT",
      "TRY_AGAIN",
    ],
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/pms-entry",
    operationId: "markReservationEntered",
    summary:
      "API-S16. Record manual hotel-system entry once for a website booking.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: ReservationOperationNote,
    requestOptional: true,
    responses: changeResponse(
      "The reservation with its hotel-system entry marker.",
    ),
    errors: [...changeErrors, "CONFLICT"],
  },
  {
    method: "put",
    path: staffReservationPath + "/{id}/stay",
    operationId: "modifyStaffReservationStay",
    summary:
      "API-S6. Change the stay, units, occupancy or services of a confirmed reservation. New nights and added services use current prices; retained services keep their stored pricing terms (PR-11).",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: ModifyReservationStayRequest,
    responses: changeResponse("The changed reservation."),
    errors: [
      ...changeErrors,
      "INVENTORY_UNAVAILABLE",
      "PRICE_CHANGED",
      "SERVICE_UNAVAILABLE",
    ],
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/cancellation",
    operationId: "cancelStaffReservation",
    summary:
      "API-S9. Cancel an unpaid reservation, freeing its units and coupon redemption. Repeating it returns the cancelled reservation. Paid cancellation arrives in M9.",
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: CancelReservationRequest,
    responses: changeResponse("The cancelled reservation."),
    errors: changeErrors,
  },
  {
    method: "post",
    path: staffReservationPath + "/{id}/pms-update",
    operationId: "markReservationChangeEntered",
    summary:
      'API-S55. Record that the latest change was entered in the hotel system, clearing "changed, update hotel system".',
    tag: "Reservations",
    security: "staff",
    headers: ifMatch,
    request: PmsUpdateRequest,
    responses: changeResponse("The reservation without the pending flag."),
    errors: [...changeErrors, "NO_PMS_UPDATE_PENDING", "PMS_UPDATE_STALE"],
  },
  {
    method: "get",
    path: staffReservationPath + "/{id}/history",
    operationId: "getStaffReservationHistory",
    summary: "API-S15. Read redacted audit events for a reservation.",
    tag: "Reservations",
    security: "staff",
    responses: {
      200: {
        description: "Reservation audit history.",
        schema: StaffReservationHistory,
      },
    },
    errors: staffReadErrors,
  },
  {
    method: "post",
    path: "/api/v1/phone-verifications",
    operationId: "requestPhoneVerification",
    summary:
      "API-P9. Send a WhatsApp verification code after commit. Three per phone per rolling 15 minutes, ten per rolling 24 hours, ten per client per hour.",
    tag: "Guests",
    security: "public",
    request: PhoneVerificationRequest,
    responses: {
      201: {
        description:
          "Code valid for ten minutes. Resend availability follows the rolling phone limits; no additional cooldown.",
        schema: PhoneVerificationRequested,
      },
    },
    errors: [
      "VALIDATION",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "PHONE_BLOCKED",
      "WHATSAPP_NOT_CONFIGURED",
      "VERIFICATION_UNAVAILABLE",
      "RATE_LIMITED",
      "TRY_AGAIN",
    ],
  },
  {
    method: "post",
    path: "/api/v1/phone-verifications/{verificationId}/confirmation",
    operationId: "confirmPhoneVerification",
    summary:
      "API-P10. Confirm a six digit code, at most five attempts. Twenty requests per client per ten minutes.",
    tag: "Guests",
    security: "public",
    request: PhoneVerificationConfirmation,
    responses: {
      200: {
        description:
          "Thirty minute token, stored only as a hash. BOOKING is single use in P7; GUEST_SESSION authenticates guest reads. Confirming the same verification again returns 410.",
        schema: PhoneVerificationConfirmed,
      },
    },
    errors: [
      "VALIDATION",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "PHONE_BLOCKED",
      "VERIFICATION_CODE_INVALID",
      "VERIFICATION_EXPIRED",
      "VERIFICATION_UNAVAILABLE",
      "RATE_LIMITED",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/health",
    operationId: "getHealth",
    summary: "Report whether the app and its database are answering.",
    tag: "System",
    security: "public",
    responses: {
      200: {
        description: "The app and database are up.",
        schema: HealthResponse,
      },
    },
    errors: ["TRY_AGAIN"],
  },
  {
    method: "get",
    path: "/api/v1/branches",
    operationId: "listBranches",
    summary: "API-P1. Active branches by display order (the chooser).",
    tag: "Branches",
    security: "public",
    responses: {
      200: { description: "Active branches.", schema: BranchList },
    },
    errors: [],
  },
  {
    method: "get",
    path: "/api/v1/branches/{branchSlug}",
    operationId: "getBranch",
    summary: "API-P2. One active branch with contact, address, and map.",
    tag: "Branches",
    security: "public",
    responses: {
      200: { description: "The branch.", schema: BranchDetail },
    },
    errors: ["NOT_FOUND"],
  },
  {
    method: "get",
    path: "/api/v1/branches/{branchSlug}/room-types",
    operationId: "listRoomTypes",
    summary:
      "API-P3. Published rooms and apartments of a branch; `?type=ROOM|APARTMENT` filters.",
    tag: "Branches",
    security: "public",
    query: RoomTypeQuery,
    responses: {
      200: { description: "Published listings.", schema: RoomTypeList },
    },
    errors: ["NOT_FOUND", "INVALID_QUERY"],
  },
  {
    method: "get",
    path: "/api/v1/branches/{branchSlug}/room-types/{roomSlug}",
    operationId: "getRoomType",
    summary: "API-P4. One published listing of the branch.",
    tag: "Branches",
    security: "public",
    responses: {
      200: { description: "The listing.", schema: RoomTypeDetail },
    },
    errors: ["NOT_FOUND"],
  },
  {
    method: "get",
    path: "/api/v1/branches/{branchSlug}/availability",
    operationId: "searchAvailability",
    summary:
      "API-P5. Uncached published listing availability and accommodation prices before VAT.",
    tag: "Inventory",
    security: "public",
    query: AvailabilityQuery,
    responses: {
      200: {
        description:
          "Availability for the requested quantity (default 1, maximum 5); no hold. Rates and inventory are read afresh. 60 requests per 60 second client window across branches, shared anonymous fallback without a trusted address.",
        schema: AvailabilityResponse,
      },
    },
    errors: ["INVALID_QUERY", "VALIDATION", "NOT_FOUND", "RATE_LIMITED"],
  },
  {
    method: "post",
    path: "/api/v1/quotes",
    operationId: "createQuote",
    summary:
      "API-P6. Server computed quote: accommodation for one to five units, requested services, an optional coupon, and VAT. Reads only: no hold, lock, or cache. The client never sends a price.",
    tag: "Quotes",
    security: "public",
    request: QuoteRequest,
    responses: {
      200: {
        description:
          "The breakdown, or `available: false` with the unavailable line indexes and a null quote. 60 requests per minute per client, and 20 per 10 minutes for requests that send a coupon code.",
        schema: QuoteResponse,
      },
    },
    errors: [
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION",
      "NOT_FOUND",
      "COUPON_INVALID",
      "SERVICE_UNAVAILABLE",
      "RATE_LIMITED",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches",
    operationId: "listStaffBranches",
    summary:
      "API-A1. The caller's branches (Admin: all). Needs inventory:read.",
    tag: "Branches",
    security: "staff",
    responses: {
      200: { description: "The caller's branches.", schema: StaffBranchList },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN"],
  },
  {
    method: "post",
    path: "/api/v1/staff/branches",
    operationId: "createBranch",
    summary:
      "API-A2. Create a branch with its three unpublished pages (Admin, branches:manage). Audited.",
    tag: "Branches",
    security: "staff",
    request: BranchInput,
    responses: {
      201: { description: "The new branch.", schema: StaffBranch },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "CONFLICT",
      "VALIDATION",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/branches/{id}",
    operationId: "updateBranch",
    summary:
      "API-A3. Change a branch (Admin, branches:manage). Enabling online payment requires a ready gateway. Audited.",
    tag: "Branches",
    security: "staff",
    request: BranchPatch,
    responses: {
      200: { description: "The updated branch.", schema: UpdatedStaffBranch },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "VALIDATION",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches/{branchId}/physical-rooms",
    operationId: "listPhysicalRooms",
    summary:
      "API-S21. Every physical unit of the branch, inactive ones included. Needs inventory:read.",
    tag: "Inventory",
    security: "staff",
    responses: {
      200: { description: "The branch's units.", schema: PhysicalRoomList },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"],
  },
  {
    method: "post",
    path: "/api/v1/staff/branches/{branchId}/physical-rooms",
    operationId: "createPhysicalRoom",
    summary:
      "API-S22. Add an active unit to a listing of the branch (inventory:manage). Audited. Returns Location.",
    tag: "Inventory",
    security: "staff",
    request: PhysicalRoomInput,
    responses: {
      201: { description: "The new unit.", schema: PhysicalRoom },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "VALIDATION",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/physical-rooms/{id}",
    operationId: "updatePhysicalRoom",
    summary:
      "API-S23. Change a unit's label, notes, or activity (inventory:manage). Deactivation never oversells: it takes the listing lock. Audited.",
    tag: "Inventory",
    security: "staff",
    request: PhysicalRoomPatch,
    responses: {
      200: { description: "The updated unit.", schema: PhysicalRoom },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "INVENTORY_UNAVAILABLE",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches/{branchId}/availability",
    operationId: "getAvailabilityGrid",
    summary:
      "API-S20. Capacity, sold, free, and blocked units per listing and night for a window of at most 62 nights (exclusive end), every listing of the branch in any publication status. Never cached. Needs inventory:read.",
    tag: "Inventory",
    security: "staff",
    query: AvailabilityGridQuery,
    responses: {
      200: { description: "The grid.", schema: AvailabilityGrid },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION",
      "INVALID_QUERY",
    ],
  },
  {
    method: "post",
    path: "/api/v1/staff/branches/{branchId}/sync-checkpoints",
    operationId: "recordSyncCheckpoint",
    summary:
      "API-S28. Record a manual sync start or completion for the branch. Needs reservations:record-external.",
    tag: "Reservations",
    security: "staff",
    request: SyncCheckpointRequest,
    query: SyncQuery,
    responses: {
      201: {
        description:
          "The branch sync status after the checkpoint was recorded.",
        schema: SyncStatus,
      },
    },
    errors: [
      ...staffReadErrors,
      "CROSS_SITE_REQUEST",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION",
      "INVALID_QUERY",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches/{branchId}/sync-status",
    operationId: "getSyncStatus",
    summary:
      "API-S29. Read the branch reminder deadline and the backlog of website reservations awaiting hotel system entry. Needs reservations:read.",
    tag: "Reservations",
    security: "staff",
    query: SyncQuery,
    responses: {
      200: {
        description: "The current branch sync status.",
        schema: SyncStatus,
      },
    },
    errors: [...staffReadErrors, "INVALID_QUERY"],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches/{branchId}/blocks",
    operationId: "listBlocks",
    summary:
      "API-S24. Uncancelled blocks overlapping a window of at most 62 nights (exclusive end). Needs inventory:read.",
    tag: "Inventory",
    security: "staff",
    query: BlockQuery,
    responses: {
      200: { description: "The overlapping blocks.", schema: BlockList },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION",
      "INVALID_QUERY",
    ],
  },
  {
    method: "post",
    path: "/api/v1/staff/branches/{branchId}/blocks",
    operationId: "createBlock",
    summary:
      "API-S25. Block one unit (inventory:block). Never oversells: it takes the listing lock and refuses with INVENTORY_UNAVAILABLE naming the first night. Overlap on the unit is a CONFLICT. Audited. Returns Location.",
    tag: "Inventory",
    security: "staff",
    request: BlockInput,
    responses: {
      201: { description: "The new block.", schema: Block },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "INVENTORY_UNAVAILABLE",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/blocks/{id}",
    operationId: "updateBlock",
    summary:
      "API-S26. Change a block's end date or note (inventory:block). An end date change takes the listing lock; a cancelled block cannot change. Audited.",
    tag: "Inventory",
    security: "staff",
    request: BlockPatch,
    responses: {
      200: { description: "The updated block.", schema: Block },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "INVENTORY_UNAVAILABLE",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "delete",
    path: "/api/v1/staff/blocks/{id}",
    operationId: "cancelBlock",
    summary:
      "API-S27. Soft cancel a block (inventory:block). Repeating it succeeds without another audit event. Audited.",
    tag: "Inventory",
    security: "staff",
    responses: {
      204: { description: "The block is cancelled." },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/room-types/{roomTypeId}/rates",
    operationId: "getRates",
    summary:
      "API-S30. Base rate, intersecting periods, and resolved calendar for at most 62 nights. Needs pricing:read.",
    tag: "Pricing",
    security: "staff",
    query: RateQuery,
    responses: {
      200: { description: "The listing's rates.", schema: RateCalendar },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION",
      "INVALID_QUERY",
    ],
  },
  {
    method: "put",
    path: "/api/v1/staff/room-types/{roomTypeId}/base-rate",
    operationId: "setBaseRate",
    summary:
      "API-S31. Create or replace the base nightly rate (pricing:manage). Audited.",
    tag: "Pricing",
    security: "staff",
    request: BaseRateInput,
    responses: {
      200: { description: "The base nightly rate.", schema: Money },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "post",
    path: "/api/v1/staff/room-types/{roomTypeId}/rate-periods",
    operationId: "createRatePeriod",
    summary:
      "API-S32. Create an active date rate period (pricing:manage). Audited. Returns Location.",
    tag: "Pricing",
    security: "staff",
    request: RatePeriodInput,
    responses: {
      201: { description: "The new rate period.", schema: RatePeriod },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/rate-periods/{id}",
    operationId: "updateRatePeriod",
    summary:
      "API-S33. Change or reactivate a date rate period (pricing:manage). Audited.",
    tag: "Pricing",
    security: "staff",
    request: RatePeriodPatch,
    responses: {
      200: { description: "The changed rate period.", schema: RatePeriod },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "delete",
    path: "/api/v1/staff/rate-periods/{id}",
    operationId: "deactivateRatePeriod",
    summary:
      "API-S34. Soft deactivate a date rate period (pricing:manage). Repeating it succeeds without another audit. Audited.",
    tag: "Pricing",
    security: "staff",
    responses: { 204: { description: "The period is inactive." } },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/branches/{id}/services",
    operationId: "listServices",
    summary:
      "API-S35. Both service kinds for a branch; a kind with no offering is inactive with no price. Needs pricing:read in the branch.",
    tag: "Commercial",
    security: "staff",
    responses: {
      200: {
        description: "The branch's services.",
        schema: ServiceOfferingList,
      },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"],
  },
  {
    method: "put",
    path: "/api/v1/staff/branches/{id}/services/{kind}",
    operationId: "setService",
    summary:
      "API-S36. Create or replace a branch service offering (services:manage in the branch). Audited; an identical write adds no audit event.",
    tag: "Commercial",
    security: "staff",
    request: ServiceOfferingInput,
    responses: {
      200: { description: "The stored offering.", schema: ServiceOffering },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/settings/commercial",
    operationId: "getCommercialSettings",
    summary: "API-A5. The VAT rate in basis points. Needs pricing:read.",
    tag: "Commercial",
    security: "staff",
    responses: {
      200: {
        description: "The commercial settings.",
        schema: CommercialSettings,
      },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN"],
  },
  {
    method: "put",
    path: "/api/v1/staff/settings/commercial",
    operationId: "updateCommercialSettings",
    summary:
      "API-A5. Set the VAT rate, an integer 0 to 10000 basis points (tax:manage, Admin only). Audited; applies to later quotes only.",
    tag: "Commercial",
    security: "staff",
    request: CommercialSettingsInput,
    responses: {
      200: {
        description: "The commercial settings.",
        schema: CommercialSettings,
      },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },

  {
    method: "get",
    path: "/api/v1/staff/coupons",
    operationId: "listCoupons",
    summary:
      "API-S37. Scoped coupon list. Managers see only coupons entirely within their branches, never global coupons. Counts are zero until M8.",
    tag: "Commercial",
    security: "staff",
    query: CouponQuery,
    responses: { 200: { description: "The scoped page.", schema: CouponList } },
    errors: ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_QUERY", "VALIDATION"],
  },
  {
    method: "post",
    path: "/api/v1/staff/coupons",
    operationId: "createCoupon",
    summary:
      "API-S38. Create a coupon (coupons:manage), audited atomically. Managers may choose only assigned branches. Returns Location.",
    tag: "Commercial",
    security: "staff",
    request: CouponInput,
    responses: { 201: { description: "The created coupon.", schema: Coupon } },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "CONFLICT",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/coupons/{id}",
    operationId: "updateCoupon",
    summary:
      "API-S39. Patch a coupon under its row lock, audited atomically. Code is immutable. Omitted fields retain their values; null clears optional fields. Identical changes add no audit event.",
    tag: "Commercial",
    security: "staff",
    request: CouponPatch,
    responses: { 200: { description: "The updated coupon.", schema: Coupon } },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/settings/whatsapp",
    operationId: "getWhatsAppSettings",
    summary:
      "API-A6. The WhatsApp setup (settings:edit, Admin only): number, phone number id, whether the server holds an access token (never the token), Q-71 configured flag, setup gaps, and the last test result.",
    tag: "Settings",
    security: "staff",
    responses: {
      200: { description: "The WhatsApp setup.", schema: WhatsAppSetup },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN"],
  },
  {
    method: "put",
    path: "/api/v1/staff/settings/whatsapp",
    operationId: "updateWhatsAppSettings",
    summary:
      "API-A6. Set or clear the business number and phone number id (settings:edit, Admin only). Audited under the settings row lock. An accessToken field is refused.",
    tag: "Settings",
    security: "staff",
    request: WhatsAppSettingsInput,
    responses: {
      200: { description: "The WhatsApp setup.", schema: WhatsAppSetup },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/whatsapp-templates",
    operationId: "listWhatsAppTemplates",
    summary: "API-A7. Every WhatsApp template (settings:edit, Admin only).",
    tag: "Settings",
    security: "staff",
    responses: {
      200: { description: "The templates.", schema: WhatsAppTemplateList },
    },
    errors: ["UNAUTHENTICATED", "FORBIDDEN"],
  },
  {
    method: "post",
    path: "/api/v1/staff/whatsapp-templates",
    operationId: "createWhatsAppTemplate",
    summary:
      "API-A7. Add a template (settings:edit, Admin only). Variable keys come from the per purpose allowlist; one active template per purpose and language except MARKETING. Audited; returns Location.",
    tag: "Settings",
    security: "staff",
    request: WhatsAppTemplateInput,
    responses: {
      201: { description: "The created template.", schema: WhatsAppTemplate },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "CONFLICT",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "patch",
    path: "/api/v1/staff/whatsapp-templates/{id}",
    operationId: "updateWhatsAppTemplate",
    summary:
      "API-A7. Patch a template under its row lock (settings:edit, Admin only); the merged template is validated again. Deactivate instead of deleting. Identical changes add no audit event.",
    tag: "Settings",
    security: "staff",
    request: WhatsAppTemplatePatch,
    responses: {
      200: { description: "The updated template.", schema: WhatsAppTemplate },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "post",
    path: "/api/v1/staff/settings/whatsapp/test-message",
    operationId: "sendWhatsAppTestMessage",
    summary:
      "API-A8. Send the chosen template, or the active en TEST template, filled with fake sample values (settings:edit, Admin only). 5 per 10 minutes per Admin. The result is stored on the settings and audited; the recipient is never stored.",
    tag: "Settings",
    security: "staff",
    request: WhatsAppTestMessageInput,
    responses: {
      200: {
        description: "The provider accepted the message.",
        schema: WhatsAppTestMessageResult,
      },
    },
    errors: [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CROSS_SITE_REQUEST",
      "NOT_FOUND",
      "VALIDATION",
      "RATE_LIMITED",
      "WHATSAPP_TEST_FAILED",
      "WHATSAPP_NOT_CONFIGURED",
    ],
  },
  {
    method: "get",
    path: "/api/v1/staff/guests",
    operationId: "listGuests",
    summary:
      "API-S50. Search guests by name or phone (guests:read). Admin sees every guest. A Receptionist or Manager sees only guests with a reservation in their assigned branches, and counts only those reservations.",
    tag: "Guests",
    security: "staff",
    query: GuestQuery,
    responses: { 200: { description: "Guest page.", schema: GuestList } },
    errors: [...staffReadErrors, "INVALID_QUERY"],
  },
  {
    method: "get",
    path: "/api/v1/staff/guests/{id}",
    operationId: "getGuest",
    summary:
      "API-S51. Guest profile with reservations in the caller's branches and the block history (guests:read). A Receptionist or Manager gets 404 for a guest with no reservation in their branches.",
    tag: "Guests",
    security: "staff",
    responses: { 200: { description: "Guest detail.", schema: GuestDetail } },
    errors: staffReadErrors,
  },
  {
    method: "post",
    path: "/api/v1/staff/guests/{id}/block",
    operationId: "blockGuest",
    summary:
      "API-S52. Block a guest's phone for every branch (guests:block). Invalidates the phone's open codes and tokens. Repeating it changes nothing.",
    tag: "Guests",
    security: "staff",
    request: BlockGuestRequest,
    responses: { 200: { description: "The guest.", schema: GuestDetail } },
    errors: [
      ...staffReadErrors,
      "CROSS_SITE_REQUEST",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "delete",
    path: "/api/v1/staff/guests/{id}/block",
    operationId: "unblockGuest",
    summary:
      "API-S53. Lift a block (guests:block). The history stays in the audit log. Repeating it changes nothing.",
    tag: "Guests",
    security: "staff",
    request: BlockGuestRequest,
    responses: { 200: { description: "The guest.", schema: GuestDetail } },
    errors: [
      ...staffReadErrors,
      "CROSS_SITE_REQUEST",
      "MALFORMED_JSON",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "VALIDATION",
      "TRY_AGAIN",
    ],
  },
  {
    method: "get",
    path: "/api/v1/guest/reservation",
    operationId: "getGuestReservation",
    summary:
      "API-G1. One reservation for the holder of a manage link token (`Authorization: Bearer`). Sixty requests per client per minute. View only in M8.",
    tag: "Guests",
    security: "guest",
    responses: {
      200: { description: "The reservation.", schema: GuestReservation },
    },
    errors: ["UNAUTHENTICATED", "RATE_LIMITED"],
  },
  {
    method: "get",
    path: "/api/v1/guest/reservations",
    operationId: "listGuestReservations",
    summary:
      "API-G3. Reservations of a verified phone, newest first (`Authorization: Bearer` guest session token from API-P10).",
    tag: "Guests",
    security: "guest",
    responses: {
      200: {
        description: "Reservation summaries.",
        schema: GuestReservationList,
      },
    },
    errors: ["PHONE_NOT_VERIFIED", "PHONE_BLOCKED", "RATE_LIMITED"],
  },
  {
    method: "get",
    path: "/api/v1/guest/reservations/{reference}",
    operationId: "getGuestSessionReservation",
    summary:
      "API-G4. One reservation of a verified phone by reference. A reference that is not this phone's is a 404.",
    tag: "Guests",
    security: "guest",
    responses: {
      200: { description: "The reservation.", schema: GuestReservation },
    },
    errors: [
      "PHONE_NOT_VERIFIED",
      "PHONE_BLOCKED",
      "NOT_FOUND",
      "RATE_LIMITED",
    ],
  },
];
