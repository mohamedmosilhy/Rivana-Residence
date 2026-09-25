import "server-only";

import { randomBytes } from "node:crypto";

import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";

import { CACHE_TAGS } from "@/application/cache/cache-tags";
import { SubmitEnquiry } from "@/application/enquiries/submit-enquiry";
import type { ContactDelivery } from "@/application/ports/providers";
import { PublicSite, activePromotion } from "@/application/public/public-site";
import type { PageKey } from "@/domain/content/page-sections";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
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
    promotions: new PrismaPromotionRepository(),
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

export async function getPublishedPage(key: PageKey) {
  await connection();
  return cached(
    () => site().page(key),
    ["public", "page", key],
    [CACHE_TAGS.page(key)],
  );
}

export async function getPublishedRooms() {
  await connection();
  return cached(() => site().rooms(), ["public", "rooms"], [CACHE_TAGS.rooms]);
}

export async function getPublishedRoom(slug: string) {
  await connection();
  return cached(
    () => site().room(slug),
    ["public", "room", slug],
    [CACHE_TAGS.rooms, CACHE_TAGS.room(slug)],
  );
}

export async function getPublishedFacilities() {
  await connection();
  return cached(
    () => site().facilities(),
    ["public", "facilities"],
    [CACHE_TAGS.facilities],
  );
}

export async function getPublishedFacility(slug: string) {
  await connection();
  return cached(
    () => site().facility(slug),
    ["public", "facility", slug],
    [CACHE_TAGS.facilities, CACHE_TAGS.facility(slug)],
  );
}

/**
 * The promotion to show now, by the server clock. The candidate list is
 * cached (and refreshed every 5 minutes to drop ended campaigns); the
 * winner is chosen per request so schedules are honoured exactly.
 */
export async function getActivePromotion() {
  await connection();
  const now = new Date();
  const candidates = await cached(
    () => site().promotionCandidates(now),
    ["public", "promotions"],
    [CACHE_TAGS.activePromotion],
    300,
  );
  return activePromotion(candidates, now);
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
    throttle: new PrismaLoginThrottleStore(prisma),
    tokens: tokens(),
    delivery: contactDelivery(),
    clock: { now: () => new Date() },
  }).execute({ values, clientAddress: await clientAddress() });
}
