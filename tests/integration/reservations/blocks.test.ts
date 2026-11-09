import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationConsumptionReader } from "@/application/inventory";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { PrismaBlockRepository } from "@/infrastructure/db/prisma/repositories/reservations/inventory/block-repository";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { blockUseCase } from "./support/blocks";
import { deferred } from "./support/concurrency";

// M6-T6: blocks through real repositories, the unit of work, the inventory
// guard, and the real Route Handlers on PostgreSQL.

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

const { GET: listRoute, POST: createRoute } = await import(
  "@/app/api/v1/staff/branches/[id]/blocks/route"
);
const { PATCH: patchRoute, DELETE: deleteRoute } = await import(
  "@/app/api/v1/staff/blocks/[id]/route"
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

const post = (branchId: string, body: unknown) =>
  createRoute(
    request("POST", `/api/v1/staff/branches/${branchId}/blocks`, body),
    params({ id: branchId }),
  );
const patch = (id: string, body: unknown) =>
  patchRoute(
    request("PATCH", `/api/v1/staff/blocks/${id}`, body),
    params({ id }),
  );
const del = (id: string) =>
  deleteRoute(request("DELETE", `/api/v1/staff/blocks/${id}`), params({ id }));
const list = (branchId: string, query: string) =>
  listRoute(
    request("GET", `/api/v1/staff/branches/${branchId}/blocks?${query}`),
    params({ id: branchId }),
  );

const date = (value: string) => LocalDate.parse(value);
const range = (from: string, to: string) =>
  StayRange.create(date(from), date(to));

let cairoRoom: string;
let gizaRoom: string;

async function seedUnit(
  roomTypeId: string,
  branchId: string,
  id: string,
  active = true,
) {
  return client.physicalRoom.create({
    data: { id, branchId, roomTypeId, label: id, active },
  });
}

const input = (overrides: Record<string, unknown> = {}) => ({
  physicalRoomId: "u1",
  startDate: "2031-07-10",
  endDate: "2031-07-12",
  reason: "MAINTENANCE",
  ...overrides,
});

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await createBranch(client, {
    id: GIZA,
    slug: "demo-giza",
    name: "Giza",
    sortOrder: 1,
  });
  cairoRoom = (await createRoom(client, { sortOrder: 5 })).id;
  gizaRoom = (await createRoom(client, { branchId: GIZA })).id;
  await seedUnit(cairoRoom, TEST_BRANCH_ID, "u1");
  await seedUnit(cairoRoom, TEST_BRANCH_ID, "u2");
  await seedUnit(gizaRoom, GIZA, "g1");
  session.staff = admin;
});

describe("BlockRepository", () => {
  it("round trips dates at UTC midnight and lists only overlapping, uncancelled blocks", async () => {
    const repository = new PrismaBlockRepository(client);
    const created = await repository.create({
      id: "b1",
      branchId: TEST_BRANCH_ID,
      physicalRoomId: "u1",
      range: range("2031-07-10", "2031-07-12"),
      reason: "OWNER_USE",
      note: null,
      createdById: "actor-admin",
      at: new Date("2031-01-01T00:00:00.000Z"),
    });
    expect(created).toMatchObject({
      ok: true,
      value: {
        roomTypeId: cairoRoom,
        range: { checkIn: { value: "2031-07-10" } },
      },
    });
    expect(
      (
        await repository.listOverlapping(
          TEST_BRANCH_ID,
          range("2031-07-12", "2031-07-14"),
        )
      ).length,
    ).toBe(0);
    expect(
      (
        await repository.listOverlapping(
          TEST_BRANCH_ID,
          range("2031-07-11", "2031-07-14"),
        )
      ).length,
    ).toBe(1);
    expect(
      (
        await repository.listOverlapping(
          GIZA,
          range("2031-07-01", "2031-08-01"),
        )
      ).length,
    ).toBe(0);
  });

  it("maps the exclusion constraint to a conflict with date field errors", async () => {
    const repository = new PrismaBlockRepository(client);
    const base = {
      branchId: TEST_BRANCH_ID,
      physicalRoomId: "u1",
      reason: "OTHER" as const,
      note: null,
      createdById: "actor-admin",
      at: new Date(),
    };
    await repository.create({
      ...base,
      id: "b1",
      range: range("2031-07-10", "2031-07-12"),
    });
    expect(
      await repository.create({
        ...base,
        id: "b2",
        range: range("2031-07-11", "2031-07-13"),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        fieldErrors: { startDate: expect.any(Array) },
      },
    });
    // Adjacent is fine (AC 3).
    expect(
      (
        await repository.create({
          ...base,
          id: "b3",
          range: range("2031-07-12", "2031-07-13"),
        })
      ).ok,
    ).toBe(true);
  });

  it("reports TRY_AGAIN from lockVisible when the block row stays locked", async () => {
    await client.inventoryBlock.create({
      data: {
        id: "b1",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "u1",
        startDate: new Date("2031-07-10T00:00:00Z"),
        endDate: new Date("2031-07-12T00:00:00Z"),
        reason: "OTHER",
        createdById: "actor-admin",
      },
    });
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "InventoryBlock" WHERE id = 'b1' FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 30_000 },
    );
    try {
      await held.promise;
      // Longer than the repository's 5 second lock timeout, like production.
      const result = await client.$transaction(
        (tx) => new PrismaBlockRepository(tx).lockVisible("b1", "ALL"),
        { timeout: 15_000 },
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "TRY_AGAIN" },
      });
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  }, 30_000);
});

describe("S25 create through REST", () => {
  it("creates, audits without the note, and sets Location", async () => {
    const response = await post(TEST_BRANCH_ID, input({ note: "private" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(response.headers.get("location")).toBe(
      `/api/v1/staff/blocks/${body.id}`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      branchId: TEST_BRANCH_ID,
      physicalRoomId: "u1",
      startDate: "2031-07-10",
      endDate: "2031-07-12",
      cancelledAt: null,
    });
    expect(body).not.toHaveProperty("roomTypeId");
    const audits = await client.auditEvent.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "inventory-block.created",
      entityType: "InventoryBlock",
      entityId: body.id,
      branchId: TEST_BRANCH_ID,
      actorId: "actor-admin",
    });
    expect(JSON.stringify(audits)).not.toContain("private");
  });

  it("refuses overlap with 409 and a date field error; adjacent succeeds", async () => {
    expect((await post(TEST_BRANCH_ID, input())).status).toBe(201);
    const overlap = await post(
      TEST_BRANCH_ID,
      input({ startDate: "2031-07-11", endDate: "2031-07-13" }),
    );
    expect(overlap.status).toBe(409);
    expect((await overlap.json()).fieldErrors.startDate).toBeDefined();
    expect(
      (
        await post(
          TEST_BRANCH_ID,
          input({ startDate: "2031-07-12", endDate: "2031-07-14" }),
        )
      ).status,
    ).toBe(201);
    // Same dates on another unit are independent.
    expect(
      (await post(TEST_BRANCH_ID, input({ physicalRoomId: "u2" }))).status,
    ).toBe(201);
    expect(await client.auditEvent.count()).toBe(3);
  });

  it("allows an overlapping block once the earlier one is cancelled", async () => {
    const first = await (await post(TEST_BRANCH_ID, input())).json();
    expect((await del(first.id)).status).toBe(204);
    expect((await post(TEST_BRANCH_ID, input())).status).toBe(201);
  });

  it("hides another branch's unit and refuses a foreign branch path", async () => {
    expect(
      (await post(TEST_BRANCH_ID, input({ physicalRoomId: "g1" }))).status,
    ).toBe(404);
    session.staff = { ...admin, role: "MANAGER", branchIds: [TEST_BRANCH_ID] };
    expect((await post(GIZA, input({ physicalRoomId: "g1" }))).status).toBe(
      403,
    );
    expect(await client.inventoryBlock.count()).toBe(0);
  });

  it("refuses an inactive unit and invalid bodies", async () => {
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "off", false);
    expect(
      (await post(TEST_BRANCH_ID, input({ physicalRoomId: "off" }))).status,
    ).toBe(409);
    for (const bad of [
      input({ endDate: "2031-07-10" }),
      input({ reason: "NOPE" }),
      { ...input(), branchId: TEST_BRANCH_ID },
    ]) {
      expect((await post(TEST_BRANCH_ID, bad)).status).toBe(422);
    }
  });

  it("refuses to oversell on injected sold nights and rolls back the audit", async () => {
    const consumption: ReservationConsumptionReader = {
      readSoldOnDates: async ({ roomTypeIds, nights }) =>
        nights
          .filter((night) => night.value === "2031-07-11")
          .map((night) => ({ roomTypeId: roomTypeIds[0]!, night, sold: 2 })),
      readFutureSold: async ({ roomTypeId }) => [
        { roomTypeId, night: date("2031-07-11"), sold: 2 },
      ],
      readAssignments: async () => [],
    };
    const useCase = blockUseCase(client, { consumption });
    // Two units, both sold out that night: blocking one oversells.
    const result = await useCase.create(admin, TEST_BRANCH_ID, input());
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: "2031-07-11", roomTypeId: cairoRoom },
      },
    });
    expect(await client.inventoryBlock.count()).toBe(0);
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("allows the block while one unit stays free", async () => {
    const consumption: ReservationConsumptionReader = {
      readSoldOnDates: async ({ roomTypeIds, nights }) =>
        nights
          .filter((night) => night.value === "2031-07-11")
          .map((night) => ({ roomTypeId: roomTypeIds[0]!, night, sold: 1 })),
      readFutureSold: async ({ roomTypeId }) => [
        { roomTypeId, night: date("2031-07-11"), sold: 1 },
      ],
      readAssignments: async () => [],
    };
    const result = await blockUseCase(client, { consumption }).create(
      admin,
      TEST_BRANCH_ID,
      input(),
    );
    expect(result.ok).toBe(true);
  });

  it("rolls back the block when the audit append fails", async () => {
    const useCase = blockUseCase(client, {
      audit: (inner: AuditLog) => ({
        append: async (event) => {
          await inner.append(event);
          throw new Error("audit failed");
        },
      }),
    });
    await expect(
      useCase.create(admin, TEST_BRANCH_ID, input()),
    ).rejects.toThrow("audit failed");
    expect(await client.inventoryBlock.count()).toBe(0);
    expect(await client.auditEvent.count()).toBe(0);
  });
});

describe("S24 list through REST", () => {
  it("lists overlapping uncancelled blocks and enforces the window", async () => {
    const kept = await (await post(TEST_BRANCH_ID, input())).json();
    const gone = await (
      await post(
        TEST_BRANCH_ID,
        input({ startDate: "2031-07-20", endDate: "2031-07-22" }),
      )
    ).json();
    await del(gone.id);
    const response = await list(
      TEST_BRANCH_ID,
      "from=2031-07-01&to=2031-07-31",
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map((item: { id: string }) => item.id),
    ).toEqual([kept.id]);
    expect(
      (await list(TEST_BRANCH_ID, "from=2031-07-12&to=2031-07-14")).status,
    ).toBe(200);
    expect(
      (
        await (
          await list(TEST_BRANCH_ID, "from=2031-07-12&to=2031-07-14")
        ).json()
      ).items,
    ).toEqual([]);
    expect(
      (await list(TEST_BRANCH_ID, "from=2031-01-01&to=2031-12-31")).status,
    ).toBe(422);
    expect((await list(TEST_BRANCH_ID, "from=2031-07-01")).status).toBe(400);
    expect(
      (await (await list(GIZA, "from=2031-07-01&to=2031-07-31")).json()).items,
    ).toEqual([]);
  });

  it("lets a receptionist read and write own branch only", async () => {
    session.staff = {
      ...admin,
      role: "RECEPTIONIST",
      branchIds: [TEST_BRANCH_ID],
    };
    expect(
      (await list(TEST_BRANCH_ID, "from=2031-07-01&to=2031-07-31")).status,
    ).toBe(200);
    expect((await list(GIZA, "from=2031-07-01&to=2031-07-31")).status).toBe(
      403,
    );
    expect((await post(TEST_BRANCH_ID, input())).status).toBe(201);
    session.staff = { ...admin, role: "EDITOR", branchIds: [] };
    expect(
      (await list(TEST_BRANCH_ID, "from=2031-07-01&to=2031-07-31")).status,
    ).toBe(403);
  });
});

describe("S26 update and S27 cancel through REST", () => {
  it("extends, audits before and after, and refuses overlap and cancelled blocks", async () => {
    const created = await (await post(TEST_BRANCH_ID, input())).json();
    await post(
      TEST_BRANCH_ID,
      input({ startDate: "2031-07-14", endDate: "2031-07-16" }),
    );
    const extended = await patch(created.id, { endDate: "2031-07-14" });
    expect(extended.status).toBe(200);
    expect((await extended.json()).endDate).toBe("2031-07-14");
    expect((await patch(created.id, { endDate: "2031-07-15" })).status).toBe(
      409,
    );
    const shortened = await patch(created.id, { endDate: "2031-07-11" });
    expect(shortened.status).toBe(200);

    const audit = await client.auditEvent.findMany({
      where: { entityId: created.id, action: "inventory-block.updated" },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((row) => row.changes)).toEqual([
      { endDate: { from: "2031-07-12", to: "2031-07-14" } },
      { endDate: { from: "2031-07-14", to: "2031-07-11" } },
    ]);

    expect((await del(created.id)).status).toBe(204);
    expect((await patch(created.id, { endDate: "2031-07-13" })).status).toBe(
      409,
    );
    expect((await patch(created.id, { note: "x" })).status).toBe(409);
  });

  it("note edits are audited without the note and need a field", async () => {
    const created = await (await post(TEST_BRANCH_ID, input())).json();
    const noted = await patch(created.id, { note: "  secret  " });
    expect((await noted.json()).note).toBe("secret");
    expect(
      (await (await patch(created.id, { note: "  " })).json()).note,
    ).toBeNull();
    expect((await patch(created.id, {})).status).toBe(422);
    expect((await patch(created.id, { startDate: "2031-07-01" })).status).toBe(
      422,
    );
    const rows = await client.auditEvent.findMany({
      where: { entityId: created.id, action: "inventory-block.updated" },
    });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("secret");
  });

  it("cancels once, repeats quietly, and hides blocks from other branches", async () => {
    const created = await (await post(TEST_BRANCH_ID, input())).json();
    expect((await del(created.id)).status).toBe(204);
    expect((await del(created.id)).status).toBe(204);
    expect(
      await client.auditEvent.count({
        where: { action: "inventory-block.cancelled" },
      }),
    ).toBe(1);
    expect(
      await client.inventoryBlock.findUniqueOrThrow({
        where: { id: created.id },
      }),
    ).toMatchObject({ cancelledById: "actor-admin" });
    expect((await del("nope")).status).toBe(404);

    const other = await (
      await post(
        TEST_BRANCH_ID,
        input({ startDate: "2031-08-01", endDate: "2031-08-03" }),
      )
    ).json();
    session.staff = { ...admin, role: "MANAGER", branchIds: [GIZA] };
    expect((await patch(other.id, { note: "x" })).status).toBe(404);
    expect((await del(other.id)).status).toBe(404);
    expect(
      (
        await client.inventoryBlock.findUniqueOrThrow({
          where: { id: other.id },
        })
      ).cancelledAt,
    ).toBeNull();
  });

  it("refuses an unsafe cross site request", async () => {
    const created = await (await post(TEST_BRANCH_ID, input())).json();
    const response = await patchRoute(
      new Request(`${ORIGIN}/api/v1/staff/blocks/${created.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ note: "x" }),
      }),
      params({ id: created.id }),
    );
    expect(response.status).toBe(403);
  });
});

describe("block row lock timeout through HTTP", () => {
  it("returns 503 TRY_AGAIN with Retry-After 5 for cancel, note edit, and extension, writing nothing", async () => {
    const created = await (await post(TEST_BRANCH_ID, input())).json();
    const auditsBefore = await client.auditEvent.count();
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "InventoryBlock" WHERE id = ${created.id} FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 30_000 },
    );
    try {
      await held.promise;
      const started = Date.now();
      // The row is locked elsewhere, so each waits out the 5 second timeout.
      const [cancelled, noted, extended] = await Promise.all([
        del(created.id),
        patch(created.id, { note: "later" }),
        patch(created.id, { endDate: "2031-07-14" }),
      ]);
      expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
      for (const response of [cancelled, noted, extended]) {
        expect(response.status).toBe(503);
        expect(response.headers.get("retry-after")).toBe("5");
        expect(response.headers.get("content-type")).toContain(
          "application/problem+json",
        );
        const body = await response.json();
        expect(body.code).toBe("TRY_AGAIN");
        expect(JSON.stringify(body)).not.toMatch(/lock|55P03|InventoryBlock/i);
      }
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
    const row = await client.inventoryBlock.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row).toMatchObject({ cancelledAt: null, note: null });
    expect(row.endDate.toISOString().slice(0, 10)).toBe("2031-07-12");
    expect(await client.auditEvent.count()).toBe(auditsBefore);
  }, 30_000);
});
