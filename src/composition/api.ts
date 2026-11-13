import "server-only";

import type { StaffPrincipal } from "@/application/auth/ports";
import { ListBranches } from "@/application/branches";
import { CheckHealth } from "@/application/health";
import { RateLimiter } from "@/application/shared/rate-limit";
import { resolveStaffFromHeaders, throttleKeys } from "@/composition/auth";
import { manageBranches } from "@/composition/content";
import {
  getAvailabilityGrid,
  publicAvailability,
  manageBlocks,
  managePhysicalRooms,
} from "@/composition/inventory";
import {
  manageCommercialSettings,
  manageServices,
} from "@/composition/commercial";
import { getRateCalendar, manageRates } from "@/composition/pricing";
import { clientAddressFrom, isSameOriginRequest } from "@/composition/http";
import {
  getActiveBranchBySlug,
  getActiveBranches,
  getPublishedRoom,
  getPublishedRooms,
} from "@/composition/public";
import type { ThrottleRule } from "@/domain/auth/login-throttle";
import { NextRouteCacheInvalidator } from "@/infrastructure/cache/next-cache-invalidator";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaDatabaseProbe } from "@/infrastructure/db/prisma/database-probe";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";

// Composition for `/api/v1` Route Handlers and their shared HTTP layer.

const clock = { now: () => new Date() };

export function checkHealth() {
  return new CheckHealth(new PrismaDatabaseProbe()).execute();
}

/** Dependencies of the `/api/v1/_http` wrappers. */
export const httpDependencies = {
  isSameOrigin: isSameOriginRequest,
  resolveStaff: resolveStaffFromHeaders,
  rateLimit: (namespace: string, rule: ThrottleRule, request: Request) =>
    new RateLimiter(
      new PrismaPublicRateLimitStore(getPrisma(), clock),
      throttleKeys(),
    ).consume(namespace, rule, clientAddressFrom(request.headers)),
};

// Branch API (API-P1…P4, API-A1…A3; spec 0002). Public reads go through the
// same cached getters as the pages, so tag invalidation covers them.

export async function listPublicBranches() {
  return getActiveBranches();
}

export async function getPublicBranch(slug: string) {
  return getActiveBranchBySlug(slug);
}

/** The branch's published listings; null when the branch is not public. */
export async function listPublicRoomTypes(slug: string) {
  const branch = await getActiveBranchBySlug(slug);
  return branch ? { branch, rooms: await getPublishedRooms(branch) } : null;
}

/** One published listing of the branch; null when either is not public. */
export async function getPublicRoomType(slug: string, roomSlug: string) {
  const branch = await getActiveBranchBySlug(slug);
  const room = branch ? await getPublishedRoom(branch, roomSlug) : null;
  return branch && room ? { branch, room } : null;
}

export function listStaffBranches(staff: StaffPrincipal) {
  return new ListBranches(new PrismaBranchRepository()).forStaff(staff);
}

export function createBranch(staff: StaffPrincipal, input: unknown) {
  return manageBranches(new NextRouteCacheInvalidator()).create(staff, input);
}

export function updateBranch(
  staff: StaffPrincipal,
  id: string,
  input: unknown,
) {
  return manageBranches(new NextRouteCacheInvalidator()).update(
    staff,
    id,
    input,
  );
}

// Physical unit API (API-S21…S23; spec 0003, M6-T5).

export function listPhysicalRooms(staff: StaffPrincipal, branchId: string) {
  return managePhysicalRooms().list(staff, branchId);
}

export function createPhysicalRoom(
  staff: StaffPrincipal,
  branchId: string,
  input: unknown,
) {
  return managePhysicalRooms().create(staff, branchId, input);
}

export function updatePhysicalRoom(
  staff: StaffPrincipal,
  id: string,
  input: unknown,
) {
  return managePhysicalRooms().update(staff, id, input);
}

// Availability grid (API-S20; spec 0003, M6-T8).

export function readAvailabilityGrid(
  staff: StaffPrincipal,
  branchId: string,
  query: unknown,
) {
  return getAvailabilityGrid().execute(staff, branchId, query);
}

// Block API (API-S24…S27; spec 0003, M6-T6).

export function listBlocks(
  staff: StaffPrincipal,
  branchId: string,
  query: unknown,
) {
  return manageBlocks().list(staff, branchId, query);
}

export function createBlock(
  staff: StaffPrincipal,
  branchId: string,
  input: unknown,
) {
  return manageBlocks().create(staff, branchId, input);
}

export function updateBlock(staff: StaffPrincipal, id: string, input: unknown) {
  return manageBlocks().update(staff, id, input);
}

export function cancelBlock(staff: StaffPrincipal, id: string) {
  return manageBlocks().cancel(staff, id);
}

// Rate API (API-S30…S34; spec 0003, M6-T7).

export function readRates(
  staff: StaffPrincipal,
  roomTypeId: string,
  query: unknown,
) {
  return getRateCalendar().execute(staff, roomTypeId, query);
}

export function setBaseRate(
  staff: StaffPrincipal,
  roomTypeId: string,
  input: unknown,
) {
  return manageRates().setBaseRate(staff, roomTypeId, input);
}

export function createRatePeriod(
  staff: StaffPrincipal,
  roomTypeId: string,
  input: unknown,
) {
  return manageRates().createPeriod(staff, roomTypeId, input);
}

export function updateRatePeriod(
  staff: StaffPrincipal,
  id: string,
  input: unknown,
) {
  return manageRates().updatePeriod(staff, id, input);
}

export function deactivateRatePeriod(staff: StaffPrincipal, id: string) {
  return manageRates().deactivatePeriod(staff, id);
}

// Services and VAT API (API-S35, S36, A5; spec 0004, M7-T4).

export function listServices(staff: StaffPrincipal, branchId: string) {
  return manageServices().list(staff, branchId);
}

export function setService(
  staff: StaffPrincipal,
  branchId: string,
  kind: string,
  input: unknown,
) {
  return manageServices().set(staff, branchId, kind, input);
}

export function readCommercialSettings(staff: StaffPrincipal) {
  return manageCommercialSettings().read(staff);
}

export function updateCommercialSettings(
  staff: StaffPrincipal,
  input: unknown,
) {
  return manageCommercialSettings().update(staff, input);
}

// API-P5: uncached public availability with server-resolved branch identity.
export function searchPublicAvailability(slug: string, input: unknown) {
  return publicAvailability().execute(slug, input);
}
