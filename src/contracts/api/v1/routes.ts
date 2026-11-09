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
import { HealthResponse } from "./health";
import {
  PhysicalRoom,
  PhysicalRoomInput,
  PhysicalRoomList,
  PhysicalRoomPatch,
} from "./inventory";

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
];
