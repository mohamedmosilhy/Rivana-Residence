import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import { staffReservationCommands } from "@/composition/reservations";
import {
  StaffReservationDetail,
  StaffReservationHistory,
  StaffReservationList,
} from "@/contracts/api/v1/reservations";
import * as staffCapabilities from "@/domain/auth/capabilities";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { PrismaStaffReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/staff-reservation-reader";
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
  phoneOf,
  seedBookable,
  seedBranch,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";
import { bookByEmailOnline } from "./support/email-booking";

const principals = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    principals.get(headers.get("x-test-staff") ?? "") ?? null,
  throttleKeys: () => new HmacThrottleKeys("test-staff-reservation-hmac"),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
const { GET: list, POST: create } = await import(
  "@/app/api/v1/staff/reservations/route"
);
const { GET: detail } = await import(
  "@/app/api/v1/staff/reservations/[id]/route"
);
const { GET: history } = await import(
  "@/app/api/v1/staff/reservations/[id]/history/route"
);
const { POST: record } = await import(
  "@/app/api/v1/staff/external-reservations/route"
);

const client = createTestClient();
const otherBranch = "other-branch";
const base = "/api/v1/staff/reservations";
const externalPath = "/api/v1/staff/external-reservations";
const origin = process.env.APP_URL ?? "http://localhost:3000";
const stay = { checkIn: "2031-04-10", checkOut: "2031-04-13" };
const guest = {
  fullName: "Private Guest",
  phone: phoneOf(1),
  email: "private@example.test",
};
const occupancy = { adults: 2, children: 0 };
const admin = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff-session",
} as const;

const staffBody = (roomTypeId: string, branchId = TEST_BRANCH_ID) => ({
  branchId,
  stay,
  lines: [{ roomTypeId, occupancy }],
  guest,
  sendConfirmation: false,
});
const externalBody = (roomTypeId: string, branchId = TEST_BRANCH_ID) => ({
  branchId,
  stay,
  lines: [{ roomTypeId, occupancy }],
  guest,
  externalReference: "EXTERNAL-101",
  channel: "Fictional partner",
});
const nights = ["2031-04-10", "2031-04-11", "2031-04-12"].map((night) => ({
  night,
  amountMinor: 2000,
}));
const send = (
  handler: typeof create,
  path: string,
  data: unknown,
  key: string | null = "booking-key-staff-1",
  staff = "admin",
  requestOrigin = origin,
) =>
  handler(
    new Request(new URL(path, origin), {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        origin: requestOrigin,
        "content-type": "application/json",
        "x-test-staff": staff,
        ...(key === null ? {} : { "idempotency-key": key }),
      },
    }),
  );
const read = (
  handler: typeof list,
  path: string,
  staff = "admin",
  id?: string,
) =>
  handler(
    new Request(new URL(path, origin), { headers: { "x-test-staff": staff } }),
    {
      params: Promise.resolve({ id }),
    },
  );
const problemCode = async (response: Response) => (await response.json()).code;

beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  principals.clear();
  principals.set("admin", admin);
  principals.set("reception", {
    ...admin,
    role: "RECEPTIONIST",
    branchIds: [TEST_BRANCH_ID],
  });
  principals.set("foreign", {
    ...admin,
    role: "MANAGER",
    branchIds: [otherBranch],
  });
});
afterAll(() => client.$disconnect());

describe("staff reservation REST and PostgreSQL", () => {
  it("creates a multi-unit S3 booking with services and coupon, sends one confirmation per channel, and replays", async () => {
    const room = await seedBookable(client);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlineBookingEnabled: false },
    });
    await client.coupon.create({
      data: {
        id: "welcome-coupon",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        allBranches: true,
        maxRedemptionsPerPhone: 1,
      },
    });
    await client.serviceOffering.create({
      data: {
        id: "breakfast",
        branchId: TEST_BRANCH_ID,
        kind: "BREAKFAST",
        active: true,
        priceUnit: "PER_PERSON_PER_NIGHT",
        priceMinor: 1000,
      },
    });
    const payload = {
      ...staffBody(room.id),
      lines: [
        { roomTypeId: room.id, occupancy },
        { roomTypeId: room.id, occupancy },
      ],
      couponCode: "welcome",
      services: ["BREAKFAST"],
      sendConfirmation: true,
    };
    const response = await send(create, base, payload);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = StaffReservationDetail.parse(await response.json());
    expect(response.headers.get("location")).toBe(`${base}/${created.id}`);
    expect(created).toMatchObject({
      status: "CONFIRMED",
      source: "STAFF",
      paymentMethod: "PAY_AT_HOTEL",
      price: {
        accommodationMinor: 60_000,
        servicesMinor: 12_000,
        discountMinor: 7200,
        vatMinor: 9720,
        totalMinor: 74_520,
      },
    });
    expect(created.lines).toHaveLength(2);
    expect(created.allowedActions).toContain("MODIFY_STAY");
    const replay = await send(create, base, payload);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      id: created.id,
      reference: created.reference,
    });
    expect(
      await problemCode(
        await send(create, base, { ...payload, notes: "changed" }),
      ),
    ).toBe("IDEMPOTENCY_KEY_REUSED");
    const persisted = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        guest: true,
        redemption: true,
        notifications: true,
      },
    });
    expect(persisted.guest?.phoneVerifiedAt).toBeNull();
    expect(persisted.redemption?.phone).toBe(guest.phone);
    expect(persisted.manageTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      persisted.notifications.map((message) => message.channel).sort(),
    ).toEqual(["EMAIL", "WHATSAPP"]);
    const outbox = JSON.stringify(persisted.notifications);
    expect(outbox).toContain("/reservations/manage#t=");
    expect(JSON.stringify(created)).not.toContain("manageToken");
    expect(await client.auditEvent.count()).toBe(1);
  });

  it("authorizes nightly override and recalculates the full price with current VAT", async () => {
    const room = await seedBookable(client);
    await client.roomBaseRate.deleteMany();
    const payload = {
      ...staffBody(room.id),
      priceOverride: { lines: [{ nights }], reason: "Approved group rate" },
    };
    const refused = await send(create, base, payload, undefined, "reception");
    expect(refused.status).toBe(403);
    expect(await client.guest.count()).toBe(0);
    const accepted = await send(create, base, payload);
    expect(accepted.status).toBe(201);
    const stored = StaffReservationDetail.parse(await accepted.json());
    expect(stored.price?.totalMinor).toBe(6900);
    expect(
      stored.lines[0]?.nights.every((night) => night.source === "MANUAL"),
    ).toBe(true);
    expect(await client.auditEvent.findFirst()).toMatchObject({
      reason: "Approved group rate",
      changes: { priceOverridden: true, totalMinor: 6900 },
    });
    expect(await client.notificationOutbox.count()).toBe(0);
  });

  it("records priced and unpriced S4 bookings and rejects partial, duplicate, and sold-out attempts", async () => {
    const room = await seedBookable(client);
    const payload = externalBody(room.id);
    const partial = await send(record, externalPath, {
      ...payload,
      lines: [
        {
          roomTypeId: room.id,
          occupancy,
          amounts: { nights: nights.slice(1) },
        },
      ],
    });
    expect(partial.status).toBe(422);
    expect(await client.guest.count()).toBe(0);
    const unpriced = await send(record, externalPath, payload);
    expect(unpriced.status).toBe(201);
    const unpricedBody = StaffReservationDetail.parse(await unpriced.json());
    expect(unpricedBody).toMatchObject({
      source: "EXTERNAL",
      externalChannel: "Fictional partner",
      price: null,
      pmsEnteredAt: null,
    });
    expect(unpricedBody.lines[0]?.nights).toHaveLength(3);
    expect(
      unpricedBody.lines[0]?.nights.every((night) => night.amount === null),
    ).toBe(true);
    expect((await send(record, externalPath, payload)).status).toBe(200);
    const duplicate = await send(
      record,
      externalPath,
      payload,
      "different-booking-key",
    );
    expect(duplicate.status).toBe(409);
    expect(await problemCode(duplicate)).toBe("EXTERNAL_REFERENCE_EXISTS");
    const priced = await send(
      record,
      externalPath,
      {
        ...payload,
        externalReference: "EXTERNAL-102",
        lines: [{ roomTypeId: room.id, occupancy, amounts: { nights } }],
      },
      "priced-external-key",
    );
    expect(priced.status).toBe(201);
    expect(
      StaffReservationDetail.parse(await priced.json()).price?.totalMinor,
    ).toBe(6900);
    const conflict = await send(
      record,
      externalPath,
      {
        ...payload,
        externalReference: "EXTERNAL-103",
        guest: { ...guest, phone: phoneOf(2) },
      },
      "conflict-external-key",
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: "INVENTORY_UNAVAILABLE",
      detail: expect.stringContaining("hotel system"),
    });
    expect(await client.guest.count()).toBe(1);
    expect(await client.auditEvent.count()).toBe(2);
    expect(await client.notificationOutbox.count()).toBe(0);
  });

  it("accepts 366 nights and rejects 367 before writing for both staff creation routes", async () => {
    const room = await seedBookable(client);
    const allowed = { checkIn: "2031-01-01", checkOut: "2032-01-02" };
    const rejected = { ...allowed, checkOut: "2032-01-03" };
    for (const [handler, path, body] of [
      [create, base, staffBody(room.id)],
      [record, externalPath, externalBody(room.id)],
    ] as const) {
      const refused = await send(handler, path, { ...body, stay: rejected });
      expect(refused.status).toBe(422);
      expect(await refused.json()).toMatchObject({
        code: "VALIDATION",
        fieldErrors: { "stay.checkOut": ["Use a stay of at most 366 nights."] },
      });
    }
    expect(await client.guest.count()).toBe(0);
    expect(await client.reservation.count()).toBe(0);
    for (const [handler, path, body] of [
      [create, base, staffBody(room.id)],
      [record, externalPath, externalBody(room.id)],
    ] as const) {
      const accepted = await send(handler, path, { ...body, stay: allowed });
      expect(accepted.status).toBe(201);
      expect(
        StaffReservationDetail.parse(await accepted.json()).lines[0]?.nights,
      ).toHaveLength(366);
    }
  });

  it("uses branch today for staff creation and allows historical external reconciliation", async () => {
    const room = await seedBookable(client);
    const commands = staffReservationCommands({
      client,
      clock: { now: () => new Date("2031-04-10T22:01:00Z") },
    });
    const invalid = await commands.create.execute(
      admin,
      staffBody(room.id),
      "past-staff-key",
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { "stay.checkIn": expect.any(Array) },
      },
    });
    expect(await client.guest.count()).toBe(0);
    const historical = await commands.recordExternal.execute(
      admin,
      externalBody(room.id),
      "past-external-key",
    );
    expect(historical.ok).toBe(true);
    const sameDay = await commands.create.execute(
      admin,
      {
        ...staffBody(room.id),
        stay: { ...stay, checkIn: "2031-04-11" },
      },
      "same-day-staff-key",
    );
    expect(sameDay.ok).toBe(true);
  });

  it("accepts scoped operational listings regardless of their marketing publication status", async () => {
    const draft = await seedBookable(client);
    const archived = await seedBookable(client, { slug: "archived" });
    await client.room.update({
      where: { id: draft.id },
      data: { status: "DRAFT" },
    });
    await client.room.update({
      where: { id: archived.id },
      data: { status: "ARCHIVED" },
    });
    const roomIds = [draft.id, archived.id];
    const lines = roomIds.map((roomTypeId) => ({ roomTypeId, occupancy }));
    const staff = await send(create, base, { ...staffBody(draft.id), lines });
    expect(staff.status).toBe(201);
    const external = await send(record, externalPath, {
      ...externalBody(draft.id),
      lines,
    });
    expect(external.status).toBe(201);
    await seedBranch(client, { id: otherBranch, slug: "other" });
    const foreign = await seedBookable(client, {
      branchId: otherBranch,
      slug: "other-garden",
    });
    expect(
      (
        await send(
          record,
          externalPath,
          externalBody(foreign.id),
          "foreign-listing-key",
        )
      ).status,
    ).toBe(404);
    expect(await client.reservation.count()).toBe(2);
  });

  it("projects only approved website audit fields and removes unknown action changes", async () => {
    await seedBookable(client);
    const token = await issueToken(client, guest.phone);
    const result = await websiteBooking(client).execute(
      bookingBody(guest.phone, token),
      "website-history-key",
    );
    expect(result.ok).toBe(true);
    const row = await client.reservation.findFirstOrThrow();
    await client.auditEvent.updateMany({
      where: { entityId: row.id },
      data: {
        reason: guest.email,
        changes: {
          totalMinor: 34500,
          units: 1,
          couponCode: "PRIVATE_PROMO",
          marketingOptIn: true,
          guestName: guest.fullName,
          token,
        },
      },
    });
    await client.auditEvent.create({
      data: {
        id: "other-history-event",
        branchId: TEST_BRANCH_ID,
        entityId: row.id,
        action: "reservation.other",
        actorType: "STAFF",
        actorId: admin.id,
        entityType: "Reservation",
        reason: guest.phone,
        changes: { arbitrary: guest.fullName },
      },
    });
    const response = await read(
      history,
      base + "/" + row.id + "/history",
      "reception",
      row.id,
    );
    const trail = StaffReservationHistory.parse(await response.json());
    expect(trail.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reservation.created",
          staffActorId: null,
          changes: { totalMinor: 34500, units: 1 },
        }),
        expect.objectContaining({
          action: "reservation.other",
          staffActorId: admin.id,
          changes: {},
        }),
      ]),
    );
    for (const hidden of [
      ...Object.values(guest),
      token,
      "PRIVATE_PROMO",
      "marketingOptIn",
    ])
      expect(JSON.stringify(trail)).not.toContain(hidden);
  });

  it("excludes guest contact and search data when guest access is absent", async () => {
    const room = await seedBookable(client);
    await client.serviceOffering.create({
      data: {
        id: "airport-service",
        branchId: TEST_BRANCH_ID,
        kind: "AIRPORT_TRANSFER",
        active: true,
        priceUnit: "PER_BOOKING",
        priceMinor: 1000,
        maxVehicles: 3,
      },
    });
    const payload = {
      ...staffBody(room.id),
      notes: "Hidden staff note",
      services: [{ kind: "AIRPORT_TRANSFER", details: "Hidden flight detail" }],
    };
    const created = StaffReservationDetail.parse(
      await (await send(create, base, payload)).json(),
    );
    const query = { page: 1, pageSize: 25, sort: "-createdAt" } as const;
    const reader = new PrismaStaffReservationReader(client);
    for (const q of Object.values(guest))
      expect(
        (await reader.list([TEST_BRANCH_ID], { ...query, q }, false)).total,
      ).toBe(0);
    expect(
      (
        await reader.list(
          [TEST_BRANCH_ID],
          { ...query, q: created.reference },
          false,
        )
      ).items,
    ).toMatchObject([{ id: created.id, guestName: null }]);
    const roleHasCapability = staffCapabilities.roleHasCapability;
    const mock = vi
      .spyOn(staffCapabilities, "roleHasCapability")
      .mockImplementation(
        (role, capability) =>
          capability !== "guests:read" && roleHasCapability(role, capability),
      );
    try {
      const response = await read(
        detail,
        base + "/" + created.id,
        "reception",
        created.id,
      );
      expect(response.status).toBe(200);
      const view = StaffReservationDetail.parse(await response.json());
      expect(view).toMatchObject({
        guest: null,
        internalNotes: null,
        price: { services: [{ details: null }] },
      });
    } finally {
      mock.mockRestore();
    }
  });

  it("S2 shows how a website booking was verified and the proven email only with guests:read (M9-T12b)", async () => {
    const room = await seedBookable(client, { units: 4 });
    const website = async (phone: string, key: string, email?: string) => {
      // A booking verified by email is paid online (Q-100).
      if (email)
        return (await bookByEmailOnline(client, { phone, email, key })).row.id;
      const created = await websiteBooking(client).execute(
        bookingBody(phone, await issueToken(client, phone)),
        key,
      );
      if (!created.ok) throw new Error(JSON.stringify(created.error));
      return (
        await client.reservation.findUniqueOrThrow({
          where: { reference: created.value.reference },
        })
      ).id;
    };
    const whatsApp = await website(phoneOf(31), "verified-whatsapp");
    const byEmail = await website(
      phoneOf(32),
      "verified-email",
      "amina@example.test",
    );
    // Written during a deploy by a release that knew only WhatsApp.
    const legacy = await website(phoneOf(33), "verified-legacy");
    await client.reservation.update({
      where: { id: legacy },
      data: { verificationChannel: null },
    });
    const desk = StaffReservationDetail.parse(
      await (await send(create, base, staffBody(room.id))).json(),
    );
    const view = async (id: string, staff = "admin") =>
      StaffReservationDetail.parse(
        await (await read(detail, `${base}/${id}`, staff, id)).json(),
      );
    expect(await view(whatsApp)).toMatchObject({
      verificationChannel: "WHATSAPP",
      verifiedEmail: null,
    });
    expect(await view(byEmail)).toMatchObject({
      verificationChannel: "EMAIL",
      verifiedEmail: "amina@example.test",
    });
    expect(await view(legacy)).toMatchObject({
      verificationChannel: "WHATSAPP",
    });
    expect(await view(desk.id)).toMatchObject({
      verificationChannel: null,
      verifiedEmail: null,
    });
    const roleHasCapability = staffCapabilities.roleHasCapability;
    const mock = vi
      .spyOn(staffCapabilities, "roleHasCapability")
      .mockImplementation(
        (role, capability) =>
          capability !== "guests:read" && roleHasCapability(role, capability),
      );
    try {
      expect(await view(byEmail, "reception")).toMatchObject({
        verificationChannel: "EMAIL",
        verifiedEmail: null,
        guest: null,
      });
    } finally {
      mock.mockRestore();
    }
  });

  it("reads S1, S2 and S15 with half-open filters, version and branch privacy", async () => {
    const room = await seedBookable(client);
    await seedBranch(client, { id: otherBranch, slug: "other" });
    const otherRoom = await seedBookable(client, {
      branchId: otherBranch,
      slug: "other-garden",
    });
    const payload = {
      ...staffBody(room.id),
      notes: "Note never included in audit",
    };
    const created = StaffReservationDetail.parse(
      await (await send(create, base, payload)).json(),
    );
    const external = StaffReservationDetail.parse(
      await (
        await send(
          record,
          externalPath,
          externalBody(otherRoom.id, otherBranch),
        )
      ).json(),
    );
    const found = await read(
      list,
      base +
        "?from=2031-04-12&to=2031-04-14&q=private%40example.test&pageSize=1&sort=checkIn",
      "reception",
    );
    expect(found.status).toBe(200);
    expect(StaffReservationList.parse(await found.json())).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      items: [{ id: created.id, guestName: guest.fullName }],
    });
    expect(
      StaffReservationList.parse(
        await (await read(list, base + "?from=2031-04-13")).json(),
      ).total,
    ).toBe(0);
    expect((await read(list, base + "?wat=1")).status).toBe(400);
    expect(
      (await read(list, base + "?branchId=" + otherBranch, "reception")).status,
    ).toBe(403);
    const item = await read(
      detail,
      base + "/" + created.id,
      "reception",
      created.id,
    );
    expect(item.headers.get("etag")).toBe('"v1"');
    expect(StaffReservationDetail.parse(await item.json())).toMatchObject({
      id: created.id,
      guest: { email: guest.email },
    });
    const response = await read(
      history,
      base + "/" + created.id + "/history",
      "reception",
      created.id,
    );
    const trail = StaffReservationHistory.parse(await response.json());
    expect(trail.items).toMatchObject([
      {
        action: "reservation.staff-created",
        staffActorId: admin.id,
        changes: { totalMinor: 34_500 },
      },
    ]);
    expect(JSON.stringify(trail)).not.toContain(guest.fullName);
    expect(JSON.stringify(trail)).not.toContain(payload.notes);
    for (const handler of [detail, history])
      expect(
        (
          await read(
            handler,
            base + "/" + external.id,
            "reception",
            external.id,
          )
        ).status,
      ).toBe(404);
  });

  it("refuses untrusted requests and omits request data from logs and errors", async () => {
    const room = await seedBookable(client);
    const logs = (["info", "warn", "error"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    try {
      const payload = staffBody(room.id);
      expect((await send(create, base, payload, null)).status).toBe(400);
      expect((await send(create, base, payload, "short")).status).toBe(422);
      expect(
        (await send(create, base, { ...payload, totalMinor: 1 })).status,
      ).toBe(422);
      expect(
        (
          await send(
            create,
            base,
            payload,
            undefined,
            "admin",
            "https://cross.example",
          )
        ).status,
      ).toBe(403);
      expect(
        (await send(create, base, payload, undefined, "foreign")).status,
      ).toBe(403);
      const unknown = await send(create, base, {
        ...payload,
        branchId: guest.email,
      });
      expect(unknown.status).toBe(404);
      expect(JSON.stringify(await unknown.json())).not.toContain(guest.email);
      expect(await client.reservation.count()).toBe(0);
      expect(
        (await read(list, base + "?q=" + encodeURIComponent(guest.email)))
          .status,
      ).toBe(200);
      const external = StaffReservationDetail.parse(
        await (await send(record, externalPath, externalBody(room.id))).json(),
      );
      expect(
        (await read(detail, base + "/" + external.id, "reception", external.id))
          .status,
      ).toBe(200);
      await client.$executeRaw`ALTER TABLE "AuditEvent" ADD CONSTRAINT "test_reject_staff_creation" CHECK (action <> 'reservation.staff-created') NOT VALID`;
      try {
        const failed = await send(create, base, {
          ...payload,
          sendConfirmation: true,
        });
        expect(failed.status).toBe(500);
        for (const value of Object.values(guest))
          expect(JSON.stringify(await failed.clone().json())).not.toContain(
            value,
          );
      } finally {
        await client.$executeRaw`ALTER TABLE "AuditEvent" DROP CONSTRAINT "test_reject_staff_creation"`;
      }
      expect(logs[2]?.mock.calls).toHaveLength(1);
      for (const value of Object.values(guest))
        expect(
          JSON.stringify(logs.flatMap((log) => log.mock.calls)),
        ).not.toContain(value);
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  it("rolls back the guest, reservation, rooms and outbox if audit insertion fails", async () => {
    const room = await seedBookable(client);
    // The real transaction is forced to fail at the final write.
    await client.$executeRaw`ALTER TABLE "AuditEvent" ADD CONSTRAINT "test_reject_staff_creation" CHECK (action <> 'reservation.staff-created')`;
    try {
      const create = staffReservationCommands({ client }).create;
      await expect(
        create.execute(
          admin,
          { ...staffBody(room.id), sendConfirmation: true },
          "rollback-staff-key",
        ),
      ).rejects.toThrow();
      expect(await client.reservation.count()).toBe(0);
      expect(await client.reservationRoom.count()).toBe(0);
      expect(await client.notificationOutbox.count()).toBe(0);
      expect(await client.guest.count()).toBe(0);
    } finally {
      await client.$executeRaw`ALTER TABLE "AuditEvent" DROP CONSTRAINT "test_reject_staff_creation"`;
    }
  });
});

describe("staff reservation PostgreSQL concurrency", () => {
  it.each(["external", "staff"] as const)(
    "%s against website for one unit, 20 rounds",
    async (source) => {
      for (let round = 0; round < 20; round++) {
        await resetDatabase(client);
        await createActor(client);
        const room = await seedBookable(client, { units: 1 });
        const phone = source === "staff" ? guest.phone : phoneOf(3);
        const token = await issueToken(client, phone);
        if (source === "staff") {
          await client.guest.create({
            data: {
              id: "locked-guest",
              phone,
              name: guest.fullName,
              email: guest.email,
            },
          });
        }
        await withIndependentClients(
          3,
          async ([locker, writer, publicWriter]) => {
            const locked = deferred();
            const release = deferred();
            const hold = locker!.$transaction(async (tx) => {
              if (source === "external")
                await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;
              else
                await tx.$queryRaw`SELECT id FROM "Guest" WHERE phone = ${phone} FOR UPDATE`;
              locked.resolve();
              await release.promise;
            });
            await locked.promise;
            const commands = staffReservationCommands({
              client: writer!,
              clock: { now: () => NOW },
            });
            const staff =
              source === "external"
                ? commands.recordExternal.execute(
                    admin,
                    externalBody(room.id),
                    "race-external",
                  )
                : commands.create.execute(
                    admin,
                    staffBody(room.id),
                    "race-staff",
                  );
            const website = websiteBooking(publicWriter!).execute(
              bookingBody(phone, token),
              "race-website",
            );
            try {
              await waitForLockWaiters(client, 2);
            } finally {
              release.resolve();
              await hold;
            }
            const results = await Promise.all([staff, website]);
            expect(results.filter((result) => result.ok)).toHaveLength(1);
            expect(results.find((result) => !result.ok)).toMatchObject({
              error: { code: "INVENTORY_UNAVAILABLE" },
            });
            expect(
              await client.reservationRoom.count({
                where: { consumesInventory: true },
              }),
            ).toBe(1);
            expect(await client.auditEvent.count()).toBe(1);
          },
        );
      }
    },
  );

  it("replays parallel staff creates and rejects a competing body with the same key, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client);
      await seedBranch(client, { id: otherBranch, slug: "other" });
      const roomB = await seedBookable(client, {
        branchId: otherBranch,
        slug: "other-garden",
      });
      const starting = staffBody(room.id);
      await withIndependentClients(
        4,
        async ([locker, first, same, different]) => {
          const locked = deferred();
          const release = deferred();
          const hold = locker!.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Room" WHERE id IN (${room.id}, ${roomB.id}) ORDER BY id FOR UPDATE`;
            locked.resolve();
            await release.promise;
          });
          await locked.promise;
          const make = (connection: typeof client) =>
            staffReservationCommands({ client: connection }).create;
          const key = "same-staff-key";
          const attempts = [
            make(first!).execute(admin, starting, key),
            make(same!).execute(admin, starting, key),
            make(different!).execute(
              admin,
              {
                ...staffBody(roomB.id, otherBranch),
                guest: { ...guest, phone: phoneOf(4) },
              },
              key,
            ),
          ];
          try {
            await waitForLockWaiters(client, 3);
          } finally {
            release.resolve();
            await hold;
          }
          const outcomes = await Promise.all(attempts);
          const winners = outcomes.filter((item) => item.ok);
          const reservations = await client.reservation.findMany();
          expect(reservations).toHaveLength(1);
          expect(await client.guest.count()).toBe(1);
          expect(await client.auditEvent.count()).toBe(1);
          expect(winners.filter((item) => !item.value.replayed)).toHaveLength(
            1,
          );
          for (const item of winners)
            expect(item.value.reservation.id).toBe(reservations[0]?.id);
          for (const item of outcomes.filter((item) => !item.ok))
            expect(item.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
          if (reservations[0]?.branchId === TEST_BRANCH_ID)
            expect(winners).toHaveLength(2);
          else expect(winners).toHaveLength(1);
        },
      );
    }
  });

  it("maps the concurrent external reference unique violation, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      const first = await seedBookable(client);
      const second = await seedBookable(client, { slug: "second-listing" });
      await withIndependentClients(3, async ([locker, a, b]) => {
        const held = deferred();
        const release = deferred();
        // SHARE permits both prechecks to read but holds both inserts until
        // they have passed the precheck on separate room-type locks.
        const hold = locker!.$transaction(async (tx) => {
          await tx.$executeRaw`LOCK TABLE "Reservation" IN SHARE MODE`;
          held.resolve();
          await release.promise;
        });
        await held.promise;
        const results = [
          staffReservationCommands({ client: a! }).recordExternal.execute(
            admin,
            externalBody(first.id),
            "first-key",
          ),
          staffReservationCommands({ client: b! }).recordExternal.execute(
            admin,
            {
              ...externalBody(second.id),
              guest: { ...guest, phone: phoneOf(2) },
            },
            "second-key",
          ),
        ];
        try {
          await waitForLockWaiters(client, 2);
        } finally {
          release.resolve();
          await hold;
        }
        const settled = await Promise.all(results);
        expect(settled.filter((result) => result.ok)).toHaveLength(1);
        expect(settled.find((result) => !result.ok)).toMatchObject({
          error: { code: "EXTERNAL_REFERENCE_EXISTS" },
        });
        expect(await client.reservation.count()).toBe(1);
        expect(await client.reservationRoom.count()).toBe(1);
        expect(await client.guest.count()).toBe(1);
        expect(await client.auditEvent.count()).toBe(1);
      });
    }
  });

  it("C-8 creates in branch B while sold-out branch A is locked, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      await seedBranch(client, { id: otherBranch, slug: "other" });
      const roomA = await seedBookable(client, { units: 1 });
      const roomB = await seedBookable(client, {
        units: 1,
        branchId: otherBranch,
        slug: "other-garden",
      });
      await client.room.update({
        where: { id: roomB.id },
        data: { name: roomA.name },
      });
      const commands = staffReservationCommands({ client });
      expect(
        (
          await commands.recordExternal.execute(
            admin,
            externalBody(roomA.id),
            "seed-branch-a",
          )
        ).ok,
      ).toBe(true);

      await withIndependentClients(2, async ([locker, writer]) => {
        const locked = deferred();
        const release = deferred();
        const hold = locker!.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomA.id} FOR UPDATE`;
          locked.resolve();
          await release.promise;
        });
        await locked.promise;
        const a = commands.create.execute(
          admin,
          { ...staffBody(roomA.id), guest: { ...guest, phone: phoneOf(3) } },
          "branch-a-conflict",
        );
        try {
          await waitForLockWaiters(client, 1);
          const b = await staffReservationCommands({
            client: writer!,
          }).recordExternal.execute(
            admin,
            externalBody(roomB.id, otherBranch),
            "branch-b-write",
          );
          expect(b).toMatchObject({
            ok: true,
            value: {
              reservation: {
                branchId: otherBranch,
                externalReference: "EXTERNAL-101",
              },
            },
          });
        } finally {
          release.resolve();
          await hold;
        }
        expect(await a).toMatchObject({
          ok: false,
          error: { code: "INVENTORY_UNAVAILABLE" },
        });
        for (const branchId of [TEST_BRANCH_ID, otherBranch])
          expect(
            await client.reservationRoom.count({
              where: { branchId, consumesInventory: true },
            }),
          ).toBe(1);
        expect(await client.auditEvent.count()).toBe(2);
      });
    }
  });
});
