import { createHash } from "node:crypto";

import type { AuditLog } from "@/application/audit";
import { QueueReservationMessages } from "@/application/notifications";
import { QuoteBooking } from "@/application/quotes";
import {
  CreateWebsiteReservation,
  type CreateWebsiteReservationContext,
} from "@/application/reservations";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaPublicListingReader } from "@/infrastructure/db/prisma/repositories/public-listing-reader";
import {
  PrismaCouponRedemptionReader,
  PrismaCouponRedemptionStore,
} from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";
import { PrismaCommercialSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/commercial-settings-repository";
import { PrismaCouponRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaReservationMessageStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

import {
  createBranch,
  createRoom,
  TEST_BRANCH_ID,
} from "../../support/database";
import { deferred } from "./concurrency";

export const NOW = new Date("2031-03-01T10:00:00Z");
export const PRIVACY = "privacy-placeholder-v1";
export const MARKETING = "marketing-placeholder-v1";
/** Three nights at 100.00 plus 15% VAT. */
export const TOTAL_MINOR = 34_500;

type Options = Readonly<{
  audit?: (inner: AuditLog) => AuditLog;
  /** Wraps the transaction's quote, e.g. to report a branch closed after the locks. */
  quote?: (inner: QuoteBooking) => Pick<QuoteBooking, "execute">;
  setupConfigured?: boolean;
}>;

/** Production wiring (src/composition/reservations.ts) on an independent client. */
export function websiteBooking(client: PrismaClient, options: Options = {}) {
  const clock = { now: () => NOW };
  const ids = new Cuid2IdGenerator();
  return new CreateWebsiteReservation({
    unitOfWork:
      new PrismaReservationUnitOfWork<CreateWebsiteReservationContext>(
        client,
        (transaction) => {
          const consumption = new PrismaReservationConsumptionReader(
            transaction,
          );
          const inventoryReader = new PrismaInventoryReader(
            transaction,
            consumption,
          );
          const audit = new PrismaAuditLog(transaction);
          const quote = new QuoteBooking({
            branches: new PrismaBranchRepository(transaction),
            rooms: new PrismaPublicListingReader(transaction),
            inventory: inventoryReader,
            rates: new PrismaRateRepository(transaction),
            services: new PrismaServiceOfferingRepository(transaction),
            coupons: new PrismaCouponRepository(transaction),
            redemptions: new PrismaCouponRedemptionReader(transaction, {
              phoneAware: true,
            }),
            settings: new PrismaCommercialSettingsRepository(transaction),
            clock,
          });
          return {
            reservations: new PrismaReservationRepository(transaction),
            guests: new PrismaGuestRepository(transaction),
            consumption,
            inventoryLock: new PrismaInventoryLock(transaction),
            inventoryReader,
            audit: options.audit ? options.audit(audit) : audit,
            verifications: new PrismaPhoneVerificationRepository(transaction),
            redemptions: new PrismaCouponRedemptionStore(transaction),
            quote: options.quote ? options.quote(quote) : quote,
            messages: new QueueReservationMessages(
              new PrismaReservationMessageStore(transaction),
              ids,
              clock,
              "https://hotel.example",
            ),
          };
        },
      ),
    branches: new PrismaBranchRepository(client),
    listings: new PrismaPublicListingReader(client),
    replays: new PrismaReservationRepository(client),
    tokens: new PrismaPhoneVerificationRepository(client),
    setup: { isConfigured: async () => options.setupConfigured ?? true },
    crypto: new NodeBookingCrypto(),
    clock,
    ids,
  });
}

export const phoneOf = (index: number) =>
  `+1202555${String(1000 + index).padStart(4, "0")}`;

/** A second active branch that takes online bookings. */
export async function seedBranch(
  client: PrismaClient,
  values: Readonly<{ id: string; slug: string; timeZone?: string }>,
) {
  await createBranch(client, { id: values.id, slug: values.slug });
  await client.branch.update({
    where: { id: values.id },
    data: { timeZone: values.timeZone ?? "Africa/Cairo" },
  });
}

/** A branch that takes online bookings, with one listing priced at 100.00 a night. */
export async function seedBookable(
  client: PrismaClient,
  options: Readonly<{
    units?: number;
    slug?: string;
    branchId?: string;
  }> = {},
) {
  const branchId = options.branchId ?? TEST_BRANCH_ID;
  await client.branch.update({
    where: { id: branchId },
    data: {
      onlineBookingEnabled: true,
      checkInTime: "14:00",
      email: "front@example.test",
    },
  });
  const slug = options.slug ?? "garden";
  const room = await createRoom(client, {
    status: "PUBLISHED",
    slug,
    branchId,
  });
  await client.room.update({
    where: { id: room.id },
    data: { maxAdults: 3, maxChildren: 2 },
  });
  for (let index = 0; index < (options.units ?? 2); index += 1)
    await client.physicalRoom.create({
      data: {
        id: `${slug}-unit-${index}`,
        branchId,
        roomTypeId: room.id,
        label: `${slug}-unit-${index}`,
      },
    });
  await client.roomBaseRate.create({
    data: { roomTypeId: room.id, amountMinor: 10_000 },
  });
  return room;
}

let issued = 0;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A confirmed BOOKING verification; returns the plain token the guest holds. */
export async function issueToken(
  client: PrismaClient,
  phone: string,
  options: Readonly<{
    purpose?: "BOOKING" | "GUEST_SESSION";
    expired?: boolean;
    consumed?: boolean;
  }> = {},
) {
  issued += 1;
  const token = `token-${phone.slice(1)}-${issued}-0123456789abcdef`;
  await client.phoneVerification.create({
    data: {
      id: `verification-${phone.slice(1)}-${sha256(token).slice(0, 6)}`,
      phone,
      purpose: options.purpose ?? "BOOKING",
      codeHash: "0".repeat(64),
      attempts: 1,
      expiresAt: new Date(NOW.getTime() + 600_000),
      verifiedAt: new Date(NOW.getTime() - 60_000),
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(
        NOW.getTime() + (options.expired ? -1 : 1_800_000),
      ),
      consumedAt: options.consumed ? new Date(NOW.getTime() - 1000) : null,
      clientKey: "test-client",
      createdAt: new Date(NOW.getTime() - 120_000),
    },
  });
  return token;
}

export function bookingBody(
  phone: string,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    branchSlug: "new-cairo",
    stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
    lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
    services: [],
    guest: {
      fullName: "Amina Hassan",
      email: "amina@example.test",
      phone,
      country: "EG",
    },
    phoneVerificationToken: token,
    paymentMethod: "PAY_AT_HOTEL",
    expectedTotal: { amountMinor: TOTAL_MINOR, currency: "USD" },
    consent: { privacyNoticeVersion: PRIVACY },
    ...overrides,
  };
}

export async function rowCounts(client: PrismaClient) {
  const [reservations, redemptions, audits, outbox, consumed] =
    await Promise.all([
      client.reservation.count(),
      client.couponRedemption.count(),
      client.auditEvent.count({ where: { action: "reservation.created" } }),
      client.notificationOutbox.count(),
      client.phoneVerification.count({ where: { consumedAt: { not: null } } }),
    ]);
  return { reservations, redemptions, audits, outbox, consumed };
}

/**
 * Waits until at least `count` other backends are blocked on a database lock.
 * This is observed state, not a sleep: it proves the transactions overlapped.
 */
export async function waitForLockWaiters(
  observer: PrismaClient,
  count: number,
) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const [row] = await observer.$queryRaw<Readonly<{ waiting: number }>[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Fewer than ${count} backends reached a lock wait.`);
}

/**
 * An audit hook that holds its transaction open, with every lock it took,
 * after the booking is written. `reached` resolves at that point and the
 * transaction commits only after `release()`.
 */
export function pausedAudit() {
  const reached = deferred();
  const gate = deferred();
  return {
    audit: (inner: AuditLog): AuditLog => ({
      append: async (event) => {
        await inner.append(event);
        reached.resolve();
        await gate.promise;
      },
    }),
    reached: reached.promise,
    release: () => gate.resolve(),
  };
}

/** Active templates and numbers so the real composition sees WhatsApp as configured. */
export async function configureWhatsApp(client: PrismaClient) {
  await client.whatsAppSettings.update({
    where: { id: "default" },
    data: {
      businessPhoneNumber: "+201001234567",
      providerPhoneNumberId: "1098765432",
    },
  });
  for (const [purpose, variables] of [
    ["VERIFICATION_CODE", ["code"]],
    ["BOOKING_CONFIRMED", ["reference", "guestFirstName"]],
  ] as const)
    await client.whatsAppTemplate.create({
      data: {
        id: `template-${purpose}`,
        purpose,
        language: "en",
        providerName: `${purpose.toLowerCase()}_v1`,
        category:
          purpose === "VERIFICATION_CODE" ? "AUTHENTICATION" : "UTILITY",
        variables: [...variables],
        previewText: "Preview {{1}}",
        active: true,
      },
    });
}
