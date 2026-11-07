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
  const [settings, branches, pages, rooms, facilities, booking] =
    await Promise.all([
      prisma.siteSettings.findUnique({ where: { id: "default" } }),
      prisma.branch.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      prisma.page.findMany({ where: { isPublished: true } }),
      prisma.room.findMany({
        where: { status: "PUBLISHED" },
        include: { media: { include: { media: true } } },
      }),
      prisma.facility.findMany({
        where: { status: "PUBLISHED" },
        include: { media: { include: { media: true } } },
      }),
      new ResolveBooking(new DisabledBookingProvider()).execute(),
    ]);

  const origin = new URL(getServerEnv().APP_URL);
  record(
    "Canonical production origin",
    origin.protocol === "https:" && origin.hostname !== "localhost",
    origin.origin,
  );
  // Contact details and locations belong to each branch since M5.
  record("Active branch", branches.length > 0, `${branches.length} active`);
  for (const branch of branches) {
    record(
      `Official contact details (${branch.slug})`,
      Boolean(
        !placeholder(branch.phone) &&
          !placeholder(branch.email) &&
          branch.addressLine1 &&
          branch.city &&
          branch.country,
      ),
      `${branch.phone ?? "missing phone"}; ${branch.email ?? "missing email"}; ${[
        branch.addressLine1,
        branch.city,
        branch.country,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
    record(
      `Confirmed location (${branch.slug})`,
      branch.latitude !== null && branch.longitude !== null,
      branch.latitude !== null && branch.longitude !== null
        ? `${branch.latitude}, ${branch.longitude}`
        : "Latitude and longitude are incomplete.",
    );
  }
  record(
    "Default search/social metadata",
    Boolean(
      settings?.defaultSeoTitle &&
        settings.defaultSeoDescription &&
        settings.defaultOgMediaId,
    ),
    "Requires a default title, description, and sharing image.",
  );

  for (const branch of branches) {
    const pageKeys = new Set(
      pages
        .filter((page) => page.branchId === branch.id)
        .map((page) => page.key),
    );
    record(
      `Required managed pages published (${branch.slug})`,
      ["HOME", "ABOUT", "CONTACT"].every((key) => pageKeys.has(key as never)),
      `Published: ${[...pageKeys].join(", ") || "none"}`,
    );
  }
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
