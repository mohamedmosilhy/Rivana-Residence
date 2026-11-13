import "server-only";

import { ManageBranches } from "@/application/branches";
import {
  CatalogCommands,
  FACILITY_KIND,
  ROOM_KIND,
} from "@/application/content/catalog-commands";
import { CatalogQueries } from "@/application/content/catalog-queries";
import { PageCommands } from "@/application/content/page-commands";
import type { CacheInvalidator } from "@/application/cache/ports";
import type {
  FacilityDto,
  FacilityInput,
  RoomDto,
  RoomInput,
} from "@/application/content/ports";
import { getPublicSiteSettings } from "@/composition/admin";
import { NextCacheInvalidator } from "@/infrastructure/cache/next-cache-invalidator";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";

const clock = { now: () => new Date() };
const DEFAULT_TIME_ZONE = "Africa/Cairo";

export function roomCommands() {
  return new CatalogCommands<RoomDto, RoomInput>(
    new PrismaRoomRepository(),
    new NextCacheInvalidator(),
    ROOM_KIND,
    new PrismaBranchRepository(),
  );
}

export function roomQueries() {
  return new CatalogQueries<RoomDto, RoomInput>(
    new PrismaRoomRepository(),
    new PrismaMediaRepository(),
    new PrismaBranchRepository(),
  );
}

export function facilityCommands() {
  return new CatalogCommands<FacilityDto, FacilityInput>(
    new PrismaFacilityRepository(),
    new NextCacheInvalidator(),
    FACILITY_KIND,
    new PrismaBranchRepository(),
  );
}

export function facilityQueries() {
  return new CatalogQueries<FacilityDto, FacilityInput>(
    new PrismaFacilityRepository(),
    new PrismaMediaRepository(),
    new PrismaBranchRepository(),
    "facility",
  );
}

export function pageCommands() {
  return new PageCommands(
    new PrismaPageRepository(),
    new NextCacheInvalidator(),
    new PrismaBranchRepository(),
  );
}

/** Branch administration (spec 0002); also used by API-A2 and API-A3. */
export function manageBranches(
  cache: CacheInvalidator = new NextCacheInvalidator(),
) {
  const media = new PrismaMediaRepository();
  return new ManageBranches({
    branches: new PrismaBranchRepository(),
    cache,
    media: {
      async isUsableImage(id: string) {
        return (await media.findAdminById(id))?.status === "READY";
      },
    },
    clock,
  });
}

/** The property's time zone for admin times. */
export async function propertyTimeZone() {
  return (await getPublicSiteSettings())?.timeZone ?? DEFAULT_TIME_ZONE;
}
