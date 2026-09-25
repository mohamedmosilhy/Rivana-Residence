import "server-only";

import {
  CatalogCommands,
  FACILITY_KIND,
  ROOM_KIND,
} from "@/application/content/catalog-commands";
import { CatalogQueries } from "@/application/content/catalog-queries";
import { PageCommands } from "@/application/content/page-commands";
import { PromotionAdmin } from "@/application/promotions/promotion-admin";
import type {
  FacilityDto,
  FacilityInput,
  RoomDto,
  RoomInput,
} from "@/application/ports/repositories";
import { getPublicSiteSettings } from "@/composition/admin";
import { NextCacheInvalidator } from "@/infrastructure/cache/next-cache-invalidator";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";

const clock = { now: () => new Date() };
const DEFAULT_TIME_ZONE = "Africa/Cairo";

export function roomCommands() {
  return new CatalogCommands<RoomDto, RoomInput>(
    new PrismaRoomRepository(),
    new NextCacheInvalidator(),
    ROOM_KIND,
  );
}

export function roomQueries() {
  return new CatalogQueries<RoomDto, RoomInput>(
    new PrismaRoomRepository(),
    new PrismaMediaRepository(),
  );
}

export function facilityCommands() {
  return new CatalogCommands<FacilityDto, FacilityInput>(
    new PrismaFacilityRepository(),
    new NextCacheInvalidator(),
    FACILITY_KIND,
  );
}

export function facilityQueries() {
  return new CatalogQueries<FacilityDto, FacilityInput>(
    new PrismaFacilityRepository(),
    new PrismaMediaRepository(),
    "facility",
  );
}

export function pageCommands() {
  return new PageCommands(
    new PrismaPageRepository(),
    new NextCacheInvalidator(),
  );
}

export function promotionAdmin() {
  return new PromotionAdmin(
    new PrismaPromotionRepository(),
    new NextCacheInvalidator(),
    clock,
  );
}

/** The property's time zone for schedules and admin times. */
export async function propertyTimeZone() {
  return (await getPublicSiteSettings())?.timeZone ?? DEFAULT_TIME_ZONE;
}
