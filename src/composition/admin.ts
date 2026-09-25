import "server-only";

import { unstable_cache } from "next/cache";

import { GetAdminOverview } from "@/application/admin/get-overview";
import { ResolveBooking } from "@/application/booking/resolve-booking";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import { ListEnquiries } from "@/application/enquiries/list-enquiries";
import {
  GetAdminSiteSettings,
  GetPublicSiteSettings,
  ReplaceSocialLinks,
  UpdateSiteImages,
  UpdateSiteSettings,
} from "@/application/settings/site-settings";
import { getCurrentStaff } from "@/composition/auth";
import { DisabledBookingProvider } from "@/infrastructure/booking/disabled-booking-provider";
import { NextCacheInvalidator } from "@/infrastructure/cache/next-cache-invalidator";
import { PrismaAdminOverviewReader } from "@/infrastructure/db/prisma/repositories/admin-overview-reader";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";

const clock = { now: () => new Date() };

export async function getAdminOverview() {
  return new GetAdminOverview(new PrismaAdminOverviewReader(), clock).execute(
    await getCurrentStaff(),
  );
}

export async function listEnquiries(params: Readonly<Record<string, unknown>>) {
  return new ListEnquiries(new PrismaEnquiryRepository()).execute(
    await getCurrentStaff(),
    params,
  );
}

export async function getAdminSiteSettings() {
  return new GetAdminSiteSettings(new PrismaSettingsRepository()).execute(
    await getCurrentStaff(),
  );
}

export async function updateSiteSettings(
  values: Readonly<Record<string, unknown>>,
  expectedUpdatedAt: unknown,
) {
  return new UpdateSiteSettings(
    new PrismaSettingsRepository(),
    new NextCacheInvalidator(),
  ).execute(await getCurrentStaff(), { values, expectedUpdatedAt });
}

export async function replaceSocialLinks(
  links: unknown,
  expectedUpdatedAt: unknown,
) {
  return new ReplaceSocialLinks(
    new PrismaSettingsRepository(),
    new NextCacheInvalidator(),
  ).execute(await getCurrentStaff(), { links, expectedUpdatedAt });
}

export async function updateSiteImages(
  values: Readonly<Record<string, unknown>>,
) {
  return new UpdateSiteImages(
    new PrismaSettingsRepository(),
    new NextCacheInvalidator(),
  ).execute(await getCurrentStaff(), values);
}

/**
 * The public settings query. Cached across requests under the
 * `site-settings` tag, which settings mutations invalidate. Public pages
 * start reading it in Phase 7.
 */
export const getPublicSiteSettings = unstable_cache(
  () => new GetPublicSiteSettings(new PrismaSettingsRepository()).execute(),
  ["public-site-settings"],
  { tags: [CACHE_TAGS.siteSettings] },
);

export function getBookingStatus() {
  return new ResolveBooking(new DisabledBookingProvider()).execute();
}
