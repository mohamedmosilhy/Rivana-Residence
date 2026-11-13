import {
  Coupon,
  CouponInput,
  CouponPatch,
  CouponQuery,
  CouponList,
} from "./coupons";
import type { z } from "zod";

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
} from "./branches";
import { AvailabilityQuery, AvailabilityResponse } from "./availability";
import { QuoteRequest, QuoteResponse } from "./quotes";
import { HealthResponse } from "./health";
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

/** One documented endpoint. The OpenAPI document is generated from these. */
export type ApiRoute = Readonly<{
  method: "get" | "post" | "put" | "patch" | "delete";
  /** OpenAPI path, e.g. `/api/v1/staff/reservations/{id}`. */
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  security: "public" | "staff" | "webhook";
  request?: z.ZodType;
  /** Query parameters, documented from the object's keys. */
  query?: z.ZodObject;
  responses: Readonly<
    Record<number, Readonly<{ description: string; schema?: z.ZodType }>>
  >;
  /** Problem codes this endpoint can return. */
  errors: readonly string[];
}>;

export const API_ROUTES: readonly ApiRoute[] = [
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
      "API-A3. Change a branch (Admin, branches:manage). Online booking stays off until its prerequisites exist. Audited.",
    tag: "Branches",
    security: "staff",
    request: BranchPatch,
    responses: {
      200: { description: "The updated branch.", schema: StaffBranch },
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
];
