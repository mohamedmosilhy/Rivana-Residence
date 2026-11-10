import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { Money } from "@/domain/shared/money";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";
import { backendPid } from "./support/physical-rooms";
import { rateUseCases } from "./support/rates";

const session = vi.hoisted(() => ({ staff: null as StaffPrincipal | null }));

vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(load: () => Promise<T>) =>
    () =>
      load(),
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => session.staff,
  throttleKeys: () => ({ clientKey: (value: string) => value }),
}));

const { GET: getRates } = await import(
  "@/app/api/v1/staff/room-types/[roomTypeId]/rates/route"
);
const { PUT: putBase } = await import(
  "@/app/api/v1/staff/room-types/[roomTypeId]/base-rate/route"
);
const { POST: postPeriod } = await import(
  "@/app/api/v1/staff/room-types/[roomTypeId]/rate-periods/route"
);
const { PATCH: patchPeriod, DELETE: deletePeriod } = await import(
  "@/app/api/v1/staff/rate-periods/[id]/route"
);

const client = createTestClient();
const GIZA = "branch-giza-0000000000000000";
const ORIGIN = "http://localhost:3000";
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Test",
  email: "t@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};
const manager = (branchIds: readonly string[]): StaffPrincipal => ({
  ...admin,
  id: "actor-manager",
  role: "MANAGER",
  branchIds,
});
const receptionist = (branchIds: readonly string[]): StaffPrincipal => ({
  ...admin,
  id: "actor-receptionist",
  role: "RECEPTIONIST",
  branchIds,
});

const params = (values: Record<string, string>) => ({
  params: Promise.resolve(values),
});
const request = (method: string, path: string, body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const amount = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const query = "from=2031-06-01&to=2031-06-05";

const read = (roomTypeId: string, search = query) =>
  getRates(
    request("GET", `/api/v1/staff/room-types/${roomTypeId}/rates?${search}`),
    params({ roomTypeId }),
  );
const setBase = (roomTypeId: string, amountMinor: number) =>
  putBase(
    request("PUT", `/api/v1/staff/room-types/${roomTypeId}/base-rate`, {
      amount: amount(amountMinor),
    }),
    params({ roomTypeId }),
  );
const createPeriod = (
  roomTypeId: string,
  overrides: Record<string, unknown> = {},
) =>
  postPeriod(
    request("POST", `/api/v1/staff/room-types/${roomTypeId}/rate-periods`, {
      startDate: "2031-06-01",
      endDate: "2031-06-03",
      amount: amount(6_000),
      label: "High season",
      ...overrides,
    }),
    params({ roomTypeId }),
  );
const patch = (id: string, body: unknown) =>
  patchPeriod(
    request("PATCH", `/api/v1/staff/rate-periods/${id}`, body),
    params({ id }),
  );
const deactivate = (id: string) =>
  deletePeriod(
    request("DELETE", `/api/v1/staff/rate-periods/${id}`),
    params({ id }),
  );

async function waitForRatePeriodInsertLock(observer: typeof client) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [activity] = await observer.$queryRaw<
      Readonly<{ pid: number }>[]
    >`SELECT pid::int AS pid
      FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'
        AND query ILIKE '%RatePeriod%'
        AND pid <> pg_backend_pid()
      LIMIT 1`;
    if (activity) return activity.pid;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Rate period insert did not enter a database lock wait.");
}

let cairoRoom: string;
let gizaRoom: string;

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await client.user.createMany({
    data: [
      {
        id: "actor-manager",
        name: "Manager",
        email: "manager@example.test",
        role: "MANAGER",
      },
      {
        id: "actor-receptionist",
        name: "Receptionist",
        email: "receptionist@example.test",
        role: "RECEPTIONIST",
      },
    ],
  });
  await createBranch(client, { id: GIZA, slug: "demo-giza" });
  cairoRoom = (await createRoom(client)).id;
  gizaRoom = (await createRoom(client, { branchId: GIZA })).id;
  session.staff = admin;
});

describe("S30 through S34 on PostgreSQL (M6 AC-1, AC-2, AC-7)", () => {
  it("returns the 26000 cent calendar and includes inactive periods", async () => {
    await setBase(cairoRoom, 5_000);
    const first = await createPeriod(cairoRoom);
    const second = await createPeriod(cairoRoom, {
      startDate: "2031-06-03",
      endDate: "2031-06-05",
      amount: amount(7_000),
      label: "Peak",
    });
    const firstBody = await first.json();
    await deactivate(firstBody.id);
    await patch(firstBody.id, { active: true });
    const response = await read(cairoRoom);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.periods).toHaveLength(2);
    expect(
      body.calendar.map(
        (night: { amount: { amountMinor: number } }) =>
          night.amount.amountMinor,
      ),
    ).toEqual([6_000, 6_000, 7_000, 7_000]);
    expect(second.status).toBe(201);
  });

  it("creates, changes, and idempotently deactivates periods with exact audits", async () => {
    const created = await createPeriod(cairoRoom);
    expect(created.status).toBe(201);
    const value = await created.json();
    expect(created.headers.get("location")).toBe(
      `/api/v1/staff/rate-periods/${value.id}`,
    );
    expect(
      (await patch(value.id, { amount: amount(6_500), label: null })).status,
    ).toBe(200);
    expect((await deactivate(value.id)).status).toBe(204);
    expect((await deactivate(value.id)).status).toBe(204);
    const audits = await client.auditEvent.findMany({
      where: { entityId: value.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((event) => event.action)).toEqual([
      "rate-period.created",
      "rate-period.updated",
      "rate-period.updated",
    ]);
    expect(audits.map((event) => event.changes)).toEqual([
      {
        before: null,
        after: {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
          amount: amount(6_000),
          label: "High season",
          active: true,
        },
      },
      {
        before: {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
          amount: amount(6_000),
          label: "High season",
          active: true,
        },
        after: {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
          amount: amount(6_500),
          label: null,
          active: true,
        },
      },
      {
        before: {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
          amount: amount(6_500),
          label: null,
          active: true,
        },
        after: {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
          amount: amount(6_500),
          label: null,
          active: false,
        },
      },
    ]);
  });

  it("keeps repeated base PUT idempotent with one exact audit", async () => {
    expect((await setBase(cairoRoom, 5_000)).status).toBe(200);
    expect((await setBase(cairoRoom, 5_000)).status).toBe(200);
    const audits = await client.auditEvent.findMany({
      where: { entityId: cairoRoom, action: "room-base-rate.updated" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.changes).toEqual({
      before: null,
      after: amount(5_000),
    });
  });

  it("maps active overlap to a 409 field error and permits adjacency", async () => {
    expect((await createPeriod(cairoRoom)).status).toBe(201);
    const overlap = await createPeriod(cairoRoom, {
      startDate: "2031-06-02",
      endDate: "2031-06-04",
    });
    expect(overlap.status).toBe(409);
    expect(await overlap.json()).toMatchObject({
      code: "CONFLICT",
      fieldErrors: { startDate: expect.any(Array), endDate: expect.any(Array) },
    });
    expect(
      (
        await createPeriod(cairoRoom, {
          startDate: "2031-06-03",
          endDate: "2031-06-04",
        })
      ).status,
    ).toBe(201);
  });

  it("refuses overlapping edits and reactivation without partial state or audit", async () => {
    const first = await createPeriod(cairoRoom);
    const firstId = (await first.json()).id as string;
    const second = await createPeriod(cairoRoom, {
      startDate: "2031-06-03",
      endDate: "2031-06-05",
    });
    const secondId = (await second.json()).id as string;
    const beforeEditAudits = await client.auditEvent.count();
    const edit = await patch(secondId, { startDate: "2031-06-02" });
    expect(edit.status).toBe(409);
    expect(await edit.json()).toMatchObject({
      code: "CONFLICT",
      fieldErrors: { startDate: expect.any(Array), endDate: expect.any(Array) },
    });
    expect(
      await client.ratePeriod.findUniqueOrThrow({ where: { id: secondId } }),
    ).toMatchObject({ startDate: new Date("2031-06-03T00:00:00Z") });
    expect(await client.auditEvent.count()).toBe(beforeEditAudits);

    expect((await deactivate(firstId)).status).toBe(204);
    expect(
      (
        await createPeriod(cairoRoom, {
          startDate: "2031-06-01",
          endDate: "2031-06-03",
        })
      ).status,
    ).toBe(201);
    const beforeReactivationAudits = await client.auditEvent.count();
    const reactivation = await patch(firstId, { active: true });
    expect(reactivation.status).toBe(409);
    expect(await reactivation.json()).toMatchObject({
      code: "CONFLICT",
      fieldErrors: { startDate: expect.any(Array), endDate: expect.any(Array) },
    });
    expect(
      await client.ratePeriod.findUniqueOrThrow({ where: { id: firstId } }),
    ).toMatchObject({ active: false });
    expect(await client.auditEvent.count()).toBe(beforeReactivationAudits);
  });

  it("validates strict bodies and the 62 night read boundary", async () => {
    expect((await createPeriod(cairoRoom, { branchId: GIZA })).status).toBe(
      422,
    );
    expect((await patch("missing", {})).status).toBe(422);
    expect(
      (await read(cairoRoom, "from=2031-06-01&to=2031-08-02")).status,
    ).toBe(200);
    expect(
      (await read(cairoRoom, "from=2031-06-01&to=2031-08-03")).status,
    ).toBe(422);
  });

  it("lets receptionists read, reserves writes for branch managers, and hides foreign ids", async () => {
    session.staff = receptionist([TEST_BRANCH_ID]);
    expect((await read(cairoRoom)).status).toBe(200);
    expect((await setBase(cairoRoom, 5_000)).status).toBe(403);
    session.staff = manager([TEST_BRANCH_ID]);
    expect((await setBase(cairoRoom, 5_000)).status).toBe(200);
    expect((await read(gizaRoom)).status).toBe(404);
    expect((await createPeriod(gizaRoom)).status).toBe(404);
    const foreign = await client.ratePeriod.create({
      data: {
        id: "foreign-period",
        roomTypeId: gizaRoom,
        startDate: new Date("2031-06-01T00:00:00Z"),
        endDate: new Date("2031-06-03T00:00:00Z"),
        amountMinor: 6_000,
        updatedAt: new Date(),
      },
    });
    expect((await patch(foreign.id, { label: "Hidden" })).status).toBe(404);
    expect((await deactivate(foreign.id)).status).toBe(404);
    expect(
      await client.ratePeriod.findUniqueOrThrow({ where: { id: foreign.id } }),
    ).toMatchObject({ active: true, label: null });
    expect(
      await client.auditEvent.count({ where: { entityId: foreign.id } }),
    ).toBe(0);
    session.staff = manager([]);
    expect((await read(cairoRoom)).status).toBe(404);
  });

  it("rolls back a base creation when the audit append fails", async () => {
    const useCases = rateUseCases(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit down");
        },
      }),
    });
    await expect(
      useCases.manage.setBaseRate(admin, cairoRoom, {
        amount: amount(5_000),
      }),
    ).rejects.toThrow("audit down");
    expect(
      await client.roomBaseRate.findUnique({
        where: { roomTypeId: cairoRoom },
      }),
    ).toBeNull();
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("rolls back existing base and every period mutation when audit append fails", async () => {
    const failAudit = {
      audit: () => ({
        append: async () => {
          throw new Error("audit down");
        },
      }),
    };
    await client.roomBaseRate.create({
      data: {
        roomTypeId: cairoRoom,
        amountMinor: 5_000,
        updatedAt: new Date("2031-01-01T00:00:00Z"),
      },
    });
    const baseBefore = await client.roomBaseRate.findUniqueOrThrow({
      where: { roomTypeId: cairoRoom },
    });
    await expect(
      rateUseCases(client, failAudit).manage.setBaseRate(admin, cairoRoom, {
        amount: amount(6_000),
      }),
    ).rejects.toThrow("audit down");
    expect(
      await client.roomBaseRate.findUniqueOrThrow({
        where: { roomTypeId: cairoRoom },
      }),
    ).toEqual(baseBefore);

    await expect(
      rateUseCases(client, failAudit).manage.createPeriod(admin, cairoRoom, {
        startDate: "2031-07-01",
        endDate: "2031-07-03",
        amount: amount(6_000),
      }),
    ).rejects.toThrow("audit down");
    expect(
      await client.ratePeriod.count({ where: { roomTypeId: cairoRoom } }),
    ).toBe(0);

    await client.ratePeriod.createMany({
      data: [
        {
          id: "rollback-update",
          roomTypeId: cairoRoom,
          startDate: new Date("2031-07-01T00:00:00Z"),
          endDate: new Date("2031-07-03T00:00:00Z"),
          amountMinor: 6_000,
          label: "Before",
          updatedAt: new Date("2031-01-01T00:00:00Z"),
        },
        {
          id: "rollback-deactivate",
          roomTypeId: cairoRoom,
          startDate: new Date("2031-07-03T00:00:00Z"),
          endDate: new Date("2031-07-05T00:00:00Z"),
          amountMinor: 7_000,
          updatedAt: new Date("2031-01-01T00:00:00Z"),
        },
      ],
    });
    const updateBefore = await client.ratePeriod.findUniqueOrThrow({
      where: { id: "rollback-update" },
    });
    await expect(
      rateUseCases(client, failAudit).manage.updatePeriod(
        admin,
        "rollback-update",
        { label: "After" },
      ),
    ).rejects.toThrow("audit down");
    expect(
      await client.ratePeriod.findUniqueOrThrow({
        where: { id: "rollback-update" },
      }),
    ).toEqual(updateBefore);

    const deactivateBefore = await client.ratePeriod.findUniqueOrThrow({
      where: { id: "rollback-deactivate" },
    });
    await expect(
      rateUseCases(client, failAudit).manage.deactivatePeriod(
        admin,
        "rollback-deactivate",
      ),
    ).rejects.toThrow("audit down");
    expect(
      await client.ratePeriod.findUniqueOrThrow({
        where: { id: "rollback-deactivate" },
      }),
    ).toEqual(deactivateBefore);
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("bounds S32 exclusion waits at five seconds with a retry response", async () => {
    const holder = createTestClient();
    const observer = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.ratePeriod.create({
          data: {
            id: "held-overlap",
            roomTypeId: cairoRoom,
            startDate: new Date("2031-06-01T00:00:00Z"),
            endDate: new Date("2031-06-03T00:00:00Z"),
            amountMinor: 6_000,
            updatedAt: new Date(),
          },
        });
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const waiting = createPeriod(cairoRoom, {
        startDate: "2031-06-02",
        endDate: "2031-06-04",
      });
      await waitForRatePeriodInsertLock(observer);
      const response = await waiting;
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toMatchObject({ code: "TRY_AGAIN" });
      expect(await client.auditEvent.count()).toBe(0);
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
      await observer.$disconnect();
    }
    expect(
      await client.ratePeriod.count({ where: { roomTypeId: cairoRoom } }),
    ).toBe(1);
    expect(await client.auditEvent.count()).toBe(0);
  }, 20_000);

  it("does not take the listing inventory lock for a base write", async () => {
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Room" WHERE id = ${cairoRoom} FOR NO KEY UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const write = rateUseCases(client).manage.setBaseRate(admin, cairoRoom, {
        amount: amount(5_000),
      });
      await expect(
        Promise.race([
          write,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("base write waited for inventory lock")),
              2_000,
            ),
          ),
        ]),
      ).resolves.toMatchObject({ ok: true });
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  });

  it("maps a period row lock timeout to 503 with Retry-After 5", async () => {
    const created = await createPeriod(cairoRoom);
    const id = (await created.json()).id as string;
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "RatePeriod" WHERE id = ${id} FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const response = await patch(id, { label: "Waited" });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toMatchObject({ code: "TRY_AGAIN" });
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  }, 20_000);

  it("proves first base writes wait and preserve the committed audit chain over 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const room = (await createRoom(client)).id;
        const held = deferred();
        const release = deferred();
        const holding = rateUseCases(holder, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
            },
          }),
        }).manage.setBaseRate(admin, room, {
          amount: amount(5_000),
        });
        await held.promise;
        const probe = backendPid();
        const waiting = rateUseCases(waiter, {
          onBackend: probe.onBackend,
        }).manage.setBaseRate(admin, room, {
          amount: amount(6_000),
        });
        await waitForDatabaseLock(observer, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a.ok && b.ok).toBe(true);
        const audits = await client.auditEvent.findMany({
          where: { entityId: room, action: "room-base-rate.updated" },
        });
        expect(audits).toHaveLength(2);
        const changes = audits.map(
          (event) =>
            event.changes as {
              before: { amountMinor: number } | null;
              after: { amountMinor: number };
            },
        );
        const initial = changes.find((change) => change.before === null)!;
        const successor = changes.find((change) => change.before !== null)!;
        expect(initial.after.amountMinor).toBe(5_000);
        expect(successor.before).toEqual(initial.after);
        expect(successor.after.amountMinor).toBe(6_000);
        expect(
          await client.roomBaseRate.findUniqueOrThrow({
            where: { roomTypeId: room },
            select: { amountMinor: true },
          }),
        ).toEqual({ amountMinor: successor.after.amountMinor });
      }
    });
  }, 60_000);

  it("audits a null predecessor after a competing first base write rolls back, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const room = (await createRoom(client)).id;
        const held = deferred();
        const release = deferred();
        const holding = rateUseCases(holder, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
              throw new Error("rollback first writer");
            },
          }),
        }).manage.setBaseRate(admin, room, {
          amount: amount(5_000),
        });
        await held.promise;
        const probe = backendPid();
        const waiting = rateUseCases(waiter, {
          onBackend: probe.onBackend,
        }).manage.setBaseRate(admin, room, {
          amount: amount(6_000),
        });
        await waitForDatabaseLock(observer, await probe.pid.promise);
        release.resolve();
        await expect(holding).rejects.toThrow("rollback first writer");
        await expect(waiting).resolves.toMatchObject({ ok: true });
        const audits = await client.auditEvent.findMany({
          where: { entityId: room, action: "room-base-rate.updated" },
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]?.changes).toEqual({
          before: null,
          after: amount(6_000),
        });
        expect(
          await client.roomBaseRate.findUniqueOrThrow({
            where: { roomTypeId: room },
            select: { amountMinor: true },
          }),
        ).toEqual({ amountMinor: 6_000 });
      }
    });
  }, 60_000);

  it("maps 20 observed overlapping period waits to one success and one conflict", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const room = (await createRoom(client)).id;
        const beforeAuditCount = await client.auditEvent.count({
          where: { entityType: "RatePeriod" },
        });
        const held = deferred();
        const release = deferred();
        const holding = rateUseCases(holder, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
            },
          }),
        }).manage.createPeriod(admin, room, {
          startDate: "2031-06-01",
          endDate: "2031-06-05",
          amount: amount(5_000),
        });
        await held.promise;
        const probe = backendPid();
        const waiting = rateUseCases(waiter, {
          onBackend: probe.onBackend,
        }).manage.createPeriod(admin, room, {
          startDate: "2031-06-02",
          endDate: "2031-06-06",
          amount: amount(6_000),
        });
        await waitForDatabaseLock(observer, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a).toMatchObject({ ok: true });
        expect(b).toMatchObject({
          ok: false,
          error: { code: "CONFLICT" },
        });
        const rows = await client.ratePeriod.findMany({
          where: { roomTypeId: room },
          select: { id: true },
        });
        expect(rows).toHaveLength(1);
        expect(
          await client.auditEvent.findMany({
            where: { entityType: "RatePeriod", entityId: rows[0]!.id },
          }),
        ).toHaveLength(1);
        expect(
          await client.auditEvent.count({
            where: { entityType: "RatePeriod" },
          }),
        ).toBe(beforeAuditCount + 1);
      }
    });
  }, 60_000);

  it("lets a waiting period creator succeed after the overlapping holder rolls back, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const room = (await createRoom(client)).id;
        const beforeAuditCount = await client.auditEvent.count({
          where: { entityType: "RatePeriod" },
        });
        const held = deferred();
        const release = deferred();
        const holding = rateUseCases(holder, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
              throw new Error("rollback first period");
            },
          }),
        }).manage.createPeriod(admin, room, {
          startDate: "2031-06-01",
          endDate: "2031-06-05",
          amount: amount(5_000),
        });
        await held.promise;
        const probe = backendPid();
        const waiting = rateUseCases(waiter, {
          onBackend: probe.onBackend,
        }).manage.createPeriod(admin, room, {
          startDate: "2031-06-02",
          endDate: "2031-06-06",
          amount: amount(6_000),
        });
        await waitForDatabaseLock(observer, await probe.pid.promise);
        release.resolve();
        await expect(holding).rejects.toThrow("rollback first period");
        await expect(waiting).resolves.toMatchObject({ ok: true });
        const rows = await client.ratePeriod.findMany({
          where: { roomTypeId: room },
          select: { id: true, amountMinor: true },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.amountMinor).toBe(6_000);
        expect(
          await client.auditEvent.count({
            where: { entityType: "RatePeriod" },
          }),
        ).toBe(beforeAuditCount + 1);
        expect(
          await client.auditEvent.count({
            where: { entityType: "RatePeriod", entityId: rows[0]!.id },
          }),
        ).toBe(1);
      }
    });
  }, 60_000);

  it("audits the committed amount as the predecessor when two writers update an existing base rate, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const room = (await createRoom(client)).id;
        await client.roomBaseRate.create({
          data: {
            roomTypeId: room,
            amountMinor: 4_000,
            updatedAt: new Date(),
          },
        });
        const held = deferred();
        const release = deferred();
        const holding = rateUseCases(holder, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
            },
          }),
        }).manage.setBaseRate(admin, room, { amount: amount(5_000) });
        await held.promise;
        const probe = backendPid();
        const waiting = rateUseCases(waiter, {
          onBackend: probe.onBackend,
        }).manage.setBaseRate(admin, room, { amount: amount(6_000) });
        await waitForDatabaseLock(observer, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a.ok && b.ok).toBe(true);
        const changes = (
          await client.auditEvent.findMany({
            where: { entityId: room, action: "room-base-rate.updated" },
          })
        ).map(
          (event) =>
            event.changes as {
              before: { amountMinor: number } | null;
              after: { amountMinor: number };
            },
        );
        expect(changes).toHaveLength(2);
        const first = changes.find((c) => c.before?.amountMinor === 4_000)!;
        const second = changes.find((c) => c.before?.amountMinor === 5_000)!;
        expect(first.after.amountMinor).toBe(5_000);
        expect(second.after.amountMinor).toBe(6_000);
        expect(
          await client.roomBaseRate.findUniqueOrThrow({
            where: { roomTypeId: room },
            select: { amountMinor: true },
          }),
        ).toEqual({ amountMinor: 6_000 });
      }
    });
  }, 60_000);
});

describe("PrismaRateRepository", () => {
  it.each([
    ["23P01", "exclusion violation"],
    ["40P01", "deadlock between competing exclusion checks"],
  ])(
    "maps SQLSTATE %s on a period write to a safe overlap conflict (%s)",
    async (sqlState) => {
      const failing = {
        $executeRaw: async () => 0,
        ratePeriod: {
          create: async () => {
            throw Object.assign(new Error("provider detail"), { sqlState });
          },
          update: async () => {
            throw Object.assign(new Error("provider detail"), { sqlState });
          },
        },
      } as never;
      const repository = new PrismaRateRepository(failing);
      const range = StayRange.create(
        LocalDate.parse("2031-06-01"),
        LocalDate.parse("2031-06-05"),
      );
      const created = await repository.createPeriod({
        id: "p1",
        roomTypeId: "r1",
        range,
        amount: Money.create(amount(5_000)),
        label: null,
        updatedById: "actor-admin",
        at: new Date(),
      });
      const updated = await repository.updatePeriod("p1", {
        label: "x",
        updatedById: "actor-admin",
        at: new Date(),
      });
      for (const result of [created, updated]) {
        expect(result).toMatchObject({
          ok: false,
          error: {
            code: "CONFLICT",
            fieldErrors: {
              startDate: expect.any(Array),
              endDate: expect.any(Array),
            },
          },
        });
        expect(JSON.stringify(result)).not.toContain("provider detail");
      }
    },
  );

  it("rethrows unrelated period write failures", async () => {
    const failing = {
      $executeRaw: async () => 0,
      ratePeriod: {
        create: async () => {
          throw Object.assign(new Error("boom"), { sqlState: "XX000" });
        },
      },
    } as never;
    await expect(
      new PrismaRateRepository(failing).createPeriod({
        id: "p1",
        roomTypeId: "r1",
        range: StayRange.create(
          LocalDate.parse("2031-06-01"),
          LocalDate.parse("2031-06-05"),
        ),
        amount: Money.create(amount(5_000)),
        label: null,
        updatedById: "actor-admin",
        at: new Date(),
      }),
    ).rejects.toThrow("boom");
  });

  it("lists inactive intersecting periods and excludes adjacent periods", async () => {
    await client.ratePeriod.createMany({
      data: [
        {
          id: "inside",
          roomTypeId: cairoRoom,
          startDate: new Date("2031-06-01T00:00:00Z"),
          endDate: new Date("2031-06-03T00:00:00Z"),
          amountMinor: 6_000,
          active: false,
          updatedAt: new Date(),
        },
        {
          id: "adjacent",
          roomTypeId: cairoRoom,
          startDate: new Date("2031-06-05T00:00:00Z"),
          endDate: new Date("2031-06-06T00:00:00Z"),
          amountMinor: 7_000,
          updatedAt: new Date(),
        },
      ],
    });
    const result = await new PrismaRateRepository(client).read(
      cairoRoom,
      StayRange.create(
        LocalDate.parse("2031-06-01"),
        LocalDate.parse("2031-06-05"),
      ),
    );
    expect(result.periods.map((item) => item.id)).toEqual(["inside"]);
    expect(result.periods[0]?.active).toBe(false);
  });
});
