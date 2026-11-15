import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";
import {
  insertStorage,
  reservationData,
  roomData,
  storageId,
} from "./support/reservation-storage";
import { testDatabaseUrl } from "./support/test-database";

const prisma = createTestClient();
const db = new Client({
  connectionString: testDatabaseUrl().url,
  options: "-c TimeZone=UTC",
});
let roomId: string;
let reservationId: string;
let physicalId: string;
beforeAll(() => db.connect());
afterAll(async () => {
  await db.end();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await createActor(prisma);
  roomId = (await createRoom(prisma)).id;
  physicalId = storageId();
  await prisma.physicalRoom.create({
    data: {
      id: physicalId,
      branchId: TEST_BRANCH_ID,
      roomTypeId: roomId,
      label: "101",
    },
  });
  const data = reservationData();
  reservationId = data.id;
  await insertStorage(db, "Reservation", data);
});

const reserve = (data: Record<string, unknown> = {}) =>
  insertStorage(db, "Reservation", reservationData(data));
const line = (data: Record<string, unknown> = {}) =>
  insertStorage(db, "ReservationRoom", roomData(reservationId, roomId, data));
const rejected = (action: Promise<unknown>, code = "23514") =>
  expect(action).rejects.toMatchObject({ code });

describe("M8 T-DB-6…8 reservation storage", () => {
  it("round trips DATE stays, UTC instants and complete integer snapshots", async () => {
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(row).toMatchObject({
      checkIn: new Date("2027-01-01T00:00:00Z"),
      checkOut: new Date("2027-01-03T00:00:00Z"),
      totalMinor: 115,
      version: 1,
      paymentMethod: "PAY_AT_HOTEL",
      paymentStatus: "NOT_REQUIRED",
    });
    const [{ type }] = (
      await db.query(
        `SELECT pg_typeof("totalMinor")::text AS type FROM "Reservation" LIMIT 1`,
      )
    ).rows;
    expect(type).toBe("integer");
  });
  it.each(["PENDING", "DECLINED"])(
    "rejects obsolete reservation status %s",
    async (status) => {
      await rejected(reserve({ status }), "22P02");
    },
  );
  it.each([
    { checkOut: "2027-01-01" },
    { checkOut: "2026-12-31" },
    { version: 0 },
    { currency: "EUR" },
    { source: "EXTERNAL" },
    { source: "EXTERNAL", externalReference: " " },
    { source: "WEBSITE", guestEmail: "guest@example.test" },
  ])("rejects invalid reservation shape %j", async (values) => {
    await rejected(reserve(values));
  });
  it.each([
    "accommodationMinor",
    "subtotalMinor",
    "taxableMinor",
    "vatRateBasisPoints",
    "vatMinor",
    "totalMinor",
  ])("rejects incomplete priced snapshot when %s is null", async (column) => {
    await rejected(reserve({ [column]: null }));
  });
  it.each([
    { totalMinor: 114 },
    { subtotalMinor: 99 },
    { taxableMinor: 99 },
    { vatRateBasisPoints: -1 },
    { vatRateBasisPoints: 10001 },
    { discountMinor: -1 },
    { servicesMinor: -1 },
    {
      accommodationMinor: -100,
      subtotalMinor: -100,
      taxableMinor: -100,
      vatMinor: 0,
      totalMinor: -100,
    },
  ])("rejects invalid money %j", async (values) => {
    await rejected(reserve(values));
  });
  it("allows zero price and VAT boundaries, and rejects INTEGER overflow", async () => {
    await reserve({
      accommodationMinor: 0,
      subtotalMinor: 0,
      taxableMinor: 0,
      vatMinor: 0,
      totalMinor: 0,
      vatRateBasisPoints: 0,
    });
    await reserve({
      vatRateBasisPoints: 10000,
      vatMinor: 100,
      totalMinor: 200,
    });
    await reserve({
      accommodationMinor: 2147483647,
      subtotalMinor: 2147483647,
      taxableMinor: 2147483647,
      vatRateBasisPoints: 0,
      vatMinor: 0,
      totalMinor: 2147483647,
    });
    await rejected(reserve({ totalMinor: 2147483648 }), "22003");
  });
  it("allows only EXTERNAL reservations to have an entirely unpriced snapshot", async () => {
    const unpriced = {
      accommodationMinor: null,
      subtotalMinor: null,
      taxableMinor: null,
      vatRateBasisPoints: null,
      vatMinor: null,
      totalMinor: null,
    };
    await reserve({
      ...unpriced,
      source: "EXTERNAL",
      externalReference: "PMS-1",
    });
    await rejected(reserve(unpriced));
    await rejected(
      reserve({
        ...unpriced,
        source: "EXTERNAL",
        externalReference: "PMS-2",
        servicesMinor: 1,
      }),
    );
    await rejected(
      reserve({
        ...unpriced,
        source: "EXTERNAL",
        externalReference: "PMS-3",
        vatRateBasisPoints: 0,
      }),
    );
  });
  it("requires a PAYMOB hold for AWAITING_PAYMENT but retains future enum values", async () => {
    await rejected(reserve({ status: "AWAITING_PAYMENT" }));
    await rejected(
      reserve({ status: "AWAITING_PAYMENT", paymentMethod: "PAYMOB" }),
    );
    await reserve({
      status: "AWAITING_PAYMENT",
      paymentMethod: "PAYMOB",
      paymentStatus: "AWAITING",
      holdExpiresAt: "2026-11-15T01:00:00Z",
    });
    await reserve({ status: "PAYMENT_FAILED", paymentMethod: "PAYMOB" });
  });
  it("requires a guest and email for website records", async () => {
    await prisma.guest.create({
      data: { id: "guest", phone: "+12025550101", name: "Test" },
    });
    await rejected(reserve({ source: "WEBSITE", guestId: "guest" }));
    await reserve({
      source: "WEBSITE",
      guestId: "guest",
      guestEmail: "guest@example.test",
    });
  });
  it("enforces reference uniqueness globally and external reference uniqueness per branch", async () => {
    await rejected(
      reserve({
        reference: (
          await prisma.reservation.findUniqueOrThrow({
            where: { id: reservationId },
          })
        ).reference,
      }),
      "23505",
    );
    await reserve({ source: "EXTERNAL", externalReference: "PMS-1" });
    await rejected(
      reserve({ source: "EXTERNAL", externalReference: "PMS-1" }),
      "23505",
    );
    await createBranch(prisma, { id: "other", slug: "other" });
    await reserve({
      branchId: "other",
      source: "EXTERNAL",
      externalReference: "PMS-1",
    });
  });
  it("enforces NULL creator idempotency, staff scope, source scope and keyless rows", async () => {
    await reserve({ idempotencyKeyHash: "same" });
    await rejected(reserve({ idempotencyKeyHash: "same" }), "23505");
    await reserve({ idempotencyKeyHash: "same", createdById: "actor-admin" });
    await rejected(
      reserve({ idempotencyKeyHash: "same", createdById: "actor-admin" }),
      "23505",
    );
    await reserve({
      idempotencyKeyHash: "same",
      source: "EXTERNAL",
      externalReference: "EXT",
    });
    await reserve();
    await reserve();
  });
  it("rejects cross branch parent and listing links and a unit of another listing", async () => {
    await createBranch(prisma, { id: "other", slug: "other" });
    const other = await createRoom(prisma, { branchId: "other" });
    await rejected(line({ roomTypeId: other.id }), "23503");
    await rejected(line({ branchId: "other", roomTypeId: other.id }), "23503");
    const sameBranch = await createRoom(prisma);
    await rejected(
      line({ roomTypeId: sameBranch.id, physicalRoomId: physicalId }),
      "23503",
    );
    await line({ physicalRoomId: physicalId });
  });
  it.each([
    { checkOut: "2027-01-01" },
    { adults: 0 },
    { children: -1 },
    { subtotalMinor: -1 },
  ])("rejects invalid line %j", async (values) => {
    await rejected(line(values));
  });
  it("rejects overlap on insert and update but permits adjacency, unassigned and released lines", async () => {
    await line({ physicalRoomId: physicalId });
    await rejected(line({ physicalRoomId: physicalId }), "23P01");
    await line({
      physicalRoomId: physicalId,
      checkIn: "2027-01-03",
      checkOut: "2027-01-04",
    });
    const released = (
      await line({ physicalRoomId: physicalId, consumesInventory: false })
    ).rows[0];
    await line();
    await line();
    await rejected(
      db.query(
        `UPDATE "ReservationRoom" SET "consumesInventory"=true WHERE id=$1`,
        [released.id],
      ),
      "23P01",
    );
  });
  it("checks updates as strictly as inserts and prevents branch reassignment", async () => {
    await line();
    await rejected(
      db.query(`UPDATE "Reservation" SET "totalMinor"=116 WHERE id=$1`, [
        reservationId,
      ]),
    );
    await createBranch(prisma, { id: "other", slug: "other" });
    await rejected(
      db.query(`UPDATE "Reservation" SET "branchId"='other' WHERE id=$1`, [
        reservationId,
      ]),
      "23001",
    );
  });
  it("keeps nightly snapshots after rate deletion and cascades owned rows", async () => {
    const room = (await line()).rows[0];
    await prisma.ratePeriod.create({
      data: {
        id: "period",
        roomTypeId: roomId,
        startDate: new Date("2027-01-01"),
        endDate: new Date("2027-01-03"),
        amountMinor: 50,
      },
    });
    await insertStorage(db, "ReservationNight", {
      reservationRoomId: room.id,
      night: "2027-01-01",
      amountMinor: 50,
      rateSource: "PERIOD",
      ratePeriodId: "period",
    });
    await rejected(
      insertStorage(db, "ReservationNight", {
        reservationRoomId: room.id,
        night: "2027-01-02",
        amountMinor: -1,
      }),
    );
    await rejected(
      insertStorage(db, "ReservationNight", {
        reservationRoomId: room.id,
        night: "2027-01-01",
        amountMinor: 50,
      }),
      "23505",
    );
    await prisma.ratePeriod.delete({ where: { id: "period" } });
    expect(await prisma.reservationNight.findFirst()).toMatchObject({
      amountMinor: 50,
      ratePeriodId: null,
      rateSource: "PERIOD",
    });
    await rejected(
      db.query(`DELETE FROM "Room" WHERE id=$1`, [roomId]),
      "23001",
    );
    await prisma.reservation.delete({ where: { id: reservationId } });
    expect(await prisma.reservationRoom.count()).toBe(0);
    expect(await prisma.reservationNight.count()).toBe(0);
  });
  it("stores service quantities, restricts invalid values and keeps a snapshot independent of offerings", async () => {
    const data = {
      reservationId,
      kind: "BREAKFAST",
      priceUnit: "PER_PERSON_PER_NIGHT",
      priceMinor: 100,
      childPriceMinor: 50,
      adults: 2,
      children: 1,
      nights: 2,
      adultQuantity: 4,
      childQuantity: 2,
      amountMinor: 500,
    };
    await insertStorage(db, "ReservationService", data);
    await rejected(insertStorage(db, "ReservationService", data), "23505");
    for (const values of [
      { priceMinor: 0 },
      { amountMinor: -1 },
      { adultQuantity: -1 },
      { childPriceMinor: 0 },
      { priceUnit: "PER_BOOKING" },
    ]) {
      await rejected(
        db.query(
          `UPDATE "ReservationService" SET ${Object.keys(values)
            .map((key, i) => `"${key}"=$${i + 1}`)
            .join(",")}`,
          Object.values(values),
        ),
      );
    }
    expect(await prisma.reservationService.findFirst()).toMatchObject({
      amountMinor: 500,
    });
    await prisma.reservation.delete({ where: { id: reservationId } });
    expect(await prisma.reservationService.count()).toBe(0);
  });
  it("stores one coupon redemption per reservation and restricts deleting a used coupon", async () => {
    await prisma.coupon.create({
      data: { id: "coupon", code: "TEST", kind: "FIXED", amountMinor: 10 },
    });
    await insertStorage(db, "CouponRedemption", {
      reservationId,
      couponId: "coupon",
      phone: "+12025550101",
    });
    await rejected(
      insertStorage(db, "CouponRedemption", {
        reservationId,
        couponId: "coupon",
      }),
      "23505",
    );
    await rejected(db.query(`DELETE FROM "Coupon" WHERE id='coupon'`), "23001");
    await prisma.couponRedemption.update({
      where: { reservationId },
      data: { releasedAt: new Date("2026-11-15") },
    });
    expect(
      await prisma.couponRedemption.count({ where: { releasedAt: null } }),
    ).toBe(0);
  });
  it("rolls back reservation, lines, redemption and outbox together", async () => {
    await prisma.coupon.create({
      data: {
        id: "rollback-coupon",
        code: "ROLLBACK",
        kind: "FIXED",
        amountMinor: 10,
      },
    });
    await db.query("BEGIN");
    const data = reservationData();
    await insertStorage(db, "Reservation", data);
    await insertStorage(db, "ReservationRoom", roomData(data.id, roomId));
    await insertStorage(db, "CouponRedemption", {
      reservationId: data.id,
      couponId: "rollback-coupon",
    });
    await insertStorage(db, "NotificationOutbox", {
      id: storageId(),
      reservationId: data.id,
      channel: "EMAIL",
      kind: "reservation.confirmed",
      recipient: "guest@example.test",
      payload: "{}",
      availableAt: "2026-11-15T00:00:00Z",
    });
    // A constraint failure aborts every earlier write in this transaction.
    await rejected(
      insertStorage(
        db,
        "ReservationRoom",
        roomData(data.id, roomId, { adults: 0 }),
      ),
    );
    await db.query("ROLLBACK");
    expect(await prisma.couponRedemption.count()).toBe(0);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await prisma.reservationRoom.count()).toBe(0);
    expect(await prisma.notificationOutbox.count()).toBe(0);
  });
});

describe("M8 guest, verification and messaging storage", () => {
  it("enforces unique phones and token hashes, supports both purposes and keeps only hash fields", async () => {
    await prisma.guest.create({
      data: {
        id: "guest",
        phone: "+12025550101",
        name: "Test",
        marketingOptInAt: new Date("2026-11-15"),
        marketingConsentVersion: "demo-v1",
      },
    });
    await rejected(
      insertStorage(db, "Guest", {
        id: "duplicate",
        phone: "+12025550101",
        name: "Test",
        updatedAt: new Date(),
      }),
      "23505",
    );
    const verification = {
      phone: "+12025550101",
      purpose: "BOOKING",
      codeHash: "a".repeat(64),
      tokenHash: "b".repeat(64),
      expiresAt: "2026-11-15T00:10:00Z",
      clientKey: "hmac-client",
    };
    await insertStorage(db, "PhoneVerification", {
      id: "verification",
      ...verification,
    });
    await rejected(
      insertStorage(db, "PhoneVerification", {
        id: "duplicate",
        ...verification,
      }),
      "23505",
    );
    for (const attempts of [-1, 6])
      await rejected(
        db.query(`UPDATE "PhoneVerification" SET attempts=$1`, [attempts]),
      );
    await db.query(`UPDATE "PhoneVerification" SET attempts=5`);
    await insertStorage(db, "PhoneVerification", {
      id: "session",
      ...verification,
      purpose: "GUEST_SESSION",
      tokenHash: null,
    });
    await reserve({ guestId: "guest", manageTokenHash: "c".repeat(64) });
    await rejected(reserve({ manageTokenHash: "c".repeat(64) }), "23505");
    await rejected(db.query(`DELETE FROM "Guest" WHERE id='guest'`), "23001");
    const columns = (
      await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='PhoneVerification'`,
      )
    ).rows.map((row) => row.column_name);
    expect(columns).toContain("codeHash");
    expect(columns).toContain("tokenHash");
    expect(columns).not.toContain("code");
    expect(columns).not.toContain("token");
  });
  it("requires existing staff for block, PMS entry, template settings and sync history", async () => {
    await rejected(reserve({ pmsEnteredById: "missing" }), "23503");
    await rejected(
      insertStorage(db, "Guest", {
        id: "guest",
        phone: "+12025550101",
        name: "Test",
        blockedById: "missing",
        updatedAt: new Date(),
      }),
      "23503",
    );
    await rejected(
      db.query(`UPDATE "WhatsAppSettings" SET "updatedById"='missing'`),
      "23503",
    );
    await rejected(
      insertStorage(db, "BranchSyncCheckpoint", {
        id: "checkpoint",
        branchId: TEST_BRANCH_ID,
        kind: "STARTED",
        recordedById: "missing",
      }),
      "23503",
    );
    await insertStorage(db, "BranchSyncCheckpoint", {
      id: "checkpoint",
      branchId: TEST_BRANCH_ID,
      kind: "COMPLETED",
      recordedById: "actor-admin",
    });
    await rejected(
      db.query(`DELETE FROM "User" WHERE id='actor-admin'`),
      "23001",
    );
    expect(await prisma.branchSyncCheckpoint.findFirst()).toMatchObject({
      kind: "COMPLETED",
    });
  });
  it("allows only one settings row, with empty provider configuration", async () => {
    expect(await prisma.whatsAppSettings.findMany()).toMatchObject([
      { id: "default", businessPhoneNumber: null, providerPhoneNumberId: null },
    ]);
    await rejected(
      insertStorage(db, "WhatsAppSettings", {
        id: "other",
        updatedAt: new Date(),
      }),
    );
    const columns = (
      await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='WhatsAppSettings'`,
      )
    ).rows.map((row) => row.column_name);
    expect(columns).not.toContain("accessToken");
  });
  it("uniquely selects an active nonmarketing template per purpose and language", async () => {
    const template = (values: Record<string, unknown> = {}) =>
      insertStorage(db, "WhatsAppTemplate", {
        id: storageId(),
        purpose: "BOOKING_CONFIRMED",
        language: "en",
        providerName: "fictional_demo",
        category: "UTILITY",
        variables: "[]",
        previewText: "Fictional",
        updatedAt: new Date(),
        ...values,
      });
    await template();
    await rejected(template(), "23505");
    const inactive = (await template({ active: false })).rows[0];
    await rejected(
      db.query(`UPDATE "WhatsAppTemplate" SET active=true WHERE id=$1`, [
        inactive.id,
      ]),
      "23505",
    );
    await template({ language: "ar" });
    await template({ purpose: "VERIFICATION_CODE" });
    await template({ purpose: "MARKETING" });
    await template({ purpose: "MARKETING" });
  });
  it("stores independent email and WhatsApp outbox rows and validates references and attempts", async () => {
    const data = {
      reservationId,
      kind: "reservation.confirmed",
      recipient: "guest@example.test",
      payload: "{}",
      availableAt: "2026-11-15T00:00:00Z",
    };
    await insertStorage(db, "NotificationOutbox", {
      id: storageId(),
      channel: "EMAIL",
      ...data,
    });
    await insertStorage(db, "NotificationOutbox", {
      id: storageId(),
      channel: "WHATSAPP",
      ...data,
      recipient: "+12025550101",
    });
    await rejected(
      insertStorage(db, "NotificationOutbox", {
        id: storageId(),
        channel: "EMAIL",
        ...data,
        attempts: -1,
      }),
    );
    await rejected(
      insertStorage(db, "NotificationOutbox", {
        id: storageId(),
        channel: "EMAIL",
        ...data,
        reservationId: "missing",
      }),
      "23503",
    );
    expect(await prisma.notificationOutbox.findMany()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "EMAIL",
          status: "PENDING",
          attempts: 0,
        }),
        expect.objectContaining({ channel: "WHATSAPP", status: "PENDING" }),
      ]),
    );
    await rejected(
      db.query(`DELETE FROM "Reservation" WHERE id=$1`, [reservationId]),
      "23001",
    );
  });
});
