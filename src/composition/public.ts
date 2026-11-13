import "server-only";

import { randomBytes } from "node:crypto";

import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";

import { CACHE_TAGS } from "@/application/cache/cache-tags";
import { SubmitEnquiry } from "@/application/enquiries/submit-enquiry";
import type { ContactDelivery } from "@/application/enquiries/ports";
import { PublicSite } from "@/application/public/public-site";
import type { PageKey } from "@/domain/content/page-sections";
import { SLUG_PATTERN } from "@/domain/shared/slug";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";
import { HmacFormTokens } from "@/infrastructure/email/hmac-form-tokens";
import { OutboxContactDelivery } from "@/infrastructure/email/outbox-contact-delivery";
import { SmtpContactDelivery } from "@/infrastructure/email/smtp-contact-delivery";
import { getServerEnv } from "@/lib/env/server";

export { getBookingStatus } from "@/composition/admin";

function site() {
  return new PublicSite({
    settings: new PrismaSettingsRepository(),
    media: new PrismaMediaRepository(),
    pages: new PrismaPageRepository(),
    rooms: new PrismaRoomRepository(),
    facilities: new PrismaFacilityRepository(),
    branches: new PrismaBranchRepository(),
  });
}

// Public reads render per request (the content lives in the database, not
// the build) and are cached across requests under content tags, which admin
// mutations invalidate. Cached values are plain JSON view models.
function cached<T>(
  load: () => Promise<T>,
  key: readonly string[],
  tags: readonly string[],
  revalidate?: number,
) {
  return unstable_cache(load, [...key], {
    tags: [...tags],
    ...(revalidate ? { revalidate } : {}),
  })();
}

export async function getSiteSettings() {
  await connection();
  return cached(
    () => site().settings(),
    ["public", "settings"],
    [CACHE_TAGS.siteSettings],
  );
}

/** The branch a public page renders for: id for queries, slug for tags. */
export type BranchRef = Readonly<{ id: string; slug: string }>;

/**
 * Active branches by display order (chooser, switcher, sitemap, and the
 * single-branch redirect on `/`). Expired by `branches`.
 */
export async function getActiveBranches() {
  await connection();
  return cached(
    () => site().activeBranches(),
    ["public", "branches"],
    [CACHE_TAGS.branches],
  );
}

/**
 * The active branch for a URL slug; null when unknown or inactive. Resolved
 * from the cached active list, so arbitrary URL segments never create cache
 * entries of their own (review of M5).
 */
export async function getActiveBranchBySlug(slug: string) {
  return (
    (await getActiveBranches()).find((branch) => branch.slug === slug) ?? null
  );
}

/** Only well-formed slugs reach the cache; anything else is simply absent. */
function isCacheableSlug(slug: string) {
  return slug.length <= 120 && SLUG_PATTERN.test(slug);
}

export async function getPublishedPage(branch: BranchRef, key: PageKey) {
  await connection();
  return cached(
    () => site().page(branch.id, key),
    ["public", "branch", branch.id, "page", key],
    [CACHE_TAGS.page(branch.slug, key)],
  );
}

export async function getPublishedRooms(branch: BranchRef) {
  await connection();
  return cached(
    () => site().rooms(branch.id),
    ["public", "branch", branch.id, "rooms"],
    [CACHE_TAGS.stay(branch.slug)],
  );
}

export async function getPublishedRoom(branch: BranchRef, slug: string) {
  await connection();
  if (!isCacheableSlug(slug)) return null;
  return cached(
    () => site().room(branch.id, slug),
    ["public", "branch", branch.id, "room", slug],
    [CACHE_TAGS.stay(branch.slug), CACHE_TAGS.stayItem(branch.slug, slug)],
  );
}

export async function getPublishedFacilities(branch: BranchRef) {
  await connection();
  return cached(
    () => site().facilities(branch.id),
    ["public", "branch", branch.id, "facilities"],
    [CACHE_TAGS.facilities(branch.slug)],
  );
}

export async function getPublishedFacility(branch: BranchRef, slug: string) {
  await connection();
  if (!isCacheableSlug(slug)) return null;
  return cached(
    () => site().facility(branch.id, slug),
    ["public", "branch", branch.id, "facility", slug],
    [
      CACHE_TAGS.facilities(branch.slug),
      CACHE_TAGS.facility(branch.slug, slug),
    ],
  );
}

/** Canonical deployment origin. APP_URL is server validated and never bundled. */
export function getPublicOrigin() {
  return new URL(getServerEnv().APP_URL).origin;
}

/**
 * Published routes and accurate content timestamps for sitemap.xml, per
 * active branch (spec 0002).
 */
export async function getPublicSitemap() {
  await connection();
  return cached(
    async () => {
      const publicSite = site();
      const branches = await publicSite.activeBranches();
      return Promise.all(
        branches.map(async (branch) => {
          const [home, about, contact, rooms, facilities] = await Promise.all([
            publicSite.page(branch.id, "HOME"),
            publicSite.page(branch.id, "ABOUT"),
            publicSite.page(branch.id, "CONTACT"),
            publicSite.rooms(branch.id),
            publicSite.facilities(branch.id),
          ]);
          return { branch, home, about, contact, rooms, facilities };
        }),
      );
    },
    ["public", "sitemap"],
    [CACHE_TAGS.sitemap, CACHE_TAGS.branches],
  );
}

let formSecret: string | undefined;

function tokens() {
  // Derived from the auth secret; a random per-process secret keeps local
  // development working without one (tokens then reset on restart).
  formSecret ??=
    getServerEnv().BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex");
  return new HmacFormTokens(`contact-form:${formSecret}`);
}

function contactDelivery(): ContactDelivery | null {
  const env = getServerEnv();
  switch (env.CONTACT_DELIVERY) {
    case "outbox":
      return new OutboxContactDelivery(env.CONTACT_OUTBOX_DIR!);
    case "smtp":
      return new SmtpContactDelivery({
        host: env.SMTP_HOST!,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER!,
        password: env.SMTP_PASSWORD!,
        from: env.CONTACT_FROM!,
        to: env.CONTACT_TO!,
      });
    case "none":
      return null;
  }
}

export function issueContactFormToken() {
  return tokens().issue(new Date());
}

async function clientAddress() {
  if (!getServerEnv().AUTH_TRUST_PROXY_HEADERS) return null;
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0];
  return (forwarded ?? requestHeaders.get("x-real-ip"))?.trim() || null;
}

export async function submitEnquiry(values: Readonly<Record<string, unknown>>) {
  const prisma = getPrisma();
  return new SubmitEnquiry({
    enquiries: new PrismaEnquiryRepository(prisma),
    branches: new PrismaBranchRepository(prisma),
    throttle: new PrismaLoginThrottleStore(prisma),
    tokens: tokens(),
    delivery: contactDelivery(),
    clock: { now: () => new Date() },
  }).execute({ values, clientAddress: await clientAddress() });
}
