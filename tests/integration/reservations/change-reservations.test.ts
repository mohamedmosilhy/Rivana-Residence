import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth";
import {
  ModifyReservation,
  type ModifyReservationContext,
  type ModifyReservationInput,
  type ReservationRepository,
} from "@/application/reservations";
import {
  cancelReservationContext,
  modifyReservationContext,
  staffReservationCommands,
  staffReservationQueries,
} from "@/composition/reservations";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  CancelReservation,
  type CancelReservationContext,
} from "@/application/reservations";
import { PrismaCouponRedemptionStore } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaStaffReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/staff-reservation-reader";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { blockUseCase } from "./support/blocks";
import { deferred, withIndependentClients } from "./support/concurrency";
import {
  NOW,
  pausedAudit,
  phoneOf,
  seedBookable,
  waitForLockWaiters,
} from "./support/website-booking";

const principals = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    principals.get(headers.get("x-test-staff") ?? "") ?? null,
  throttleKeys: () => new HmacThrottleKeys("test-change-hmac"),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
const { PUT: stayRoute } = await import(
  "@/app/api/v1/staff/reservations/[id]/stay/route"
);
const { POST: cancelRoute } = await import(
  "@/app/api/v1/staff/reservations/[id]/cancellation/route"
);
const { POST: pmsRoute } = await import(
  "@/app/api/v1/staff/reservations/[id]/pms-update/route"
);

const client = createTestClient();
const origin = process.env.APP_URL ?? "http://localhost:3000";
const clock = { now: () => NOW };
const occupancy = { adults: 2, children: 0 };
const admin = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff-session",
} as const;
const stay = { checkIn: "2031-04-10", checkOut: "2031-04-13" };
const longer = { checkIn: "2031-04-10", checkOut: "2031-04-14" };
const money = (amountMinor: number) =>
  ({ amountMinor, currency: "USD" }) as const;

let counter = 0;
async function book(
  roomTypeId: string,
  options: Readonly<{
    stay?: typeof stay;
    units?: number;
    phone?: number;
    couponCode?: string;
    notify?: boolean;
    services?: ModifyReservationInput["services"];
    email?: boolean;
  }> = {},
) {
  counter += 1;
  const created = await staffReservationCommands({
    client,
    clock,
  }).create.execute(
    admin,
    {
      branchId: TEST_BRANCH_ID,
      stay: options.stay ?? stay,
      lines: Array.from({ length: options.units ?? 1 }, () => ({
        roomTypeId,
        occupancy,
      })),
      guest: {
        fullName: "Private Guest",
        phone: phoneOf(options.phone ?? counter),
        ...(options.email === false ? {} : { email: "private@example.test" }),
      },
      ...(options.couponCode ? { couponCode: options.couponCode } : {}),
      ...(options.services ? { services: options.services } : {}),
      sendConfirmation: options.notify ?? false,
    },
    `change-test-key-${counter}`,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value.reservation;
}

const modifyBody = (
  roomTypeId: string,
  total: number,
  extra: Partial<ModifyReservationInput> = {},
): ModifyReservationInput => ({
  stay: longer,
  lines: [{ roomTypeId, occupancy }],
  acceptedTotal: money(total),
  ...extra,
});
const commands = () => staffReservationCommands({ client, clock });
// 3 nights at 100.00 + 15% VAT; a fourth night re-priced at 120.00 adds 138.00.
const FOUR_NIGHTS = 34_500 + 13_800;

const headers = (staff: string, version?: number) => ({
  origin,
  "content-type": "application/json",
  "x-test-staff": staff,
  ...(version === undefined ? {} : { "if-match": `"v${version}"` }),
});
const call = (
  handler: typeof stayRoute,
  id: string,
  method: "PUT" | "POST",
  body: unknown,
  staff = "admin",
  version?: number,
) =>
  handler(
    new Request(new URL(`/api/v1/staff/reservations/${id}/x`, origin), {
      method,
      body: JSON.stringify(body),
      headers: headers(staff, version),
    }),
    { params: Promise.resolve({ id }) },
  );

/** The production modify use case with hooks around the transaction's adapters. */
function modifier(
  db: PrismaClient,
  hooks: Readonly<{
    audit?: (inner: AuditLog) => AuditLog;
    reservations?: (inner: ReservationRepository) => ReservationRepository;
    enqueue?: () => Promise<void>;
    forbidAccommodationReads?: boolean;
  }> = {},
) {
  return new ModifyReservation({
    // The production context, with one adapter wrapped to inject a failure.
    unitOfWork: new PrismaReservationUnitOfWork<ModifyReservationContext>(
      db,
      (transaction) => {
        const context = modifyReservationContext(transaction);
        if (hooks.forbidAccommodationReads) {
          vi.spyOn(context.inventoryReader, "readNights").mockRejectedValue(
            new Error("A service-only change read inventory."),
          );
          vi.spyOn(context.rates, "readMany").mockRejectedValue(
            new Error("A service-only change read nightly rates."),
          );
        }
        return {
          ...context,
          reservations: hooks.reservations
            ? hooks.reservations(context.reservations)
            : context.reservations,
          audit: hooks.audit ? hooks.audit(context.audit) : context.audit,
          messages: hooks.enqueue
            ? {
                enqueue: async (...args) => {
                  await context.messages.enqueue(...args);
                  await hooks.enqueue!();
                },
              }
            : context.messages,
        };
      },
    ),
    reads: new PrismaStaffReservationReader(db),
    ids: new Cuid2IdGenerator(),
    clock,
  });
}

const state = async (id: string) => ({
  reservation: await client.reservation.findUniqueOrThrow({ where: { id } }),
  changes: await client.reservationChange.count(),
  audits: await client.auditEvent.count({
    where: { action: "reservation.stay-modified" },
  }),
  outbox: await client.notificationOutbox.count(),
});

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
    branchIds: ["other-branch"],
  });
});
afterAll(() => client.$disconnect());

describe("ModifyReservation (S6)", () => {
  it("re-prices only the new night, keeps the rest, and writes history and audit together (T-CHG-1…3)", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await client.roomBaseRate.update({
      where: { roomTypeId: room.id },
      data: { amountMinor: 12_000 },
    });
    const result = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, FOUR_NIGHTS),
    );
    expect(result.ok).toBe(true);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        rooms: { include: { nights: { orderBy: { night: "asc" } } } },
      },
    });
    expect(row).toMatchObject({
      version: created.version + 1,
      changeSeq: 1,
      totalMinor: FOUR_NIGHTS,
      pmsUpdatePendingSince: null,
    });
    expect(row.rooms[0]?.nights.map((night) => night.amountMinor)).toEqual([
      10_000, 10_000, 10_000, 12_000,
    ]);
    const change = await client.reservationChange.findFirstOrThrow();
    expect(change).toMatchObject({
      seq: 1,
      kind: "STAY",
      actorId: admin.id,
      oldTotalMinor: 34_500,
      newTotalMinor: FOUR_NIGHTS,
      overrideReason: null,
    });
    expect(JSON.stringify([change.before, change.after])).not.toContain(
      "Private Guest",
    );
    expect(
      await client.auditEvent.count({
        where: { action: "reservation.stay-modified", entityId: created.id },
      }),
    ).toBe(1);
    // A pure shortening keeps every stored amount.
    const shorter = await commands().modify.execute(
      admin,
      created.id,
      row.version,
      { ...modifyBody(room.id, 34_500), stay },
    );
    expect(shorter.ok).toBe(true);
    expect(
      (
        await client.reservationNight.findMany({ orderBy: { night: "asc" } })
      ).map((night) => night.amountMinor),
    ).toEqual([10_000, 10_000, 10_000]);
  });

  it("refuses a wrong accepted total, a stale version, a missing If-Match, an unavailable service, and a no-op", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const before = await state(created.id);
    const wrong = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 1),
    );
    expect(wrong).toMatchObject({
      ok: false,
      error: {
        code: "PRICE_CHANGED",
        context: { quote: { totalMinor: 46_000 } },
      },
    });
    expect(
      await commands().modify.execute(
        admin,
        created.id,
        99,
        modifyBody(room.id, 46_000),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "STALE_VERSION",
        context: { currentVersion: created.version },
      },
    });
    expect(
      await commands().modify.execute(admin, created.id, created.version, {
        ...modifyBody(room.id, 46_000),
        services: ["BREAKFAST"],
      }),
    ).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(
      await commands().modify.execute(admin, created.id, created.version, {
        ...modifyBody(room.id, 34_500),
        stay,
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await commands().modify.execute(
        admin,
        created.id,
        null,
        modifyBody(room.id, 46_000),
      ),
    ).toMatchObject({ ok: false, error: { code: "PRECONDITION_REQUIRED" } });
    expect(await state(created.id)).toEqual(before);
    const missing = await call(
      stayRoute,
      created.id,
      "PUT",
      modifyBody(room.id, 46_000),
    );
    expect(missing.status).toBe(428);
    const stale = await call(
      stayRoute,
      created.id,
      "PUT",
      modifyBody(room.id, 46_000),
      "admin",
      7,
    );
    expect(stale.status).toBe(412);
    const hidden = await call(
      stayRoute,
      created.id,
      "PUT",
      modifyBody(room.id, 46_000),
      "foreign",
      created.version,
    );
    expect(hidden.status).toBe(404);
  });

  it("rolls everything back when the change row, the audit event, or the outbox write fails (safeguard 3)", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id, { notify: false });
    const before = await state(created.id);
    const body = modifyBody(room.id, 46_000, { notifyGuest: true });
    const failures = {
      audit: modifier(client, {
        audit: (inner) => ({
          append: async (event) => {
            await inner.append(event);
            throw new Error("audit down");
          },
        }),
      }),
      change: modifier(client, {
        reservations: (inner) =>
          new Proxy(inner, {
            get: (target, key) =>
              key === "appendChange"
                ? async () => {
                    throw new Error("history down");
                  }
                : (target as never)[key],
          }),
      }),
      outbox: modifier(client, {
        enqueue: async () => {
          throw new Error("outbox down");
        },
      }),
    };
    for (const useCase of Object.values(failures)) {
      await expect(
        useCase.execute(admin, created.id, created.version, body),
      ).rejects.toThrow(/down/);
      expect(await state(created.id)).toEqual(before);
      expect(await client.reservationNight.count()).toBe(3);
    }
    // And the same request commits all four writes when nothing fails.
    const ok = await modifier(client).execute(
      admin,
      created.id,
      created.version,
      body,
    );
    expect(ok.ok).toBe(true);
    const after = await state(created.id);
    expect([after.changes, after.audits]).toEqual([1, 1]);
    expect(after.outbox).toBeGreaterThan(0);
  });

  it("records the original and overridden totals, the actor and the reason, and needs the capability (safeguard 5)", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const nights = ["2031-04-10", "2031-04-11", "2031-04-12", "2031-04-13"].map(
      (night) => ({ night, amountMinor: 9000 }),
    );
    const override = { lines: [{ nights }], reason: "Loyal guest rate" };
    const refused = await commands().modify.execute(
      { ...admin, role: "RECEPTIONIST", branchIds: [TEST_BRANCH_ID] },
      created.id,
      created.version,
      modifyBody(room.id, 41_400, { priceOverride: override }),
    );
    expect(refused).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const blank = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 41_400, {
        priceOverride: { ...override, reason: "   " },
      }),
    );
    expect(blank).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await client.reservationChange.count()).toBe(0);
    const done = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 41_400, { priceOverride: override }),
    );
    expect(done.ok).toBe(true);
    expect(await client.reservationChange.findFirstOrThrow()).toMatchObject({
      actorId: admin.id,
      overrideFromMinor: 46_000,
      overrideToMinor: 41_400,
      overrideReason: "Loyal guest rate",
    });
    expect(
      await client.auditEvent.findFirstOrThrow({
        where: { action: "reservation.stay-modified" },
      }),
    ).toMatchObject({
      actorId: admin.id,
      reason: "Loyal guest rate",
      changes: {
        priceOverridden: true,
        overrideFromMinor: 46_000,
        overrideToMinor: 41_400,
      },
    });
  });

  it("flags a hotel-system update after entry and clears it only for the latest change (safeguard 4)", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await client.reservation.update({
      where: { id: created.id },
      data: {
        source: "WEBSITE",
        createdById: null,
        pmsEnteredAt: NOW,
        pmsEnteredById: admin.id,
      },
    });
    const first = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(first.ok).toBe(true);
    const second = await commands().modify.execute(
      admin,
      created.id,
      created.version + 1,
      { ...modifyBody(room.id, 34_500), stay },
    );
    expect(second.ok).toBe(true);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.changeSeq).toBe(2);
    expect(row.pmsUpdatePendingSince).not.toBeNull();
    const ack = (changeSeq: number, version = row.version) =>
      call(pmsRoute, created.id, "POST", { changeSeq }, "admin", version);
    const stale = await ack(1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "PMS_UPDATE_STALE",
      context: { currentChangeSeq: 2 },
    });
    expect(
      (
        await client.reservation.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).pmsUpdatePendingSince,
    ).not.toBeNull();
    expect((await ack(2, 1)).status).toBe(412);
    expect((await ack(2)).status).toBe(200);
    const cleared = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(cleared.pmsUpdatePendingSince).toBeNull();
    expect(
      await client.auditEvent.count({
        where: { action: "reservation.pms-update-entered" },
      }),
    ).toBe(1);
    const again = await ack(2, cleared.version);
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("NO_PMS_UPDATE_PENDING");
    expect(
      (
        await call(
          pmsRoute,
          created.id,
          "POST",
          { changeSeq: 2 },
          "reception",
          cleared.version,
        )
      ).status,
    ).toBe(409);
  });

  it("moves a unit onto a night that is sold out for the other guests only when free (own units do not count)", async () => {
    const room = await seedBookable(client, { units: 1 });
    const created = await book(room.id);
    // The same single unit extends onto a free night: its own nights are not double counted.
    expect(
      (
        await commands().modify.execute(
          admin,
          created.id,
          created.version,
          modifyBody(room.id, 46_000),
        )
      ).ok,
    ).toBe(true);
    const other = await book(room.id, {
      stay: { checkIn: "2031-04-14", checkOut: "2031-04-15" },
    });
    const blocked = await commands().modify.execute(
      admin,
      other.id,
      other.version,
      {
        stay: { checkIn: "2031-04-13", checkOut: "2031-04-15" },
        lines: [{ roomTypeId: room.id, occupancy }],
        acceptedTotal: money(1),
      },
    );
    expect(blocked).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: "2031-04-13" },
      },
    });
  });
});

describe("CancelReservation (S9)", () => {
  const body = { reason: "GUEST_REQUEST", notifyGuest: true } as const;

  it("frees the units and the coupon redemption, audits once and notifies (AC-6)", async () => {
    const room = await seedBookable(client);
    await client.coupon.create({
      data: {
        id: "welcome-coupon",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        allBranches: true,
        maxRedemptions: 1,
      },
    });
    const created = await book(room.id, {
      couponCode: "welcome",
      notify: false,
    });
    const response = await call(
      cancelRoute,
      created.id,
      "POST",
      body,
      "admin",
      created.version,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "CANCELLED" });
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
      include: { rooms: true, redemption: true },
    });
    expect(row.rooms.every((line) => !line.consumesInventory)).toBe(true);
    expect(row.redemption?.releasedAt).not.toBeNull();
    expect(
      await client.auditEvent.count({
        where: { action: "reservation.cancelled" },
      }),
    ).toBe(1);
    expect(await client.notificationOutbox.count()).toBeGreaterThan(0);
    // The freed unit and the freed coupon can be booked again.
    const again = await book(room.id, { couponCode: "welcome" });
    expect(again.status).toBe("CONFIRMED");
  });

  it("is idempotent: a retry changes nothing and writes nothing", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    expect(
      (
        await call(
          cancelRoute,
          created.id,
          "POST",
          body,
          "admin",
          created.version,
        )
      ).status,
    ).toBe(200);
    const before = {
      row: await client.reservation.findUniqueOrThrow({
        where: { id: created.id },
      }),
      audits: await client.auditEvent.count(),
      outbox: await client.notificationOutbox.count(),
    };
    const retry = await call(
      cancelRoute,
      created.id,
      "POST",
      body,
      "admin",
      created.version,
    );
    expect(retry.status).toBe(200);
    expect({
      row: await client.reservation.findUniqueOrThrow({
        where: { id: created.id },
      }),
      audits: await client.auditEvent.count(),
      outbox: await client.notificationOutbox.count(),
    }).toEqual(before);
  });

  it("refuses stale versions, paid and foreign reservations, wrong roles, and writes nothing on a refusal", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    expect(
      (await call(cancelRoute, created.id, "POST", body, "admin", 9)).status,
    ).toBe(412);
    expect((await call(cancelRoute, created.id, "POST", body)).status).toBe(
      428,
    );
    expect(
      (
        await call(
          cancelRoute,
          created.id,
          "POST",
          body,
          "foreign",
          created.version,
        )
      ).status,
    ).toBe(404);
    await client.reservation.update({
      where: { id: created.id },
      data: { paymentStatus: "PAID" },
    });
    const paid = await call(
      cancelRoute,
      created.id,
      "POST",
      body,
      "admin",
      created.version,
    );
    expect(paid.status).toBe(409);
    expect(await paid.json()).toMatchObject({
      code: "INVALID_TRANSITION",
      context: { status: "CONFIRMED" },
    });
    expect(
      (
        await client.reservation.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    expect(
      await client.auditEvent.count({
        where: { action: "reservation.cancelled" },
      }),
    ).toBe(0);
  });
});

describe("C-10 and C-4: change races over 20 rounds", () => {
  it("parallel modify and cancel of one reservation end in one consistent state", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client);
      const created = await book(room.id);
      const [modified, cancelled] = await withIndependentClients(2, (clients) =>
        Promise.all([
          staffReservationCommands({
            client: clients[0]!,
            clock,
          }).modify.execute(
            admin,
            created.id,
            created.version,
            modifyBody(room.id, 46_000),
          ),
          staffReservationCommands({
            client: clients[1]!,
            clock,
          }).cancel.execute(admin, created.id, created.version, {
            reason: "OTHER",
            notifyGuest: false,
          }),
        ]),
      );
      const row = await client.reservation.findUniqueOrThrow({
        where: { id: created.id },
        include: { rooms: true },
      });
      // Exactly one version bump won; the other saw a stale version or a final status.
      expect([modified.ok, cancelled.ok].filter(Boolean)).toHaveLength(1);
      expect(row.version).toBe(created.version + 1);
      if (row.status === "CANCELLED")
        expect(row.rooms.every((line) => !line.consumesInventory)).toBe(true);
      else expect(row.changeSeq).toBe(1);
    }
  }, 120_000);

  it("two reservations moving onto the last unit's night: exactly one wins", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client, { units: 1 });
      const a = await book(room.id, {
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" },
      });
      const b = await book(room.id, {
        stay: { checkIn: "2031-04-12", checkOut: "2031-04-13" },
      });
      const move = (clientIndex: number, id: string, version: number) => ({
        id,
        version,
        clientIndex,
      });
      const target = { checkIn: "2031-04-20", checkOut: "2031-04-21" };
      const results = await withIndependentClients(2, (clients) =>
        Promise.all(
          [move(0, a.id, a.version), move(1, b.id, b.version)].map((item) =>
            staffReservationCommands({
              client: clients[item.clientIndex]!,
              clock,
            }).modify.execute(admin, item.id, item.version, {
              stay: target,
              lines: [{ roomTypeId: room.id, occupancy }],
              acceptedTotal: money(11_500),
            }),
          ),
        ),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const failed = results.find((result) => !result.ok);
      expect(failed).toMatchObject({
        error: { code: "INVENTORY_UNAVAILABLE" },
      });
      const sold = await client.reservationRoom.count({
        where: {
          checkIn: new Date("2031-04-20T00:00:00Z"),
          consumesInventory: true,
        },
      });
      expect(sold).toBe(1);
    }
  }, 120_000);

  it("C-4: a block and a modify race for the last unit; exactly one wins and nothing is oversold", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client, { units: 1 });
      const a = await book(room.id, {
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" },
      });
      const target = { checkIn: "2031-04-20", checkOut: "2031-04-21" };
      const [moved, blocked] = await withIndependentClients(2, (clients) =>
        Promise.all([
          staffReservationCommands({
            client: clients[0]!,
            clock,
          }).modify.execute(admin, a.id, a.version, {
            stay: target,
            lines: [{ roomTypeId: room.id, occupancy }],
            acceptedTotal: money(11_500),
          }),
          blockUseCase(clients[1]!, { clock: () => NOW }).create(
            admin,
            TEST_BRANCH_ID,
            {
              physicalRoomId: "garden-unit-0",
              startDate: target.checkIn,
              endDate: target.checkOut,
              reason: "MAINTENANCE",
            },
          ),
        ]),
      );
      expect([moved.ok, blocked.ok].filter(Boolean)).toHaveLength(1);
      const sold = await client.reservationRoom.count({
        where: {
          checkIn: new Date("2031-04-20T00:00:00Z"),
          consumesInventory: true,
        },
      });
      const blocks = await client.inventoryBlock.count({
        where: { cancelledAt: null },
      });
      expect(sold + blocks).toBe(1);
    }
  }, 120_000);

  it("a modify and a new booking race for the last unit; the loser never oversells", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client, { units: 1 });
      const a = await book(room.id, {
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" },
      });
      const target = { checkIn: "2031-04-20", checkOut: "2031-04-21" };
      const [moved, booked] = await withIndependentClients(2, (clients) =>
        Promise.all([
          staffReservationCommands({
            client: clients[0]!,
            clock,
          }).modify.execute(admin, a.id, a.version, {
            stay: target,
            lines: [{ roomTypeId: room.id, occupancy }],
            acceptedTotal: money(11_500),
          }),
          staffReservationCommands({
            client: clients[1]!,
            clock,
          }).create.execute(
            admin,
            {
              branchId: TEST_BRANCH_ID,
              stay: target,
              lines: [{ roomTypeId: room.id, occupancy }],
              guest: {
                fullName: "Second Guest",
                phone: phoneOf(900 + round),
                email: "second@example.test",
              },
              sendConfirmation: false,
            },
            `race-key-${round}`,
          ),
        ]),
      );
      expect([moved.ok, booked.ok].filter(Boolean)).toHaveLength(1);
      expect(
        await client.reservationRoom.count({
          where: {
            checkIn: new Date("2031-04-20T00:00:00Z"),
            consumesInventory: true,
          },
        }),
      ).toBe(1);
    }
  }, 120_000);
});

describe("AC-9 and AC-8 for the change use cases", () => {
  const principalsByName: Record<string, StaffPrincipal | null> = {
    anonymous: null,
    admin,
    manager: { ...admin, role: "MANAGER", branchIds: [TEST_BRANCH_ID] },
    receptionist: {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: [TEST_BRANCH_ID],
    },
    unassignedReceptionist: { ...admin, role: "RECEPTIONIST", branchIds: [] },
    otherBranchManager: {
      ...admin,
      role: "MANAGER",
      branchIds: ["other-branch"],
    },
    editor: { ...admin, role: "EDITOR", branchIds: [TEST_BRANCH_ID] },
  };
  const expected: Record<
    string,
    "allowed" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHENTICATED"
  > = {
    anonymous: "UNAUTHENTICATED",
    admin: "allowed",
    manager: "allowed",
    receptionist: "allowed",
    unassignedReceptionist: "NOT_FOUND",
    otherBranchManager: "NOT_FOUND",
    editor: "FORBIDDEN",
  };

  it("every role, an unassigned branch and another branch get the documented answer", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const useCases = {
      modify: (staff: StaffPrincipal | null) =>
        commands().modify.execute(
          staff,
          created.id,
          99,
          modifyBody(room.id, 1),
        ),
      cancel: (staff: StaffPrincipal | null) =>
        commands().cancel.execute(staff, created.id, 99, {
          reason: "OTHER",
          notifyGuest: false,
        }),
      pms: (staff: StaffPrincipal | null) =>
        commands().markChangeEntered.execute(staff, created.id, 99, {
          changeSeq: 1,
        }),
    };
    for (const [name, run] of Object.entries(useCases))
      for (const [who, principal] of Object.entries(principalsByName)) {
        const result = await run(principal);
        const code = result.ok ? "ok" : result.error.code;
        if (expected[who] === "allowed")
          expect(
            ["FORBIDDEN", "NOT_FOUND", "UNAUTHENTICATED"],
            `${name} ${who}`,
          ).not.toContain(code);
        else expect(code, `${name} ${who}`).toBe(expected[who]);
      }
    expect(await client.reservationChange.count()).toBe(0);
    expect(
      (
        await client.reservation.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).version,
    ).toBe(created.version);
  });

  it("keeps guest names, emails and phones out of logs and error bodies", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    try {
      const bodies = [
        await call(
          stayRoute,
          created.id,
          "PUT",
          modifyBody(room.id, 46_000),
          "admin",
          created.version,
        ),
        await call(
          stayRoute,
          created.id,
          "PUT",
          modifyBody(room.id, 1),
          "admin",
          created.version + 1,
        ),
        await call(pmsRoute, created.id, "POST", { changeSeq: 1 }, "admin", 1),
        await call(
          cancelRoute,
          created.id,
          "POST",
          { reason: "OTHER", notifyGuest: false },
          "admin",
          99,
        ),
      ];
      // The success body is for the authorized staff member; only errors and logs are checked.
      const errors = bodies.filter((response) => !response.ok);
      expect(errors).toHaveLength(3);
      const text =
        (await Promise.all(errors.map((response) => response.text()))).join(
          "",
        ) + JSON.stringify(logs.flatMap((log) => log.mock.calls));
      for (const secret of [
        "Private Guest",
        "private@example.test",
        phoneOf(counter),
      ])
        expect(text).not.toContain(secret);
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });
});

describe("re-reads after the locks and atomic cancellation (safeguards 1 to 3)", () => {
  /** Holds the listing lock in an open transaction while `during` runs, then commits. */
  async function holdingListing(
    roomTypeId: string,
    change: (tx: PrismaClient) => Promise<void>,
    start: () => Promise<unknown>,
    afterWait?: () => void,
  ) {
    const held = deferred();
    const release = deferred();
    const holder = createTestClient();
    const task = holder.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomTypeId} FOR NO KEY UPDATE`;
      await change(tx as unknown as PrismaClient);
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const running = start();
    try {
      await waitForLockWaiters(client, 1);
      afterWait?.();
    } finally {
      release.resolve();
      try {
        await task;
      } finally {
        await holder.$disconnect();
      }
    }
    return running;
  }

  it("a modify that waited on the listing lock sees the version that committed meanwhile", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const result = (await holdingListing(
      room.id,
      async (tx) => {
        await tx.reservation.update({
          where: { id: created.id },
          data: { version: { increment: 1 } },
        });
      },
      () =>
        commands().modify.execute(
          admin,
          created.id,
          created.version,
          modifyBody(room.id, 46_000),
        ),
    )) as Awaited<ReturnType<ReturnType<typeof commands>["modify"]["execute"]>>;
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "STALE_VERSION",
        context: { currentVersion: created.version + 1 },
      },
    });
    expect(await client.reservationChange.count()).toBe(0);
  });

  it("uses the branch date after a midnight listing-lock wait to preserve service charges", async () => {
    const room = await seedBookable(client);
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
    const booking = await book(room.id, { services: ["BREAKFAST"] });
    let now = new Date("2031-04-10T21:59:59Z");
    const afterMidnight = new Date("2031-04-10T22:00:01Z");
    const { modify } = staffReservationCommands({
      client,
      clock: { now: () => now },
    });
    const result = await holdingListing(
      room.id,
      async () => {},
      () =>
        modify.execute(admin, booking.id, booking.version, {
          ...modifyBody(room.id, 43700, { stay }),
          lines: [
            { roomTypeId: room.id, occupancy: { adults: 3, children: 0 } },
          ],
        }),
      () => {
        now = afterMidnight;
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(await client.reservationService.findFirstOrThrow()).toMatchObject({
      adultQuantity: 8,
      amountMinor: 8000,
      occupancyEffectiveFrom: new Date("2031-04-11T00:00:00Z"),
    });
    expect(
      await client.auditEvent.findFirstOrThrow({
        where: { action: "reservation.stay-modified" },
      }),
    ).toMatchObject({ occurredAt: afterMidnight });
  });

  it("asks to try again when the unit's listing changed outside the locked set", async () => {
    const room = await seedBookable(client);
    const other = await seedBookable(client, { slug: "second" });
    const created = await book(room.id);
    const result = (await holdingListing(
      room.id,
      async (tx) => {
        // The unit moved to another listing without a version bump: the lock set is stale.
        await tx.reservationRoom.updateMany({
          where: { reservationId: created.id },
          data: { roomTypeId: other.id },
        });
      },
      () =>
        commands().modify.execute(
          admin,
          created.id,
          created.version,
          modifyBody(room.id, 46_000),
        ),
    )) as Awaited<ReturnType<ReturnType<typeof commands>["modify"]["execute"]>>;
    expect(result).toMatchObject({ ok: false, error: { code: "TRY_AGAIN" } });
    expect(await client.reservationChange.count()).toBe(0);
  });

  it("cancellation rolls back status, inventory and coupon release together when the audit fails", async () => {
    const room = await seedBookable(client);
    await client.coupon.create({
      data: {
        id: "welcome-coupon",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        allBranches: true,
      },
    });
    const created = await book(room.id, { couponCode: "welcome" });
    const failing = new CancelReservation({
      paid: {
        execute: async () => {
          throw new Error("unpaid path only");
        },
      },
      unitOfWork: new PrismaReservationUnitOfWork<CancelReservationContext>(
        client,
        (transaction) => ({
          ...cancelReservationContext(transaction),
          audit: {
            append: async () => {
              throw new Error("audit down");
            },
          },
        }),
      ),
      reads: new PrismaStaffReservationReader(client),
      ids: new Cuid2IdGenerator(),
      clock,
    });
    await expect(
      failing.execute(admin, created.id, created.version, {
        reason: "OTHER",
        notifyGuest: true,
      }),
    ).rejects.toThrow("audit down");
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
      include: { rooms: true, redemption: true },
    });
    expect(row.status).toBe("CONFIRMED");
    expect(row.version).toBe(created.version);
    expect(row.rooms.every((line) => line.consumesInventory)).toBe(true);
    expect(row.redemption?.releasedAt).toBeNull();
    expect(await client.notificationOutbox.count()).toBe(0);
  });

  it("coupon release is idempotent at the repository", async () => {
    const room = await seedBookable(client);
    await client.coupon.create({
      data: {
        id: "welcome-coupon",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        allBranches: true,
      },
    });
    const created = await book(room.id, { couponCode: "welcome" });
    const store = new PrismaCouponRedemptionStore(client);
    await store.release(created.id, new Date("2031-03-02T00:00:00Z"));
    await store.release(created.id, new Date("2031-03-09T00:00:00Z"));
    expect(
      (
        await client.couponRedemption.findUniqueOrThrow({
          where: { reservationId: created.id },
        })
      ).releasedAt,
    ).toEqual(new Date("2031-03-02T00:00:00Z"));
    await store.release("missing", new Date());
  });
});

const enter = (id: string) =>
  client.reservation.update({
    where: { id },
    data: {
      source: "WEBSITE",
      createdById: null,
      pmsEnteredAt: NOW,
      pmsEnteredById: admin.id,
    },
  });
const pmsAck = (id: string, changeSeq: number, version: number) =>
  call(pmsRoute, id, "POST", { changeSeq }, "admin", version);

describe("cancelling a booking already in the hotel system (Q-84)", () => {
  it("numbers the cancellation as a change, sets the flag, and protects S55 from stale acknowledgements", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await enter(created.id);
    const modified = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(modified.ok).toBe(true);
    const flagged = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    const cancelled = await call(
      cancelRoute,
      created.id,
      "POST",
      { reason: "GUEST_REQUEST", notifyGuest: false },
      "admin",
      flagged.version,
    );
    expect(cancelled.status).toBe(200);
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row).toMatchObject({ status: "CANCELLED", changeSeq: 2 });
    // The flag keeps the date of the first change.
    expect(row.pmsUpdatePendingSince).toEqual(flagged.pmsUpdatePendingSince);
    expect(
      (
        await client.reservationChange.findMany({ orderBy: { seq: "asc" } })
      ).map((change) => [change.seq, change.kind]),
    ).toEqual([
      [1, "STAY"],
      [2, "CANCEL"],
    ]);
    expect(
      await client.auditEvent.findFirstOrThrow({
        where: { action: "reservation.cancelled" },
      }),
    ).toMatchObject({ changes: { flagPmsUpdate: true, changeSeq: 2 } });
    // Acknowledging the earlier stay change must not clear the flag.
    const stale = await pmsAck(created.id, 1, row.version);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "PMS_UPDATE_STALE",
      context: { currentChangeSeq: 2 },
    });
    // A retry of the cancellation neither bumps the number nor writes again.
    expect(
      (
        await call(
          cancelRoute,
          created.id,
          "POST",
          { reason: "OTHER", notifyGuest: false },
          "admin",
          flagged.version,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await client.reservation.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).changeSeq,
    ).toBe(2);
    const view = await (await pmsAck(created.id, 2, row.version)).json();
    expect(view).toMatchObject({
      status: "CANCELLED",
      pmsUpdatePendingSince: null,
    });
  });

  it("sets nothing for a booking that was never entered", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await call(
      cancelRoute,
      created.id,
      "POST",
      { reason: "OTHER", notifyGuest: false },
      "admin",
      created.version,
    );
    const row = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect([row.changeSeq, row.pmsUpdatePendingSince]).toEqual([0, null]);
    expect(await client.reservationChange.count()).toBe(0);
  });
});

describe("VAT and coupon during a modification (Q-19, PR-11)", () => {
  async function coupon(values: Record<string, unknown>) {
    await client.coupon.create({
      data: { id: "c-" + values.code, allBranches: true, ...values } as never,
    });
  }

  it("keeps the stored VAT rate and coupon value, recalculating the amounts, without revalidating the coupon", async () => {
    const room = await seedBookable(client);
    await coupon({
      code: "TEN",
      kind: "PERCENT",
      percentBasisPoints: 1000,
      maxRedemptions: 1,
    });
    await coupon({
      code: "FIVE",
      kind: "FIXED",
      amountMinor: 5000,
      maxRedemptions: 1,
    });
    const percent = await book(room.id, { couponCode: "ten", phone: 1 });
    const fixed = await book(room.id, { couponCode: "five", phone: 2 });
    // Everything about the coupons and the VAT rate changes after booking.
    await client.coupon.updateMany({
      data: {
        active: false,
        endsAt: new Date("2031-03-02T00:00:00Z"),
        maxRedemptions: 1,
      },
    });
    await client.commercialSettings.update({
      where: { id: "default" },
      data: { vatRateBasisPoints: 2000 },
    });
    // Four nights at 100.00: 10% off is 40.00, VAT 15% of 360.00 is 54.00.
    const a = await commands().modify.execute(
      admin,
      percent.id,
      percent.version,
      modifyBody(room.id, 41_400),
    );
    expect(a.ok).toBe(true);
    expect(
      await client.reservation.findUniqueOrThrow({ where: { id: percent.id } }),
    ).toMatchObject({
      couponCode: "TEN",
      couponKind: "PERCENT",
      couponValue: 1000,
      discountMinor: 4000,
      vatRateBasisPoints: 1500,
      vatMinor: 5400,
      totalMinor: 41_400,
    });
    // A fixed coupon stays 50.00 off; VAT is 15% of 350.00.
    const b = await commands().modify.execute(
      admin,
      fixed.id,
      fixed.version,
      modifyBody(room.id, 40_250),
    );
    expect(b.ok).toBe(true);
    expect(
      await client.reservation.findUniqueOrThrow({ where: { id: fixed.id } }),
    ).toMatchObject({
      couponKind: "FIXED",
      couponValue: 5000,
      discountMinor: 5000,
      vatMinor: 5250,
      totalMinor: 40_250,
    });
    // Their redemptions are untouched (the coupons are used up and inactive).
    expect(
      await client.couponRedemption.count({ where: { releasedAt: null } }),
    ).toBe(2);
  });
});

describe("physical room assignments during a modification", () => {
  const assign = (id: string, unit: string) =>
    client.reservationRoom.updateMany({
      where: { reservationId: id },
      data: { physicalRoomId: unit },
    });
  const unitOf = async (id: string) =>
    (
      await client.reservationRoom.findFirstOrThrow({
        where: { reservationId: id },
      })
    ).physicalRoomId;

  it("keeps the unit for an occupancy change and for a check out extension while it stays free", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await assign(created.id, "garden-unit-0");
    const occupancyOnly = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      {
        stay,
        lines: [{ roomTypeId: room.id, occupancy: { adults: 3, children: 0 } }],
        acceptedTotal: money(34_500),
      },
    );
    expect(occupancyOnly.ok).toBe(true);
    expect(await unitOf(created.id)).toBe("garden-unit-0");
    const extended = await commands().modify.execute(
      admin,
      created.id,
      created.version + 1,
      modifyBody(room.id, 46_000),
    );
    expect(extended.ok).toBe(true);
    expect(await unitOf(created.id)).toBe("garden-unit-0");
  });

  it("drops the unit when another reservation holds it on the new nights, and says so in the history", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await assign(created.id, "garden-unit-0");
    const other = await book(room.id, {
      stay: { checkIn: "2031-04-13", checkOut: "2031-04-14" },
    });
    await assign(other.id, "garden-unit-0");
    const result = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(result.ok).toBe(true);
    expect(await unitOf(created.id)).toBeNull();
    const change = await client.reservationChange.findFirstOrThrow({
      where: { reservationId: created.id },
    });
    expect([
      (change.before as { assignedUnits: number }).assignedUnits,
      (change.after as { assignedUnits: number }).assignedUnits,
    ]).toEqual([1, 0]);
  });

  it("drops the unit when an active block covers the new nights", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await assign(created.id, "garden-unit-0");
    await client.inventoryBlock.create({
      data: {
        id: "block-1",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "garden-unit-0",
        startDate: new Date("2031-04-13T00:00:00Z"),
        endDate: new Date("2031-04-14T00:00:00Z"),
        reason: "MAINTENANCE",
        createdById: admin.id,
      },
    });
    expect(
      (
        await commands().modify.execute(
          admin,
          created.id,
          created.version,
          modifyBody(room.id, 46_000),
        )
      ).ok,
    ).toBe(true);
    expect(await unitOf(created.id)).toBeNull();
  });
});

describe("a stay that has started", () => {
  const later = () =>
    staffReservationCommands({
      client,
      clock: { now: () => new Date("2031-04-11T10:00:00Z") },
    });

  it("extends the check out without touching the nights already consumed", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await client.roomBaseRate.update({
      where: { roomTypeId: room.id },
      data: { amountMinor: 12_000 },
    });
    const result = await later().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, FOUR_NIGHTS),
    );
    expect(result.ok).toBe(true);
    expect(
      (
        await client.reservationNight.findMany({ orderBy: { night: "asc" } })
      ).map((n) => n.amountMinor),
    ).toEqual([10_000, 10_000, 10_000, 12_000]);
  });

  it("refuses a moved check in, an added unit, and a price override", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const attempts: ModifyReservationInput[] = [
      {
        ...modifyBody(room.id, 1),
        stay: { checkIn: "2031-04-11", checkOut: "2031-04-14" },
      },
      {
        ...modifyBody(room.id, 1),
        lines: [
          { roomTypeId: room.id, occupancy },
          { roomTypeId: room.id, occupancy },
        ],
      },
    ];
    attempts.push({
      ...modifyBody(room.id, 46_000),
      priceOverride: {
        lines: [
          {
            nights: [
              "2031-04-10",
              "2031-04-11",
              "2031-04-12",
              "2031-04-13",
            ].map((night) => ({ night, amountMinor: 9000 })),
          },
        ],
        reason: "Goodwill",
      },
    });
    for (const attempt of attempts)
      expect(
        await later().modify.execute(
          admin,
          created.id,
          created.version,
          attempt,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    expect(await client.reservationChange.count()).toBe(0);
  });
});

describe("capacity for a stay that has started", () => {
  const later = () =>
    staffReservationCommands({
      client,
      clock: { now: () => new Date("2031-04-11T10:00:00Z") },
    });
  const block = (date: string, next: string, cancelledAt: Date | null = null) =>
    client.inventoryBlock.create({
      data: {
        id: `block-${date}`,
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "garden-unit-0",
        startDate: new Date(`${date}T00:00:00Z`),
        endDate: new Date(`${next}T00:00:00Z`),
        reason: "MAINTENANCE",
        cancelledAt,
        createdById: admin.id,
      },
    });

  it("refuses an added night that is sold out", async () => {
    const room = await seedBookable(client, { units: 1 });
    const created = await book(room.id);
    await book(room.id, {
      stay: { checkIn: "2031-04-13", checkOut: "2031-04-14" },
    });
    const result = await later().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: "2031-04-13" },
      },
    });
    expect(await client.reservationChange.count()).toBe(0);
  });

  it("does not check nights before today again, and needs no capacity when no night is added", async () => {
    const room = await seedBookable(client, { units: 1 });
    const created = await book(room.id);
    // The only unit is blocked on a night the guest already consumed.
    await block("2031-04-10", "2031-04-11");
    const extended = await later().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(extended.ok).toBe(true);
    // A block on a later night does not stop a shortening or an occupancy change.
    await block("2031-04-12", "2031-04-13");
    const shorter = await later().modify.execute(
      admin,
      created.id,
      created.version + 1,
      {
        ...modifyBody(room.id, 23_000),
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-12" },
      },
    );
    expect(shorter.ok).toBe(true);
    const guests = await later().modify.execute(
      admin,
      created.id,
      created.version + 2,
      {
        ...modifyBody(room.id, 23_000),
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-12" },
        lines: [{ roomTypeId: room.id, occupancy: { adults: 3, children: 0 } }],
      },
    );
    expect(guests.ok).toBe(true);
  });

  it("unitFree: an inactive unit loses its assignment, a cancelled block does not", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await client.reservationRoom.updateMany({
      where: { reservationId: created.id },
      data: { physicalRoomId: "garden-unit-0" },
    });
    await block("2031-04-13", "2031-04-14", new Date("2031-03-02T00:00:00Z"));
    const kept = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(kept.ok).toBe(true);
    expect(
      (
        await client.reservationRoom.findFirstOrThrow({
          where: { reservationId: created.id },
        })
      ).physicalRoomId,
    ).toBe("garden-unit-0");
    await client.physicalRoom.update({
      where: { id: "garden-unit-0" },
      data: { active: false },
    });
    const dropped = await commands().modify.execute(
      admin,
      created.id,
      created.version + 1,
      { ...modifyBody(room.id, 34_500), stay },
    );
    expect(dropped.ok).toBe(true);
    expect(
      (
        await client.reservationRoom.findFirstOrThrow({
          where: { reservationId: created.id },
        })
      ).physicalRoomId,
    ).toBeNull();
  });
});

describe("a price-only override (S6 supports it)", () => {
  const nights = ["2031-04-10", "2031-04-11", "2031-04-12"].map((night) => ({
    night,
    amountMinor: 9000,
  }));
  const body = (room: string, reason = "Loyal guest") =>
    modifyBody(room, 31_050, {
      stay,
      priceOverride: { lines: [{ nights }], reason },
    });

  it("needs pricing:override, a reason and the current version, and records the old and new totals", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const reception = {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: [TEST_BRANCH_ID],
    } as const;
    expect(
      await commands().modify.execute(
        reception,
        created.id,
        created.version,
        body(room.id),
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await commands().modify.execute(
        admin,
        created.id,
        created.version,
        body(room.id, " "),
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await commands().modify.execute(admin, created.id, 9, body(room.id)),
    ).toMatchObject({ ok: false, error: { code: "STALE_VERSION" } });
    // Without an override the same unchanged request is still a no-op.
    expect(
      await commands().modify.execute(admin, created.id, created.version, {
        ...modifyBody(room.id, 34_500),
        stay,
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await client.reservationChange.count()).toBe(0);
    expect(
      (
        await commands().modify.execute(
          admin,
          created.id,
          created.version,
          body(room.id),
        )
      ).ok,
    ).toBe(true);
    expect(await client.reservationChange.findFirstOrThrow()).toMatchObject({
      oldTotalMinor: 34_500,
      newTotalMinor: 31_050,
      overrideFromMinor: 34_500,
      overrideToMinor: 31_050,
      overrideReason: "Loyal guest",
      actorId: admin.id,
    });
  });
});

describe("retained services on stay and occupancy changes", () => {
  const rowVersion = async () =>
    client.$queryRaw<
      { kind: string; xmin: string }[]
    >`SELECT kind::text, xmin::text FROM "ReservationService"`;

  it("keeps consumed adult and child service quantities through successive occupancy changes", async () => {
    const room = await seedBookable(client);
    await client.serviceOffering.create({
      data: {
        id: "breakfast",
        branchId: TEST_BRANCH_ID,
        kind: "BREAKFAST",
        active: true,
        priceUnit: "PER_PERSON_PER_NIGHT",
        priceMinor: 1000,
        childPriceMinor: 500,
      },
    });
    const booking = await book(room.id, { services: ["BREAKFAST"] });
    const service = () =>
      client.reservationService.findFirstOrThrow({
        where: { reservationId: booking.id },
      });
    expect(await service()).toMatchObject({
      adultQuantity: 6,
      childQuantity: 0,
      amountMinor: 6000,
      occupancyEffectiveFrom: null,
    });
    const change = (
      now: string,
      version: number,
      amount: number,
      adults: number,
      children: number,
      dates = stay,
    ) =>
      staffReservationCommands({
        client,
        clock: { now: () => new Date(now) },
      }).modify.execute(admin, booking.id, version, {
        ...modifyBody(room.id, amount, { stay: dates }),
        lines: [{ roomTypeId: room.id, occupancy: { adults, children } }],
      });
    // Cairo is already on April 11. The first night stays billed for two adults.
    expect(
      await change("2031-04-10T22:10:00Z", booking.version, 1, 3, 1),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PRICE_CHANGED",
        context: { quote: { servicesMinor: 9000, totalMinor: 44850 } },
      },
    });
    expect((await service()).adultQuantity).toBe(6);
    expect(
      (await change("2031-04-10T22:10:00Z", booking.version, 44850, 3, 1)).ok,
    ).toBe(true);
    expect(await service()).toMatchObject({
      adults: 3,
      children: 1,
      adultQuantity: 8,
      childQuantity: 2,
      amountMinor: 9000,
      occupancyEffectiveFrom: new Date("2031-04-11T00:00:00Z"),
    });
    // April 12 keeps the first two nights' charges and bills one adult for the last night.
    expect(
      (await change("2031-04-12T10:00:00Z", booking.version + 1, 41975, 1, 0))
        .ok,
    ).toBe(true);
    expect(await service()).toMatchObject({
      adults: 1,
      children: 0,
      adultQuantity: 6,
      childQuantity: 1,
      amountMinor: 6500,
      occupancyEffectiveFrom: new Date("2031-04-12T00:00:00Z"),
    });
    // Shortening to today removes the remaining charge, even if occupancy changes again.
    expect(
      (
        await change("2031-04-12T10:00:00Z", booking.version + 2, 29325, 2, 0, {
          ...stay,
          checkOut: "2031-04-12",
        })
      ).ok,
    ).toBe(true);
    expect(await service()).toMatchObject({
      adultQuantity: 5,
      childQuantity: 1,
      amountMinor: 5500,
      nights: 2,
    });
  });

  it("rewrites no service row unless its counts follow the nights, and never changes its identity, price or details", async () => {
    const room = await seedBookable(client);
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
    const created = await book(room.id, { services: ["BREAKFAST"] });
    const before = await rowVersion();
    expect(before).toHaveLength(1);
    // Price only: the nights and guests are the same, so the row is untouched.
    const nights = ["2031-04-10", "2031-04-11", "2031-04-12"].map((night) => ({
      night,
      amountMinor: 9000,
    }));
    expect(
      (
        await commands().modify.execute(admin, created.id, created.version, {
          ...modifyBody(room.id, 37_950, { stay }),
          priceOverride: { lines: [{ nights }], reason: "Goodwill" },
        })
      ).ok,
    ).toBe(true);
    expect(await rowVersion()).toEqual(before);
    // A longer stay changes the counts: the same row is updated in place.
    await client.roomBaseRate.update({
      where: { roomTypeId: room.id },
      data: { amountMinor: 10_000 },
    });
    expect(
      (
        await commands().modify.execute(
          admin,
          created.id,
          created.version + 1,
          modifyBody(room.id, 51_750),
        )
      ).ok,
    ).toBe(true);
    const after = await rowVersion();
    expect(after.map((row) => row.kind)).toEqual(["BREAKFAST"]);
    expect(after[0]!.xmin).not.toBe(before[0]!.xmin);
    expect(
      await client.reservationService.findFirstOrThrow({
        where: { reservationId: created.id },
      }),
    ).toMatchObject({
      priceMinor: 1000,
      priceUnit: "PER_PERSON_PER_NIGHT",
      nights: 4,
      adultQuantity: 8,
      amountMinor: 8000,
    });
  });
});

describe("messages for the new kinds", () => {
  const rows = () =>
    client.notificationOutbox.findMany({ orderBy: [{ channel: "asc" }] });

  it("queues the modified message per channel with the right recipients and variables, and nothing when not asked", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id, { phone: 7 });
    await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000),
    );
    expect(await rows()).toHaveLength(0);
    await commands().modify.execute(admin, created.id, created.version + 1, {
      ...modifyBody(room.id, 34_500),
      stay,
      notifyGuest: true,
    });
    const queued = await rows();
    expect(queued.map((row) => [row.channel, row.kind, row.recipient])).toEqual(
      [
        ["EMAIL", "reservation.modified", "private@example.test"],
        ["WHATSAPP", "reservation.modified", phoneOf(7)],
      ],
    );
    for (const row of queued)
      expect(row.payload).toEqual({
        reference: created.reference.value,
        branchName: expect.any(String),
        guestFirstName: "Private",
        checkIn: "2031-04-10",
        checkOut: "2031-04-13",
        total: "USD 345.00",
      });
    expect(JSON.stringify(queued)).not.toMatch(/manage|token/i);
  });

  it("resolves recipients from what the reservation holds: no email means WhatsApp only, no phone means email only", async () => {
    const room = await seedBookable(client);
    const noEmail = await book(room.id, { phone: 8, email: false });
    await commands().modify.execute(
      admin,
      noEmail.id,
      noEmail.version,
      modifyBody(room.id, 46_000, { notifyGuest: true }),
    );
    expect((await rows()).map((row) => row.channel)).toEqual(["WHATSAPP"]);
    await client.notificationOutbox.deleteMany();
    const noPhone = await book(room.id, {
      phone: 9,
      stay: { checkIn: "2031-05-10", checkOut: "2031-05-13" },
    });
    await client.reservation.update({
      where: { id: noPhone.id },
      data: { guestPhone: null },
    });
    await commands().modify.execute(admin, noPhone.id, noPhone.version, {
      stay: { checkIn: "2031-05-10", checkOut: "2031-05-14" },
      lines: [{ roomTypeId: room.id, occupancy }],
      acceptedTotal: money(46_000),
      notifyGuest: true,
    });
    expect((await rows()).map((row) => [row.channel, row.recipient])).toEqual([
      ["EMAIL", "private@example.test"],
    ]);
  });

  it("queues the cancelled message with the guest facing reason, and nothing when notifyGuest is false", async () => {
    const room = await seedBookable(client);
    const quiet = await book(room.id, { phone: 10 });
    await call(
      cancelRoute,
      quiet.id,
      "POST",
      { reason: "GUEST_REQUEST", notifyGuest: false },
      "admin",
      quiet.version,
    );
    expect(await rows()).toHaveLength(0);
    const loud = await book(room.id, { phone: 11 });
    await call(
      cancelRoute,
      loud.id,
      "POST",
      {
        reason: "CROSS_SYSTEM_CONFLICT",
        note: "internal only",
        notifyGuest: true,
      },
      "admin",
      loud.version,
    );
    const queued = await rows();
    expect(queued.map((row) => [row.channel, row.kind])).toEqual([
      ["EMAIL", "reservation.cancelled"],
      ["WHATSAPP", "reservation.cancelled"],
    ]);
    for (const row of queued) {
      expect(row.payload).toEqual({
        reference: loud.reference.value,
        branchName: expect.any(String),
        guestFirstName: "Private",
        checkIn: "2031-04-10",
        checkOut: "2031-04-13",
        reason: "The room is no longer available",
      });
    }
    expect(JSON.stringify(queued)).not.toContain("internal only");
  });
});

describe("stale versions, no-op overrides, ownership and service guards", () => {
  it("answers 412 before any 422 when the caller's version is stale", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    // A no-op request would be a 422, and so would a started stay change; stale wins.
    expect(
      await commands().modify.execute(admin, created.id, 99, {
        ...modifyBody(room.id, 34_500),
        stay,
      }),
    ).toMatchObject({ ok: false, error: { code: "STALE_VERSION" } });
    const response = await call(
      stayRoute,
      created.id,
      "PUT",
      { ...modifyBody(room.id, 34_500), stay },
      "admin",
      99,
    );
    expect(response.status).toBe(412);
    for (const [version, status] of [
      [99, 412],
      [created.version, 422],
    ] as const) {
      const invalidBody = await call(
        stayRoute,
        created.id,
        "PUT",
        { ...modifyBody(room.id, 34_500), lines: [] },
        "admin",
        version,
      );
      expect(invalidBody.status).toBe(status);
    }
  });

  it("rejects an override that repeats the stored prices as a no-op, without a history row", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    const same = ["2031-04-10", "2031-04-11", "2031-04-12"].map((night) => ({
      night,
      amountMinor: 10_000,
    }));
    const result = await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 34_500, {
        stay,
        priceOverride: { lines: [{ nights: same }], reason: "Same prices" },
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { priceOverride: expect.any(Array) },
      },
    });
    expect(await state(created.id)).toMatchObject({ changes: 0, audits: 0 });
    // Different amounts on one night are a real override.
    const real = same.map((night, index) =>
      index === 0 ? { ...night, amountMinor: 9000 } : night,
    );
    expect(
      (
        await commands().modify.execute(
          admin,
          created.id,
          created.version,
          modifyBody(room.id, 33_350, {
            stay,
            priceOverride: { lines: [{ nights: real }], reason: "One night" },
          }),
        )
      ).ok,
    ).toBe(true);
  });

  it("unitFree checks that the unit belongs to the listing, whatever the caller assumed", async () => {
    const room = await seedBookable(client);
    const other = await seedBookable(client, { slug: "second" });
    const created = await book(room.id);
    const repository = new PrismaReservationRepository(client);
    const range = StayRange.create(
      LocalDate.parse("2031-04-10"),
      LocalDate.parse("2031-04-14"),
    );
    expect(
      await repository.unitFree(
        TEST_BRANCH_ID,
        "garden-unit-0",
        room.id,
        range,
        created.id,
      ),
    ).toBe(true);
    expect(
      await repository.unitFree(
        TEST_BRANCH_ID,
        "second-unit-0",
        room.id,
        range,
        created.id,
      ),
    ).toBe(false);
    expect(
      await repository.unitFree(
        TEST_BRANCH_ID,
        "second-unit-0",
        other.id,
        range,
        created.id,
      ),
    ).toBe(true);
    expect(
      await repository.unitFree(
        "other-branch",
        "garden-unit-0",
        room.id,
        range,
        created.id,
      ),
    ).toBe(false);
  });

  it("replaceStay refuses duplicate services or changed pricing terms for retained services", async () => {
    const room = await seedBookable(client);
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
    await client.serviceOffering.create({
      data: {
        id: "transfer",
        branchId: TEST_BRANCH_ID,
        kind: "AIRPORT_TRANSFER",
        active: true,
        priceUnit: "PER_BOOKING",
        priceMinor: 1500,
        maxVehicles: 3,
      },
    });
    const created = await book(room.id, {
      services: ["BREAKFAST", "AIRPORT_TRANSFER"],
    });
    const repository = new PrismaReservationRepository(client);
    const stored = (await repository.findById(TEST_BRANCH_ID, created.id))!;
    const base = {
      branchId: TEST_BRANCH_ID,
      reservationId: created.id,
      stay: stored.stay,
      lines: stored.lines,
      flagPmsUpdate: false,
      at: NOW,
    };
    const snapshot = stored.snapshot!;
    const breakfast = snapshot.serviceLines.find(
      (line) => line.kind === "BREAKFAST",
    )!;
    const attempts = {
      duplicate: { ...snapshot, serviceLines: [breakfast, breakfast] },
      repriced: {
        ...snapshot,
        serviceLines: snapshot.serviceLines.map((line) => ({
          ...line,
          priceMinor: line.priceMinor + 1,
        })),
      },
    };
    for (const [name, changed] of Object.entries(attempts)) {
      await expect(
        client.$transaction((tx) =>
          new PrismaReservationRepository(tx).replaceStay({
            ...base,
            snapshot: changed,
          }),
        ),
        name,
      ).rejects.toThrow(/service/);
    }
    const after = (await repository.findById(TEST_BRANCH_ID, created.id))!;
    expect(after.version).toBe(created.version);
    expect(after.lines).toHaveLength(stored.lines.length);
    expect(after.snapshot?.serviceLines).toEqual(snapshot.serviceLines);
  });
});

describe("S15 history for the change actions", () => {
  it("shows the totals, change number, flags and the cancellation reason code, never the note", async () => {
    const room = await seedBookable(client);
    const created = await book(room.id);
    await enter(created.id);
    await commands().modify.execute(
      admin,
      created.id,
      created.version,
      modifyBody(room.id, 46_000, { notifyGuest: true }),
    );
    const after = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    await call(
      cancelRoute,
      created.id,
      "POST",
      {
        reason: "INVALID_DETAILS",
        note: "private internal note",
        notifyGuest: false,
      },
      "admin",
      after.version,
    );
    const latest = await client.reservation.findUniqueOrThrow({
      where: { id: created.id },
    });
    await pmsAck(created.id, 2, latest.version);
    const history = await staffReservationQueries({ client }).history.execute(
      admin,
      created.id,
    );
    if (!history.ok) throw new Error("history failed");
    const { items } = history.value;
    const byAction = Object.fromEntries(
      items.map((item) => [item.action, item.changes]),
    );
    expect(byAction["reservation.stay-modified"]).toMatchObject({
      oldTotalMinor: 34_500,
      newTotalMinor: 46_000,
      changeSeq: 1,
      flagPmsUpdate: true,
      guestNotified: true,
      priceOverridden: false,
    });
    expect(byAction["reservation.cancelled"]).toMatchObject({
      reason: "INVALID_DETAILS",
      couponReleased: false,
      guestNotified: false,
      noteProvided: true,
      flagPmsUpdate: true,
      changeSeq: 2,
    });
    expect(byAction["reservation.pms-update-entered"]).toMatchObject({
      changeSeq: 2,
    });
    expect(JSON.stringify(items)).not.toContain("private internal note");
  });
});

describe("S6 service edits (AC-12, T-CHG-5…7)", () => {
  async function seedTransfer(
    priceUnit: "PER_VEHICLE" | "PER_BOOKING" = "PER_VEHICLE",
  ) {
    await client.serviceOffering.create({
      data: {
        id: "transfer",
        branchId: TEST_BRANCH_ID,
        kind: "AIRPORT_TRANSFER",
        active: true,
        priceUnit,
        priceMinor: 1500,
        maxVehicles: 4,
      },
    });
  }

  async function seedBreakfast() {
    await client.serviceOffering.create({
      data: {
        id: "breakfast",
        branchId: TEST_BRANCH_ID,
        kind: "BREAKFAST",
        active: true,
        priceUnit: "PER_PERSON_PER_NIGHT",
        priceMinor: 1000,
        childPriceMinor: 500,
      },
    });
  }

  const transfer = (vehicles?: number, details?: string) => ({
    kind: "AIRPORT_TRANSFER",
    ...(vehicles === undefined ? {} : { vehicles }),
    ...(details === undefined ? {} : { details }),
  });

  it("keeps stored transfer pricing terms and adds breakfast at the current branch price on a combined change", async () => {
    const room = await seedBookable(client);
    await seedTransfer();
    await client.coupon.create({
      data: {
        id: "service-edit-coupon",
        code: "SERVICES10",
        allBranches: true,
        kind: "PERCENT",
        percentBasisPoints: 1000,
      },
    });
    const booking = await book(room.id, {
      services: [transfer(2, "MS100")],
      couponCode: "SERVICES10",
    });
    await client.coupon.updateMany({ data: { active: false } });
    await client.commercialSettings.update({
      where: { id: "default" },
      data: { vatRateBasisPoints: 2000 },
    });
    await client.serviceOffering.update({
      where: { id: "transfer" },
      data: { priceUnit: "PER_BOOKING", priceMinor: 8800 },
    });
    await seedBreakfast();
    await client.roomBaseRate.update({
      where: { roomTypeId: room.id },
      data: { amountMinor: 12_000 },
    });
    const body = modifyBody(room.id, 1, {
      lines: [{ roomTypeId: room.id, occupancy: { adults: 2, children: 1 } }],
      services: ["BREAKFAST", transfer(3)],
    });
    const serviceRows = () =>
      client.reservationService.findMany({
        where: { reservationId: booking.id },
      });
    const before = await state(booking.id);
    const beforeServices = await serviceRows();
    const quote = await call(
      stayRoute,
      booking.id,
      "PUT",
      body,
      "admin",
      booking.version,
    );
    expect(quote.status).toBe(409);
    expect(await quote.json()).toMatchObject({
      code: "PRICE_CHANGED",
      context: {
        quote: {
          accommodationMinor: 42_000,
          servicesMinor: 14_500,
          discountMinor: 5650,
          vatMinor: 7628,
          totalMinor: 58_478,
        },
      },
    });
    expect(await state(booking.id)).toEqual(before);
    expect(await serviceRows()).toEqual(beforeServices);
    const applied = await call(
      stayRoute,
      booking.id,
      "PUT",
      {
        ...body,
        acceptedTotal: money(58_478),
      },
      "admin",
      booking.version,
    );
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({
      price: {
        totalMinor: 58_478,
        vatRateBasisPoints: 1500,
        services: expect.arrayContaining([
          {
            kind: "BREAKFAST",
            unit: "PER_PERSON_PER_NIGHT",
            details: null,
            vehicles: null,
            priceMinor: 1000,
            childPriceMinor: 500,
            adultQuantity: 8,
            childQuantity: 4,
            amountMinor: 10_000,
          },
          {
            kind: "AIRPORT_TRANSFER",
            unit: "PER_VEHICLE",
            details: "MS100",
            vehicles: 3,
            priceMinor: 1500,
            childPriceMinor: null,
            adultQuantity: 3,
            childQuantity: 0,
            amountMinor: 4500,
          },
        ]),
      },
    });
    expect(
      await client.reservationService.count({
        where: { reservationId: booking.id },
      }),
    ).toBe(2);
  });

  it("lets staff correct flight details and remove a service without rewriting rooms or prices", async () => {
    const room = await seedBookable(client);
    await seedTransfer("PER_BOOKING");
    const bookPrice = 36_225;
    const booking = await book(room.id, {
      services: [transfer(3, "MS-private-100")],
    });
    await enter(booking.id);
    await client.serviceOffering.update({
      where: { id: "transfer" },
      data: { active: false, maxVehicles: 1, priceMinor: 8800 },
    });
    const roomRevisions = () => client.$queryRaw`
      SELECT r.id, r.xmin::text AS room_version, n.night, n.xmin::text AS night_version
      FROM "ReservationRoom" r JOIN "ReservationNight" n ON n."reservationRoomId" = r.id
      WHERE r."reservationId" = ${booking.id} ORDER BY r.id, n.night`;
    const before = await roomRevisions();
    await client.physicalRoom.updateMany({
      where: { roomTypeId: room.id },
      data: { active: false },
    });
    const body = modifyBody(room.id, bookPrice, {
      stay,
      services: [transfer(undefined, "MS-private-200")],
    });
    const logs = [
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    try {
      const edited = await call(
        stayRoute,
        booking.id,
        "PUT",
        body,
        "reception",
        booking.version,
      );
      expect(edited.status).toBe(200);
      expect(edited.headers.get("etag")).toBe('"v2"');
      expect(await edited.json()).toMatchObject({
        changeSeq: 1,
        pmsUpdatePendingSince: expect.any(String),
        price: {
          totalMinor: bookPrice,
          services: [
            {
              kind: "AIRPORT_TRANSFER",
              vehicles: 3,
              details: "MS-private-200",
              priceMinor: 1500,
              amountMinor: 1500,
            },
          ],
        },
      });
    } finally {
      const captured = JSON.stringify(logs.flatMap((log) => log.mock.calls));
      for (const log of logs) log.mockRestore();
      expect(captured).not.toMatch(/MS-private-/);
    }
    expect(await roomRevisions()).toEqual(before);
    const changes = await client.reservationChange.findMany({
      where: { reservationId: booking.id },
    });
    const audits = await client.auditEvent.findMany({
      where: { entityId: booking.id, action: "reservation.stay-modified" },
    });
    expect(changes).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      before: {
        services: [
          { kind: "AIRPORT_TRANSFER", vehicles: 3, detailsChanged: false },
        ],
      },
      after: {
        services: [
          { kind: "AIRPORT_TRANSFER", vehicles: 3, detailsChanged: true },
        ],
      },
      oldTotalMinor: bookPrice,
      newTotalMinor: bookPrice,
    });
    expect(audits[0]?.changes).toMatchObject({
      before: changes[0]?.before,
      after: changes[0]?.after,
    });
    expect(JSON.stringify({ changes, audits })).not.toMatch(/MS-private-/);
    const removed = await modifier(client, {
      forbidAccommodationReads: true,
    }).execute(
      principals.get("reception")!,
      booking.id,
      booking.version + 1,
      modifyBody(room.id, 34_500, { stay, services: [] }),
    );
    expect(removed).toMatchObject({
      ok: true,
      value: {
        reservation: { snapshot: { serviceLines: [], totalMinor: 34_500 } },
      },
    });
    expect(await client.reservationService.count()).toBe(0);
    expect(await roomRevisions()).toEqual(before);
    expect((await pmsAck(booking.id, 1, booking.version + 2)).status).toBe(409);
    expect((await pmsAck(booking.id, 2, booking.version + 2)).status).toBe(200);
  });

  it("applies the current car limit to changes, preserves a booked non-vehicle price, and rejects invalid or stale requests", async () => {
    const room = await seedBookable(client);
    await seedTransfer("PER_BOOKING");
    const booking = await book(room.id, { services: [transfer(3, "MS100")] });
    await client.serviceOffering.update({
      where: { id: "transfer" },
      data: { maxVehicles: 2 },
    });
    const body = modifyBody(room.id, 36_225, { stay });
    const send = (
      services: ModifyReservationInput["services"],
      actor = "admin",
      version = booking.version,
    ) =>
      call(stayRoute, booking.id, "PUT", { ...body, services }, actor, version);
    const before = await state(booking.id);
    for (const [services, field] of [
      [[transfer(4)], "services.0.vehicles"],
      [[{ kind: "BREAKFAST", vehicles: 2 }], "services.0.vehicles"],
      [[transfer(2), "AIRPORT_TRANSFER"], "services.1"],
    ] as const) {
      const response = await send(services);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        fieldErrors: { [field]: expect.anything() },
      });
    }
    expect((await send([transfer(2)], "foreign")).status).toBe(404);
    expect((await send([transfer(2)], "anonymous")).status).toBe(401);
    const stale = await send(
      [{ kind: "AIRPORT_TRANSFER", vehicles: "2" }],
      "admin",
      99,
    );
    expect(stale.status).toBe(412);
    expect((await send(["AIRPORT_TRANSFER"])).status).toBe(422);
    expect(await state(booking.id)).toEqual(before);
    // Disabling new selections leaves the current limit usable for a booked transfer.
    await client.serviceOffering.update({
      where: { id: "transfer" },
      data: { active: false },
    });
    const reduced = await send([transfer(2)]);
    expect(reduced.status).toBe(200);
    expect(await reduced.json()).toMatchObject({
      price: {
        totalMinor: 36_225,
        services: [{ vehicles: 2, details: "MS100", amountMinor: 1500 }],
      },
    });
  });

  it("refuses adding a disabled offering without changing the booking", async () => {
    const room = await seedBookable(client);
    await seedTransfer();
    await client.serviceOffering.update({
      where: { id: "transfer" },
      data: { active: false },
    });
    const booking = await book(room.id);
    const before = await state(booking.id);
    const rejected = await call(
      stayRoute,
      booking.id,
      "PUT",
      modifyBody(room.id, 36_225, { stay, services: ["AIRPORT_TRANSFER"] }),
      "admin",
      booking.version,
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      context: { kind: "AIRPORT_TRANSFER" },
    });
    expect(await state(booking.id)).toEqual(before);
    expect(await client.reservationService.count()).toBe(0);
  });

  it("permits details corrections on a started stay, retaining previously charged breakfast quantities", async () => {
    const room = await seedBookable(client);
    await seedTransfer();
    await seedBreakfast();
    const booking = await book(room.id, {
      services: ["BREAKFAST", transfer(1)],
    });
    const change = (
      now: string,
      version: number,
      services: ModifyReservationInput["services"],
      total: number,
      people = occupancy,
    ) =>
      staffReservationCommands({
        client,
        clock: { now: () => new Date(now) },
      }).modify.execute(
        admin,
        booking.id,
        version,
        modifyBody(room.id, total, {
          stay,
          services,
          lines: [{ roomTypeId: room.id, occupancy: people }],
        }),
      );
    expect(
      await change(
        "2031-04-10T12:00:00Z",
        booking.version,
        ["BREAKFAST", transfer(2)],
        44_850,
      ),
    ).toMatchObject({ ok: true });
    const started = "2031-04-10T22:10:00Z"; // April 11 in Cairo.
    for (const services of [[], [transfer(2)], ["BREAKFAST", transfer(3)]])
      expect(
        await change(started, booking.version + 1, services, 44_850),
      ).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          fieldErrors: { services: expect.anything() },
        },
      });
    const moreGuests = { adults: 3, children: 1 };
    expect(
      await change(started, booking.version + 1, undefined, 48_300, moreGuests),
    ).toMatchObject({ ok: true });
    const breakfast = () =>
      client.reservationService.findUniqueOrThrow({
        where: {
          reservationId_kind: { reservationId: booking.id, kind: "BREAKFAST" },
        },
      });
    const charges = await breakfast();
    expect(charges).toMatchObject({
      amountMinor: 9000,
      adultQuantity: 8,
      childQuantity: 2,
      occupancyEffectiveFrom: new Date("2031-04-11T00:00:00Z"),
    });
    expect(
      await change(
        "2031-04-12T12:00:00Z",
        booking.version + 2,
        ["BREAKFAST", transfer(undefined, "MS200")],
        48_300,
        moreGuests,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        reservation: {
          snapshot: {
            totalMinor: 48_300,
            serviceLines: expect.arrayContaining([
              expect.objectContaining({
                kind: "AIRPORT_TRANSFER",
                vehicles: 2,
                details: "MS200",
              }),
            ]),
          },
        },
      },
    });
    expect(await breakfast()).toEqual(charges);
  });

  it("keeps priced external reservations ineligible for services", async () => {
    const room = await seedBookable(client);
    await seedTransfer();
    const booking = await book(room.id);
    await client.reservation.update({
      where: { id: booking.id },
      data: {
        source: "EXTERNAL",
        externalReference: "change-external",
        externalChannel: "Partner",
      },
    });
    await client.reservationNight.updateMany({
      data: { rateSource: "MANUAL" },
    });
    const before = await state(booking.id);
    const result = await call(
      stayRoute,
      booking.id,
      "PUT",
      modifyBody(room.id, 36_225, {
        stay,
        services: ["AIRPORT_TRANSFER"],
      }),
      "admin",
      booking.version,
    );
    expect(result.status).toBe(422);
    expect(await result.json()).toMatchObject({
      fieldErrors: { services: expect.anything() },
    });
    expect(await state(booking.id)).toEqual(before);
    expect(await client.reservationService.count()).toBe(0);
  });

  it("rolls back service rows, totals, audit, flag and outbox if the change cannot commit", async () => {
    const room = await seedBookable(client);
    await seedTransfer();
    const booking = await book(room.id);
    await enter(booking.id);
    const before = await state(booking.id);
    const useCase = modifier(client, {
      audit: (inner) => ({
        append: async (event) => {
          await inner.append(event);
          throw new Error("test audit rollback");
        },
      }),
    });
    await expect(
      useCase.execute(
        admin,
        booking.id,
        booking.version,
        modifyBody(room.id, 36_225, {
          stay,
          services: ["AIRPORT_TRANSFER"],
          notifyGuest: true,
        }),
      ),
    ).rejects.toThrow("test audit rollback");
    expect(await state(booking.id)).toEqual(before);
    expect(await client.reservationService.count()).toBe(0);
  });

  it("commits one competing service edit at the same version in 20 observed lock races", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      await createActor(client);
      const room = await seedBookable(client);
      await seedTransfer();
      const booking = await book(room.id);
      await withIndependentClients(2, async ([winner, contender]) => {
        const gate = pausedAudit();
        const first = modifier(winner!, { audit: gate.audit }).execute(
          admin,
          booking.id,
          booking.version,
          modifyBody(room.id, 37_950, {
            stay,
            services: [transfer(2, "First pickup")],
          }),
        );
        const second = gate.reached.then(() =>
          modifier(contender!).execute(
            admin,
            booking.id,
            booking.version,
            modifyBody(room.id, 39_675, {
              stay,
              services: [transfer(3, "Second pickup")],
            }),
          ),
        );
        try {
          await Promise.race([
            gate.reached,
            first.then(() => {
              throw new Error("First change did not reach audit.");
            }),
          ]);
          await waitForLockWaiters(client, 1);
        } finally {
          gate.release();
        }
        const [committed, stale] = await Promise.all([first, second]);
        expect(committed.ok).toBe(true);
        expect(stale).toMatchObject({
          ok: false,
          error: { code: "STALE_VERSION" },
        });
      });
      expect(await state(booking.id)).toMatchObject({
        reservation: {
          version: booking.version + 1,
          changeSeq: 1,
          totalMinor: 37_950,
        },
        changes: 1,
        audits: 1,
      });
      expect(
        await client.reservationService.findMany({
          where: { reservationId: booking.id },
        }),
      ).toMatchObject([
        { vehicles: 2, details: "First pickup", amountMinor: 3000 },
      ]);
    }
  }, 120_000);
});
