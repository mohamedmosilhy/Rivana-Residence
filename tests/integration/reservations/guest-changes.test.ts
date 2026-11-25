import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DispatchOutbox,
  type WhatsAppSender,
} from "@/application/notifications";
import {
  ApplyGuestChange,
  type GuestChangeContext,
} from "@/application/reservations";
import { success } from "@/application/shared/result";
import {
  guestChangeContext,
  guestReservationChanges,
  guestReservationReads,
  requestCancellation,
} from "@/composition/guests";
import { GuestChangePreview } from "@/contracts/api/v1/guests";
import { staffReservationCommands } from "@/composition/reservations";
import type { PrismaClient } from "@/generated/prisma/client";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaGuestReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-reservation-reader";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaAvailabilityCatalog } from "@/infrastructure/db/prisma/repositories/reservations/inventory/availability-catalog";
import { PrismaOutboxWorkerStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { FakeReservationEmail } from "@/infrastructure/email/fake-reservation-email";
import { renderReservationEmail } from "@/infrastructure/email/reservation-email";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred, withIndependentClients } from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  NOW,
  pausedAudit,
  phoneOf,
  seedBookable,
  seedBranch,
  TOTAL_MINOR,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("guest-change-integration-secret"),
}));

const client = createTestClient();
const clock = { now: () => NOW };
const money = (amountMinor: number) =>
  ({ currency: "USD", amountMinor }) as const;
const longer = { checkIn: "2031-04-10", checkOut: "2031-04-14" };
const nameChange = { guest: { fullName: "Updated Guest" } };
const crypto = new NodeBookingCrypto();

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function book(units = 1, options: { email?: string } = {}) {
  await createActor(client);
  const listing = await seedBookable(client, { units });
  const phone = phoneOf(11);
  const created = await websiteBooking(client).execute(
    bookingBody(
      phone,
      await issueToken(
        client,
        phone,
        options.email ? { email: options.email } : {},
      ),
    ),
    "guest-change-booking",
  );
  if (!created.ok || !created.value.manageToken)
    throw new Error("Expected a priced booking and its manage link.");
  const row = await client.reservation.findUniqueOrThrow({
    where: { reference: created.value.reference },
  });
  return {
    listing,
    row,
    phone,
    access: { kind: "MANAGE_TOKEN", token: created.value.manageToken } as const,
  };
}

async function guestSession(phone: string, reference: string) {
  const token = crypto.generateToken();
  await client.phoneVerification.create({
    data: {
      id: new Cuid2IdGenerator().next(),
      purpose: "GUEST_SESSION",
      phone,
      codeHash: "0".repeat(64),
      expiresAt: new Date(NOW.getTime() + 600_000),
      verifiedAt: NOW,
      tokenHash: crypto.sha256(token),
      tokenExpiresAt: new Date(NOW.getTime() + 1_800_000),
      clientKey: "test",
    },
  });
  return { kind: "GUEST_SESSION", token, reference } as const;
}

function applyWithContext(
  db: PrismaClient,
  wrap: (context: GuestChangeContext) => GuestChangeContext,
) {
  return new ApplyGuestChange({
    reader: new PrismaGuestReservationReader(db),
    guests: new PrismaGuestRepository(db),
    verifications: new PrismaPhoneVerificationRepository(db),
    catalog: new PrismaAvailabilityCatalog(db),
    ids: new Cuid2IdGenerator(),
    crypto,
    clock,
    unitOfWork: new PrismaReservationUnitOfWork(db, (transaction) =>
      wrap(guestChangeContext(transaction)),
    ),
  });
}

function changes(db = client, currentClock = clock) {
  return guestReservationChanges({ client: db, clock: currentClock });
}

async function assertNoAppliedChange(id: string, outboxCount: number) {
  expect(
    await client.reservationChange.count({ where: { reservationId: id } }),
  ).toBe(0);
  expect(
    await client.auditEvent.count({
      where: { entityId: id, action: "reservation.stay-modified" },
    }),
  ).toBe(0);
  expect(
    await client.notificationOutbox.count({ where: { reservationId: id } }),
  ).toBe(outboxCount);
}

describe("Guest preview and apply (AC-11, T-GCHG-1…8)", () => {
  it("previews without writes and keeps stored nights, VAT and the coupon when current prices change", async () => {
    const { row, listing, access } = await book();
    await client.reservation.update({
      where: { id: row.id },
      data: {
        couponCode: "SAVE10",
        couponKind: "PERCENT",
        couponValue: 1000,
        discountMinor: 3000,
        taxableMinor: 27000,
        vatMinor: 4050,
        totalMinor: 31050,
        pmsEnteredAt: NOW,
      },
    });
    await client.roomBaseRate.update({
      where: { roomTypeId: listing.id },
      data: { amountMinor: 12500 },
    });
    await client.commercialSettings.update({
      where: { id: "default" },
      data: { vatRateBasisPoints: 0 },
    });
    const outboxCount = await client.notificationOutbox.count();
    const input = {
      stay: longer,
      guest: {
        fullName: "Private New Name",
        specialRequests: "Private hotel request",
      },
    };
    const preview = await changes().preview.execute(access, success(input));
    expect(preview).toMatchObject({
      ok: true,
      value: {
        version: row.version,
        preview: {
          available: true,
          unavailableLines: [],
          outcome: "APPLIES_NOW",
          current: {
            total: money(31050),
            coupon: { code: "SAVE10", percentBasisPoints: 1000 },
          },
          proposed: {
            stay: longer,
            accommodation: money(42500),
            discount: money(4250),
            vat: money(5738),
            total: money(43988),
            lines: [
              {
                roomSlug: "garden",
                occupancy: { adults: 2, children: 0 },
                nights: expect.arrayContaining([
                  { night: "2031-04-13", amount: money(12500), label: null },
                ]),
              },
            ],
          },
        },
      },
    });
    if (!preview.ok) throw new Error("Expected a preview.");
    expect(GuestChangePreview.safeParse(preview.value.preview).success).toBe(
      true,
    );
    await assertNoAppliedChange(row.id, outboxCount);
    expect(
      await client.reservation.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      checkOut: row.checkOut,
      version: row.version,
      guestName: row.guestName,
    });

    // A staff rate edit alone leaves the reservation version unchanged.
    await client.roomBaseRate.update({
      where: { roomTypeId: listing.id },
      data: { amountMinor: 15000 },
    });
    const refused = await changes().apply.execute(
      access,
      row.version,
      success({ ...input, expectedTotal: money(43988) }),
    );
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: "PRICE_CHANGED",
        context: {
          quote: {
            totalMinor: 46575,
            preview: {
              current: { total: money(31050) },
              proposed: { total: money(46575), stay: longer },
            },
          },
        },
      },
    });
    if (refused.ok || refused.error.code !== "PRICE_CHANGED")
      throw new Error("Expected a new quote.");
    expect(
      GuestChangePreview.safeParse(refused.error.context.quote.preview).success,
    ).toBe(true);
    await assertNoAppliedChange(row.id, outboxCount);
    expect(
      await changes().apply.execute(
        access,
        row.version,
        success({ ...input, expectedTotal: money(46575) }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        version: row.version + 1,
        reservation: {
          stay: { checkOut: { value: longer.checkOut } },
          contact: { fullName: input.guest.fullName },
        },
      },
    });
    const after = await client.reservation.findUniqueOrThrow({
      where: { id: row.id },
      include: {
        rooms: { include: { nights: { orderBy: { night: "asc" } } } },
      },
    });
    expect(after).toMatchObject({
      changeSeq: 1,
      totalMinor: 46575,
      pmsUpdatePendingSince: NOW,
      couponKind: "PERCENT",
      couponValue: 1000,
      vatRateBasisPoints: 1500,
    });
    expect(after.rooms[0]!.nights.map((night) => night.amountMinor)).toEqual([
      10000, 10000, 10000, 15000,
    ]);
    expect(after.manageTokenExpiresAt).toEqual(
      new Date("2031-05-14T00:00:00Z"),
    );
    const history = await client.reservationChange.findMany({
      where: { reservationId: row.id },
    });
    expect(history).toMatchObject([
      {
        actorType: "GUEST",
        seq: 1,
        oldTotalMinor: 31050,
        newTotalMinor: 46575,
        after: { contactFieldsChanged: ["fullName", "specialRequests"] },
      },
    ]);
    const audits = await client.auditEvent.findMany({
      where: { entityId: row.id, action: "reservation.stay-modified" },
    });
    expect(audits).toMatchObject([
      { actorType: "GUEST", changes: { changeSeq: 1, flagPmsUpdate: true } },
    ]);
    expect(JSON.stringify([history, audits])).not.toMatch(
      /Private New Name|Private hotel request|amina@example\.test/,
    );
    expect(
      await changes().apply.execute(
        access,
        row.version,
        success({ ...input, expectedTotal: money(46575) }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "STALE_VERSION" },
    });
  });

  it("shows a date move at the same price and accepts the preview's Money value directly", async () => {
    const { row, access } = await book();
    const stay = { checkIn: "2031-04-20", checkOut: "2031-04-23" };
    const preview = await changes().preview.execute(access, success({ stay }));
    if (!preview.ok || !preview.value.preview.proposed)
      throw new Error("Expected an available preview.");
    const { current, proposed } = preview.value.preview;
    expect(current.stay).toEqual({
      checkIn: "2031-04-10",
      checkOut: "2031-04-13",
    });
    expect(proposed.stay).toEqual(stay);
    expect(proposed.total).toEqual(current.total);
    expect(
      await changes().apply.execute(
        access,
        preview.value.version,
        success({ stay, expectedTotal: proposed.total }),
      ),
    ).toMatchObject({ ok: true, value: { version: row.version + 1 } });
  });

  it("uses current service offerings only for additions and retains the stored transfer rates", async () => {
    const { row, access } = await book();
    await client.serviceOffering.createMany({
      data: [
        {
          id: "service-breakfast",
          branchId: TEST_BRANCH_ID,
          kind: "BREAKFAST",
          active: true,
          priceUnit: "PER_PERSON_PER_NIGHT",
          priceMinor: 500,
        },
        {
          id: "service-transfer",
          branchId: TEST_BRANCH_ID,
          kind: "AIRPORT_TRANSFER",
          active: true,
          priceUnit: "PER_VEHICLE",
          priceMinor: 2000,
          maxVehicles: 3,
        },
      ],
    });
    const first = {
      services: [
        { kind: "AIRPORT_TRANSFER", vehicles: 1, details: "First flight" },
      ],
    };
    expect(
      (
        await changes().apply.execute(
          access,
          row.version,
          success({ ...first, expectedTotal: money(36800) }),
        )
      ).ok,
    ).toBe(true);
    await client.serviceOffering.updateMany({
      where: { kind: "AIRPORT_TRANSFER" },
      data: { priceMinor: 6000 },
    });
    const next = {
      services: [{ kind: "AIRPORT_TRANSFER", vehicles: 2 }, "BREAKFAST"],
    };
    expect(
      await changes().preview.execute(access, success(next)),
    ).toMatchObject({
      ok: true,
      value: {
        preview: {
          proposed: { servicesTotal: money(7000), total: money(42550) },
        },
      },
    });
    expect(
      (
        await changes().apply.execute(
          access,
          row.version + 1,
          success({ ...next, expectedTotal: money(42550) }),
        )
      ).ok,
    ).toBe(true);
    expect(
      await client.reservationService.findMany({
        where: { reservationId: row.id },
        orderBy: { kind: "asc" },
      }),
    ).toMatchObject([
      { kind: "BREAKFAST", priceMinor: 500, amountMinor: 3000 },
      {
        kind: "AIRPORT_TRANSFER",
        vehicles: 2,
        priceMinor: 2000,
        amountMinor: 4000,
        details: "First flight",
      },
    ]);
  });

  it("matches ownership, both deadlines, the request state, and the phone block", async () => {
    const { row, access, phone } = await book();
    const session = await guestSession(phone, row.reference);
    const foreign = await guestSession(phoneOf(12), row.reference);
    const submitted = success({
      ...nameChange,
      expectedTotal: money(TOTAL_MINOR),
    });
    const useCases = changes();
    for (const execute of [
      () => useCases.preview.execute(foreign, submitted),
      () => useCases.apply.execute(foreign, row.version, submitted),
    ])
      expect(await execute()).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
    expect(await useCases.preview.execute(session, submitted)).toMatchObject({
      ok: true,
      value: { version: row.version },
    });
    expect(await useCases.apply.execute(access, null, submitted)).toMatchObject(
      { ok: false, error: { code: "PRECONDITION_REQUIRED" } },
    );
    const due = changes(client, {
      now: () => new Date("2031-04-09T12:00:00Z"),
    });
    expect(
      await due.preview.execute(
        access,
        success({
          ...nameChange,
          stay: { checkIn: "2031-04-11", checkOut: "2031-04-14" },
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: {
          reason: "DEADLINE_PASSED",
          deadline: "2031-04-09T12:00:00.000Z",
          branch: { slug: "new-cairo" },
        },
      },
    });
    expect(
      await useCases.apply.execute(
        access,
        row.version,
        success({
          ...nameChange,
          expectedTotal: money(TOTAL_MINOR),
          stay: { checkIn: "2031-03-01", checkOut: "2031-03-02" },
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "DEADLINE_PASSED" },
      },
    });
    expect(
      (await requestCancellation({ client, clock }).execute(access, {})).ok,
    ).toBe(true);
    expect(
      await useCases.apply.execute(access, row.version, submitted),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "REQUEST_OPEN" },
      },
    });
    await client.guest.update({
      where: { id: row.guestId! },
      data: { blockedAt: NOW, blockedById: "actor-admin", blockReason: "test" },
    });
    expect(await useCases.preview.execute(access, submitted)).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "PHONE_BLOCKED" },
      },
    });
    expect(
      await useCases.apply.execute(session, row.version, submitted),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "PHONE_BLOCKED" },
      },
    });
    expect(await client.reservationChange.count()).toBe(0);
  });

  it("hides another branch, refuses a retired new unit and dates beyond public limits, and permits keeping a retired unit", async () => {
    const { row, listing, access } = await book();
    await seedBranch(client, { id: "other-branch", slug: "elsewhere" });
    await seedBookable(client, { branchId: "other-branch", slug: "foreign" });
    const draft = await seedBookable(client, { slug: "local-draft" });
    await client.room.updateMany({
      where: { id: { in: [listing.id, draft.id] } },
      data: { status: "DRAFT" },
    });
    const unit = (roomSlug: string) => ({
      roomSlug,
      occupancy: { adults: 2, children: 0 },
    });
    const { preview } = changes();
    for (const slug of ["foreign", "local-draft"])
      expect(
        await preview.execute(access, success({ lines: [unit(slug)] })),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await preview.execute(
        access,
        success({ ...nameChange, lines: [unit(listing.slug)] }),
      ),
    ).toMatchObject({ ok: true });
    for (const stay of [
      { checkIn: "2031-04-10", checkOut: "2031-05-11" },
      { checkIn: "2033-04-10", checkOut: "2033-04-13" },
    ])
      expect(await preview.execute(access, success({ stay }))).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    expect(
      await preview.execute(
        access,
        success({ guest: { fullName: row.guestName } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    await client.reservation.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
    expect(await preview.execute(access, success(nameChange))).toMatchObject({
      ok: false,
      error: { code: "CHANGE_NOT_ALLOWED", context: { reason: "STATUS" } },
    });
    await client.reservation.update({
      where: { id: row.id },
      data: {
        status: "CONFIRMED",
        paymentMethod: "ONLINE",
        paymentStatus: "PAID",
      },
    });
    expect(await preview.execute(access, success(nameChange))).toMatchObject({
      ok: false,
      error: { code: "CHANGE_NOT_ALLOWED", context: { reason: "STATUS" } },
    });
  });

  it("limits five successful guest changes across callers and reopens exactly after 24 hours", async () => {
    const { row, access } = await book();
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await changes().apply.execute(
            access,
            row.version + i,
            success({
              guest: { specialRequests: `Request ${i}` },
              expectedTotal: money(TOTAL_MINOR),
            }),
          )
        ).ok,
      ).toBe(true);
    }
    const submitted = success({
      ...nameChange,
      expectedTotal: money(TOTAL_MINOR),
    });
    const almost = changes(client, {
      now: () => new Date(NOW.getTime() + 86_400_000 - 1),
    });
    expect(
      await almost.apply.execute(access, row.version + 5, submitted),
    ).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retryAfterSeconds: 1 },
    });
    expect(await almost.preview.execute(access, submitted)).toMatchObject({
      ok: true,
    });
    const after = changes(client, {
      now: () => new Date(NOW.getTime() + 86_400_000),
    });
    expect(
      (await after.apply.execute(access, row.version + 5, submitted)).ok,
    ).toBe(true);
    expect(
      await client.reservationChange.count({
        where: { reservationId: row.id },
      }),
    ).toBe(6);
  });

  it("notifies the old email without booking data, rotates the link to WhatsApp only, and delivers the full change", async () => {
    const { row, access, phone } = await book();
    const session = await guestSession(phone, row.reference);
    await client.notificationOutbox.deleteMany();
    // The dispatcher uses real wall time for queue creation in this test.
    const newEmail = "new-contact@example.test";
    expect(
      await changes().apply.execute(
        session,
        row.version,
        success({
          guest: { email: newEmail },
          expectedTotal: money(TOTAL_MINOR),
        }),
      ),
    ).toMatchObject({
      ok: true,
      value: { reservation: { contact: { email: newEmail } } },
    });
    const rows = await client.notificationOutbox.findMany({
      where: { reservationId: row.id },
    });
    expect(rows).toHaveLength(5);
    const email = new FakeReservationEmail();
    const send = vi.fn<WhatsAppSender["send"]>(async () => ({
      ok: true,
      providerMessageId: "fake",
    }));
    const dispatch = new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      email,
      { send },
      { now: () => new Date() },
    );
    expect(await dispatch.run()).toEqual({
      sent: 5,
      failed: 0,
      retried: 0,
      stale: 0,
    });
    const notice = email.deliveries.find(
      (message) => message.kind === "reservation.email-changed",
    )!;
    expect(notice).toMatchObject({
      to: row.guestEmail,
      variables: {
        reference: "",
        branchName: "Rivana Residence",
        hotelEmail: "front@example.test",
      },
    });
    const rendered = renderReservationEmail(notice.kind, notice.variables);
    expect(rendered.text).toContain("front@example.test");
    expect(JSON.stringify(rendered)).not.toContain(row.reference);
    expect(JSON.stringify(rendered)).not.toContain(newEmail);
    expect(email.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "reservation.modified",
          to: newEmail,
          variables: expect.objectContaining({
            previousTotal: "USD 345.00",
            total: "USD 345.00",
          }),
        }),
        expect.objectContaining({
          kind: "reservation.change-staff-alert",
          to: "front@example.test",
        }),
      ]),
    );
    expect(
      email.deliveries.some((message) => message.variables.manageLink),
    ).toBe(false);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "RESERVATION_MODIFIED",
        variables: expect.objectContaining({ previousTotal: "USD 345.00" }),
      }),
    );
    const linkCall = send.mock.calls.find(
      ([message]) => message.purpose === "MANAGE_LINK",
    )![0];
    expect(linkCall.to.value).toBe(phone);
    const fresh = new URL(linkCall.variables.manageLink!);
    const freshToken = new URLSearchParams(fresh.hash.slice(1)).get("t");
    const { view } = guestReservationReads({ client, clock });
    expect(await view.execute(freshToken)).toMatchObject({ ok: true });
    expect(await view.execute(access.token)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(
      await client.notificationOutbox.count({
        where: { status: "SENT", payload: { equals: {} } },
      }),
    ).toBe(5);
    expect(
      await client.guest.findUnique({ where: { id: row.guestId! } }),
    ).toMatchObject({ email: row.guestEmail });
  });

  // Spec 0006 Decision 9: an email verified booking has no proven phone.
  it("revokes the link of an email verified booking without sending a replacement or any WhatsApp", async () => {
    const { row, access } = await book(1, { email: "amina@example.test" });
    expect(row.verificationChannel).toBe("EMAIL");
    await client.notificationOutbox.deleteMany();
    const newEmail = "new-contact@example.test";
    expect(
      await changes().apply.execute(
        access,
        row.version,
        success({
          guest: { email: newEmail },
          expectedTotal: money(TOTAL_MINOR),
        }),
      ),
    ).toMatchObject({ ok: true });
    const rows = await client.notificationOutbox.findMany({
      where: { reservationId: row.id },
    });
    expect(rows.every((message) => message.channel === "EMAIL")).toBe(true);
    expect(rows.map((message) => message.kind).sort()).toEqual([
      "reservation.change-staff-alert",
      "reservation.email-changed",
      "reservation.modified",
    ]);
    const stored = await client.reservation.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(stored.manageTokenHash).toBeNull();
    const { view } = guestReservationReads({ client, clock });
    expect(await view.execute(access.token)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("clears the link of a priced staff booking with no usable phone and sends email only", async () => {
    await createActor(client);
    const listing = await seedBookable(client, { units: 1 });
    const oldEmail = "legacy-staff@example.test";
    const newEmail = "updated-staff@example.test";
    const made = await staffReservationCommands({
      client,
      clock,
    }).create.execute(
      {
        id: "actor-admin",
        name: "Admin",
        email: "admin@example.test",
        role: "ADMIN",
        branchIds: [],
        sessionId: "staff",
      },
      {
        branchId: TEST_BRANCH_ID,
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
        lines: [
          { roomTypeId: listing.id, occupancy: { adults: 2, children: 0 } },
        ],
        guest: {
          fullName: "Staff Booking Guest",
          email: oldEmail,
          phone: phoneOf(20),
        },
        sendConfirmation: true,
      },
      "priced-staff-booking",
    );
    if (!made.ok) throw new Error("Expected a staff booking.");
    const { id, version, reference } = made.value.reservation;
    const confirmation = await client.notificationOutbox.findFirstOrThrow({
      where: {
        reservationId: id,
        kind: "reservation.confirmed",
        channel: "EMAIL",
      },
    });
    const link = new URL(
      (confirmation.payload as { manageLink: string }).manageLink,
    );
    const token = new URLSearchParams(link.hash.slice(1)).get("t");
    if (!token) throw new Error("Expected a manage token.");
    // Legacy staff records may have a link and an email with no usable phone.
    await client.reservation.update({
      where: { id },
      data: { guestPhone: null, guestId: null },
    });
    await client.notificationOutbox.deleteMany({
      where: { reservationId: id },
    });
    expect(
      await changes().apply.execute(
        { kind: "MANAGE_TOKEN", token },
        version,
        success({
          guest: { email: newEmail },
          expectedTotal: money(TOTAL_MINOR),
        }),
      ),
    ).toMatchObject({
      ok: true,
      value: { reservation: { contact: { email: newEmail, phone: null } } },
    });
    expect(
      await client.reservation.findUnique({ where: { id } }),
    ).toMatchObject({
      source: "STAFF",
      manageTokenHash: null,
      manageTokenExpiresAt: null,
    });
    expect(
      await guestReservationReads({ client, clock }).view.execute(token),
    ).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    const queued = await client.notificationOutbox.findMany({
      where: { reservationId: id },
    });
    expect(
      queued.map(({ channel, kind, recipient }) => ({
        channel,
        kind,
        recipient,
      })),
    ).toEqual(
      expect.arrayContaining([
        { channel: "EMAIL", kind: "reservation.modified", recipient: newEmail },
        {
          channel: "EMAIL",
          kind: "reservation.email-changed",
          recipient: oldEmail,
        },
        {
          channel: "EMAIL",
          kind: "reservation.change-staff-alert",
          recipient: "front@example.test",
        },
      ]),
    );
    expect(queued).toHaveLength(3);
    const oldNotice = queued.find(
      (row) => row.kind === "reservation.email-changed",
    )!;
    expect(JSON.stringify(oldNotice.payload)).not.toMatch(
      new RegExp(`${reference.value}|${newEmail}|manageLink`),
    );
  });

  it("rolls back the booking, history, link and outbox when audit fails", async () => {
    const { row, access } = await book();
    const outboxCount = await client.notificationOutbox.count();
    const apply = applyWithContext(client, (context) => ({
      ...context,
      audit: {
        append: async () => {
          throw new Error("injected audit failure");
        },
      },
    }));
    await expect(
      apply.execute(
        access,
        row.version,
        success({
          guest: { email: "new-contact@example.test" },
          expectedTotal: money(TOTAL_MINOR),
        }),
      ),
    ).rejects.toThrow("injected audit failure");
    expect(
      await client.reservation.findUnique({ where: { id: row.id } }),
    ).toEqual(row);
    await assertNoAppliedChange(row.id, outboxCount);
  });
});

describe("Concurrent guest changes (C-16)", () => {
  it.each(["booking", "change"] as const)(
    "lets only the %s win an observed last room race, 20 rounds",
    async (winner) => {
      for (let round = 0; round < 20; round++) {
        if (round > 0) await resetDatabase(client);
        const { row, access, listing } = await book();
        const phone = phoneOf(15);
        const input = bookingBody(phone, await issueToken(client, phone), {
          stay: { checkIn: "2031-04-13", checkOut: "2031-04-14" },
          expectedTotal: money(11500),
        });
        const edit = success({ stay: longer, expectedTotal: money(46000) });
        const outboxCount = await client.notificationOutbox.count({
          where: { reservationId: row.id },
        });
        await withIndependentClients(2, async ([a, b]) => {
          const pause = pausedAudit();
          const create = () =>
            websiteBooking(
              a!,
              winner === "booking" ? { audit: pause.audit } : {},
            ).execute(input, "rival-last-room");
          const change = () =>
            applyWithContext(b!, (context) =>
              winner === "change"
                ? { ...context, audit: pause.audit(context.audit) }
                : context,
            ).execute(access, row.version, edit);
          const lead = winner === "booking" ? create() : change();
          await Promise.race([
            pause.reached,
            lead.then(() => {
              throw new Error("Winner completed before taking the lock.");
            }),
          ]);
          const trailing = winner === "booking" ? change() : create();
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            pause.release();
          }
          expect((await lead).ok).toBe(true);
          expect(await trailing).toMatchObject({
            ok: false,
            error: { code: "INVENTORY_UNAVAILABLE" },
          });
        });
        expect(
          await client.reservationRoom.count({
            where: {
              roomTypeId: listing.id,
              consumesInventory: true,
              checkIn: { lte: new Date("2031-04-13") },
              checkOut: { gt: new Date("2031-04-13") },
            },
          }),
        ).toBe(1);
        if (winner === "booking") {
          expect(
            await client.reservation.findUnique({ where: { id: row.id } }),
          ).toEqual(row);
          await assertNoAppliedChange(row.id, outboxCount);
          expect(await changes().preview.execute(access, edit)).toMatchObject({
            ok: true,
            value: {
              preview: {
                available: false,
                unavailableLines: [0],
                proposed: null,
              },
            },
          });
        } else {
          expect(
            await client.reservationChange.count({
              where: { reservationId: row.id },
            }),
          ).toBe(1);
          expect(await client.reservation.count()).toBe(1);
        }
      }
    },
    90_000,
  );

  it("serializes two edits quoted from the same version, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      if (round > 0) await resetDatabase(client);
      const { row, access } = await book();
      const input = success({
        ...nameChange,
        expectedTotal: money(TOTAL_MINOR),
      });
      await withIndependentClients(2, async ([a, b]) => {
        const pause = pausedAudit();
        const first = applyWithContext(a!, (context) => ({
          ...context,
          audit: pause.audit(context.audit),
        })).execute(access, row.version, input);
        await Promise.race([
          pause.reached,
          first.then(() => {
            throw new Error("First change finished without a lock.");
          }),
        ]);
        const second = changes(b!).apply.execute(access, row.version, input);
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          pause.release();
        }
        expect((await first).ok).toBe(true);
        expect(await second).toMatchObject({
          ok: false,
          error: { code: "STALE_VERSION" },
        });
      });
      expect(
        await client.reservationChange.count({
          where: { reservationId: row.id },
        }),
      ).toBe(1);
    }
  }, 90_000);

  it("rechecks an active cancellation under the booking lock, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      if (round > 0) await resetDatabase(client);
      const { row, access } = await book();
      await withIndependentClients(2, async ([a, b]) => {
        const opened = deferred();
        const release = deferred();
        // Hold the same row lock as G2 while the apply starts with an older read.
        const cancel = a!.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${row.id} FOR UPDATE`;
          await tx.cancellationRequest.create({
            data: {
              id: "concurrent-cancel",
              reservationId: row.id,
              requestedBy: "GUEST",
            },
          });
          opened.resolve();
          await release.promise;
        });
        await Promise.race([opened.promise, cancel]);
        const edit = changes(b!).apply.execute(
          access,
          row.version,
          success({ ...nameChange, expectedTotal: money(TOTAL_MINOR) }),
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          release.resolve();
        }
        await cancel;
        expect(await edit).toMatchObject({
          ok: false,
          error: {
            code: "CHANGE_NOT_ALLOWED",
            context: { reason: "REQUEST_OPEN" },
          },
        });
      });
      expect(
        await client.reservationChange.count({
          where: { reservationId: row.id },
        }),
      ).toBe(0);
    }
  }, 90_000);
});

describe("Guest change HTTP contracts (AC-11)", () => {
  async function routeFixture() {
    const { access, row, phone } = await book();
    const session = await guestSession(phone, row.reference);
    const { POST: managePreview } = await import(
      "@/app/api/v1/guest/reservation/change-preview/route"
    );
    const { POST: manageApply } = await import(
      "@/app/api/v1/guest/reservation/changes/route"
    );
    const { POST: sessionPreview } = await import(
      "@/app/api/v1/guest/reservations/[reference]/change-preview/route"
    );
    const { POST: sessionApply } = await import(
      "@/app/api/v1/guest/reservations/[reference]/changes/route"
    );
    const params = { params: Promise.resolve({ reference: row.reference }) };
    const request = (
      path: string,
      token: string,
      input: unknown,
      version?: number,
    ) =>
      new Request(`http://localhost:3000/api/v1/guest/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(version === undefined ? {} : { "If-Match": `"v${version}"` }),
        },
        body: JSON.stringify(input),
      });
    return {
      row,
      access,
      session,
      previewViaLink: (input: unknown) =>
        managePreview(
          request("reservation/change-preview", access.token, input),
          { params: Promise.resolve({}) },
        ),
      previewViaSession: (input: unknown) =>
        sessionPreview(
          request(
            `reservations/${row.reference}/change-preview`,
            session.token,
            input,
          ),
          params,
        ),
      applyViaLink: (input: unknown) =>
        manageApply(
          request("reservation/changes", access.token, input, row.version),
          { params: Promise.resolve({}) },
        ),
      applyViaSession: (input: unknown) =>
        sessionApply(
          request(
            `reservations/${row.reference}/changes`,
            session.token,
            input,
            row.version,
          ),
          params,
        ),
    };
  }

  it("rejects protected fields and logs neither the credentials nor the body", async () => {
    const fixture = await routeFixture();
    const { access, session, row, previewViaLink, applyViaSession } = fixture;
    const outboxCount = await client.notificationOutbox.count();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const logs = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const value = await previewViaLink({
        branchSlug: "other-branch",
        paymentMethod: "ONLINE",
        couponCode: "DO-NOT-LOG",
        guest: { phone: "+12025550123", specialRequests: "Private payload" },
      });
      expect(value.status).toBe(422);
      expect(await value.json()).toMatchObject({
        code: "VALIDATION",
        fieldErrors: expect.objectContaining({
          branchSlug: expect.any(Array),
          paymentMethod: expect.any(Array),
          couponCode: expect.any(Array),
          "guest.phone": expect.any(Array),
        }),
      });
      const refused = await applyViaSession({
        ...nameChange,
        expectedTotal: money(TOTAL_MINOR),
        guest: { phone: "+12025550123" },
      });
      expect(refused.status).toBe(422);
      expect(refused.headers.get("Cache-Control")).toBe("no-store");
      expect(logs.mock.calls).toHaveLength(2);
      const output = JSON.stringify(logs.mock.calls);
      for (const secret of [
        access.token,
        session.token,
        row.reference,
        "Private payload",
        "DO-NOT-LOG",
        "+12025550123",
      ])
        expect(output).not.toContain(secret);
    } finally {
      logs.mockRestore();
      vi.useRealTimers();
    }
    await assertNoAppliedChange(row.id, outboxCount);
  });

  it("shares separate preview and apply client buckets across both routes", async () => {
    const {
      previewViaLink,
      previewViaSession,
      applyViaLink,
      applyViaSession,
      row,
    } = await routeFixture();
    const outboxCount = await client.notificationOutbox.count();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      for (let i = 0; i < 30; i++) {
        const preview =
          i % 2
            ? await previewViaLink(nameChange)
            : await previewViaSession(nameChange);
        expect(preview.status).toBe(200);
      }
      const previewRefused = await previewViaSession(nameChange);
      expect(previewRefused.status).toBe(429);
      expect(previewRefused.headers.get("Retry-After")).toBe("600");
      for (let i = 0; i < 10; i++) {
        const apply =
          i % 2
            ? await applyViaLink(nameChange)
            : await applyViaSession(nameChange);
        expect(apply.status).toBe(422);
      }
      const applyRefused = await applyViaLink(nameChange);
      expect(applyRefused.status).toBe(429);
      expect(applyRefused.headers.get("Retry-After")).toBe("3600");
    } finally {
      vi.useRealTimers();
    }
    await assertNoAppliedChange(row.id, outboxCount);
  });
});
