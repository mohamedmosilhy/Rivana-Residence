import "server-only";

import { ResolveBooking } from "../src/application/booking/resolve-booking.ts";
import { DisabledBookingProvider } from "../src/infrastructure/booking/disabled-booking-provider.ts";
import { getPrisma } from "../src/infrastructure/db/prisma/client.ts";
import { getServerEnv } from "../src/lib/env/server.ts";

type Check = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) =>
  checks.push({ name, ok, detail });
const placeholder = (value: string | null | undefined) =>
  !value || /example\.(?:com|test)|1234|placeholder|test site/i.test(value);
const usableImage = (usage: {
  media: {
    status: string;
    rightsStatus: string;
    altText: string;
  };
}) =>
  usage.media.status === "READY" &&
  usage.media.rightsStatus === "CONFIRMED" &&
  usage.media.altText.trim().length > 0;

const prisma = getPrisma();

try {
  const [settings, pages, rooms, facilities, promotions, booking] =
    await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: "default" } }),
      prisma.page.findMany({ where: { isPublished: true } }),
      prisma.room.findMany({
        where: { status: "PUBLISHED" },
        include: { media: { include: { media: true } } },
      }),
      prisma.facility.findMany({
        where: { status: "PUBLISHED" },
        include: { media: { include: { media: true } } },
      }),
      prisma.promotion.findMany({ where: { status: "PUBLISHED" } }),
      new ResolveBooking(new DisabledBookingProvider()).execute(),
    ]);

  const origin = new URL(getServerEnv().APP_URL);
  record(
    "Canonical production origin",
    origin.protocol === "https:" && origin.hostname !== "localhost",
    origin.origin,
  );
  record(
    "Official contact details",
    Boolean(
      settings &&
        !placeholder(settings.phone) &&
        !placeholder(settings.email) &&
        settings.addressLine1 &&
        settings.city &&
        settings.country,
    ),
    settings
      ? `${settings.phone ?? "missing phone"}; ${settings.email ?? "missing email"}; ${[
          settings.addressLine1,
          settings.city,
          settings.country,
        ]
          .filter(Boolean)
          .join(", ")}`
      : "Site settings are missing.",
  );
  record(
    "Confirmed location",
    Boolean(
      settings && settings.latitude !== null && settings.longitude !== null,
    ),
    settings?.latitude !== null && settings?.longitude !== null
      ? `${settings?.latitude}, ${settings?.longitude}`
      : "Latitude and longitude are incomplete.",
  );
  record(
    "Default search/social metadata",
    Boolean(
      settings?.defaultSeoTitle &&
        settings.defaultSeoDescription &&
        settings.defaultOgMediaId,
    ),
    "Requires a default title, description, and sharing image.",
  );

  const pageKeys = new Set(pages.map((page) => page.key));
  record(
    "Required managed pages published",
    ["HOME", "ABOUT", "CONTACT"].every((key) => pageKeys.has(key as never)),
    `Published: ${[...pageKeys].join(", ") || "none"}`,
  );
  record(
    "Published page descriptions",
    pages.every(
      (page) => page.seoDescription || settings?.defaultSeoDescription,
    ),
    `${pages.length} published managed page(s) checked.`,
  );

  const missingRoomMedia = rooms.filter(
    (room) =>
      !room.media.some((usage) => usage.role === "HERO" && usableImage(usage)),
  );
  record(
    "Published room content and media",
    rooms.length > 0 && missingRoomMedia.length === 0,
    missingRoomMedia.length > 0
      ? `Missing approved hero/alt: ${missingRoomMedia.map((room) => room.name).join(", ")}`
      : `${rooms.length} published room(s) have approved heroes and descriptions.`,
  );

  const missingFacilityMedia = facilities.filter(
    (facility) =>
      !facility.media.some(
        (usage) => usage.role === "HERO" && usableImage(usage),
      ),
  );
  record(
    "Published facility content and media",
    facilities.length > 0 && missingFacilityMedia.length === 0,
    missingFacilityMedia.length > 0
      ? `Missing approved hero/alt: ${missingFacilityMedia.map((facility) => facility.name).join(", ")}`
      : `${facilities.length} published facility/facilities have approved heroes.`,
  );

  const invalidPromotions = promotions.filter(
    (promotion) =>
      !promotion.headline.trim() ||
      !promotion.body.trim() ||
      !promotion.code.trim() ||
      (promotion.startsAt &&
        promotion.endsAt &&
        promotion.startsAt >= promotion.endsAt),
  );
  record(
    "Published promotion copy and windows",
    invalidPromotions.length === 0,
    invalidPromotions.length > 0
      ? `Review: ${invalidPromotions.map((promotion) => promotion.internalName).join(", ")}`
      : `${promotions.length} published promotion(s) checked.`,
  );
  record(
    "Booking status is truthful",
    booking.available === false,
    booking.available
      ? `Booking provider configured at ${booking.url}`
      : booking.accessibleMessage,
  );
  record(
    "Privacy/legal copy approved",
    false,
    "Launch blocker: the client must provide and approve the privacy notice, enquiry retention wording, image credits, and image-rights sign-off.",
  );

  for (const check of checks) {
    console.log(
      `${check.ok ? "PASS" : "BLOCKED"} — ${check.name}: ${check.detail}`,
    );
  }
  const blocked = checks.filter((check) => !check.ok);
  console.log(
    `\n${checks.length - blocked.length}/${checks.length} checks passed.`,
  );
  if (blocked.length > 0) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
