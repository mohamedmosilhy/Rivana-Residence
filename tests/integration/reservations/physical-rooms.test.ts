import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationConsumptionReader } from "@/application/inventory";
import { success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { PrismaPhysicalRoomRepository } from "@/infrastructure/db/prisma/repositories/reservations/inventory/physical-room-repository";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred } from "./support/concurrency";
import { physicalRoomUseCase } from "./support/physical-rooms";

// M6-T5: physical units through real repositories, the unit of work, the
// inventory guard, and the real Route Handlers on PostgreSQL. Only the Next
// runtime pieces and the staff session lookup are replaced.

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
  "@/app/api/v1/staff/branches/[id]/physical-rooms/route"
);
const { PATCH: patchRoute } = await import(
  "@/app/api/v1/staff/physical-rooms/[id]/route"
);

const client = createTestClient();
const GIZA = "branch-giza-0000000000000000";
const ORIGIN = "http://localhost:3000";

const principal = (
  role: StaffPrincipal["role"],
  branchIds: readonly string[] = [],
): StaffPrincipal => ({
  id: "actor-admin",
  name: "Test",
  email: "t@example.test",
  role,
  sessionId: "s",
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

let cairoRoom: string;
let gizaRoom: string;

async function seedUnit(
  roomTypeId: string,
  branchId: string,
  label: string,
  active = true,
) {
  return client.physicalRoom.create({
    data: {
      id: `unit-${branchId.slice(0, 4)}-${label}`,
      branchId,
      roomTypeId,
      label,
      active,
    },
  });
}

const post = (branchId: string, body: unknown) =>
  createRoute(
    request("POST", `/api/v1/staff/branches/${branchId}/physical-rooms`, body),
    params({ id: branchId }),
  );
const patch = (id: string, body: unknown) =>
  patchRoute(
    request("PATCH", `/api/v1/staff/physical-rooms/${id}`, body),
    params({ id }),
  );
const list = (branchId: string) =>
  listRoute(
    request("GET", `/api/v1/staff/branches/${branchId}/physical-rooms`),
    params({ id: branchId }),
  );

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
  session.staff = principal("ADMIN");
});

describe("PhysicalRoomRepository", () => {
  it("lists only the branch's units, inactive included, in stable order", async () => {
    const early = (await createRoom(client, { sortOrder: 1 })).id;
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "B2");
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "A1", false);
    await seedUnit(early, TEST_BRANCH_ID, "Z9");
    await seedUnit(gizaRoom, GIZA, "A1");

    const units = await new PrismaPhysicalRoomRepository(client).listByBranch(
      TEST_BRANCH_ID,
    );
    expect(units.map((unit) => [unit.roomTypeId, unit.label])).toEqual([
      [early, "Z9"],
      [cairoRoom, "A1"],
      [cairoRoom, "B2"],
    ]);
    expect(units[1]).toMatchObject({
      active: false,
      notes: null,
      branchId: TEST_BRANCH_ID,
    });
    expect(units[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("hides units outside the visible branches, including for an empty scope", async () => {
    const giza = await seedUnit(gizaRoom, GIZA, "G1");
    const repository = new PrismaPhysicalRoomRepository(client);
    expect(await repository.findVisible(giza.id, "ALL")).not.toBeNull();
    expect(await repository.findVisible(giza.id, [GIZA])).not.toBeNull();
    expect(await repository.findVisible(giza.id, [TEST_BRANCH_ID])).toBeNull();
    expect(await repository.findVisible(giza.id, [])).toBeNull();
    await client.$transaction(async (transaction) => {
      const scoped = new PrismaPhysicalRoomRepository(transaction);
      expect(await scoped.lockVisible(giza.id, [TEST_BRANCH_ID])).toEqual(
        success(null),
      );
      expect(await scoped.lockVisible(giza.id, [])).toEqual(success(null));
      expect(await scoped.lockVisible(giza.id, [GIZA])).toMatchObject({
        ok: true,
        value: { id: giza.id },
      });
    });
  });

  it("refuses a listing from another branch at the database boundary", async () => {
    const repository = new PrismaPhysicalRoomRepository(client);
    const result = await repository.create({
      id: "unit-bad",
      branchId: TEST_BRANCH_ID,
      roomTypeId: gizaRoom,
      label: "X",
      notes: null,
      createdById: "actor-admin",
      at: new Date(),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await client.physicalRoom.count()).toBe(0);
  });
});

describe("S22 POST physical-rooms", () => {
  it("creates an active unit, audits it atomically, and returns Location", async () => {
    const response = await post(TEST_BRANCH_ID, {
      roomTypeId: cairoRoom,
      label: " 101 ",
      notes: "Private owner note",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      branchId: TEST_BRANCH_ID,
      roomTypeId: cairoRoom,
      label: "101",
      active: true,
      notes: "Private owner note",
    });
    expect(response.headers.get("location")).toBe(
      `/api/v1/staff/physical-rooms/${body.id}`,
    );
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);

    const audits = await client.auditEvent.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "physical-room.created",
      entityType: "PhysicalRoom",
      entityId: body.id,
      branchId: TEST_BRANCH_ID,
      actorId: "actor-admin",
      changes: {
        roomTypeId: cairoRoom,
        label: "101",
        active: true,
        notesChanged: true,
      },
    });
    expect(JSON.stringify(audits)).not.toContain("Private owner note");
  });

  it("returns 409 with a label field error for a duplicate label and no audit", async () => {
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const response = await post(TEST_BRANCH_ID, {
      roomTypeId: cairoRoom,
      label: "101",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      code: "CONFLICT",
      fieldErrors: { label: [expect.any(String)] },
    });
    expect(JSON.stringify(body)).not.toMatch(/Prisma|constraint|23505|P2002/i);
    expect(await client.physicalRoom.count()).toBe(1);
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("treats labels as exact and case sensitive, and per branch", async () => {
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "a1");
    expect(
      (await post(TEST_BRANCH_ID, { roomTypeId: cairoRoom, label: "A1" }))
        .status,
    ).toBe(201);
    expect(
      (await post(GIZA, { roomTypeId: gizaRoom, label: "a1" })).status,
    ).toBe(201);
  });

  it("hides a listing owned by another branch as 404", async () => {
    const response = await post(TEST_BRANCH_ID, {
      roomTypeId: gizaRoom,
      label: "X",
    });
    expect(response.status).toBe(404);
    expect(await client.physicalRoom.count()).toBe(0);
  });

  it("rolls back the unit when the audit append fails", async () => {
    const useCase = physicalRoomUseCase(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit unavailable");
        },
      }),
    });
    await expect(
      useCase.create(principal("ADMIN"), TEST_BRANCH_ID, {
        roomTypeId: cairoRoom,
        label: "R1",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(await client.physicalRoom.count()).toBe(0);
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("returns safe 422 field errors and rejects unknown fields", async () => {
    for (const body of [
      { roomTypeId: cairoRoom, label: "" },
      { roomTypeId: cairoRoom, label: "x".repeat(41) },
      { roomTypeId: cairoRoom, label: "ok", notes: "n".repeat(501) },
      { roomTypeId: cairoRoom, label: "ok", branchId: GIZA },
      { roomTypeId: cairoRoom, label: "ok", active: false },
    ]) {
      const response = await post(TEST_BRANCH_ID, body);
      expect(response.status).toBe(422);
      expect((await response.json()).fieldErrors).toBeDefined();
    }
    expect(await client.physicalRoom.count()).toBe(0);
  });
});

describe("S21 GET physical-rooms", () => {
  it("returns every unit of the explicit branch only", async () => {
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "102", false);
    await seedUnit(gizaRoom, GIZA, "G1");
    session.staff = principal("RECEPTIONIST", [TEST_BRANCH_ID]);
    const response = await list(TEST_BRANCH_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.items.map((item: { label: string }) => item.label)).toEqual([
      "101",
      "102",
    ]);
    expect(body.items[1].active).toBe(false);
  });

  it("returns 403 for an unassigned branch and 404 for a missing branch", async () => {
    session.staff = principal("MANAGER", [TEST_BRANCH_ID]);
    expect((await list(GIZA)).status).toBe(403);
    session.staff = principal("ADMIN");
    expect((await list("missing-branch")).status).toBe(404);
  });

  it("returns 401 when signed out and 403 for an editor", async () => {
    session.staff = null;
    expect((await list(TEST_BRANCH_ID)).status).toBe(401);
    session.staff = principal("EDITOR");
    expect((await list(TEST_BRANCH_ID)).status).toBe(403);
  });
});

describe("S23 PATCH physical-rooms/{id}", () => {
  it("edits label and notes, audits before and after without note text", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const response = await patch(unit.id, {
      label: "102",
      notes: "Do not leak this",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: unit.id,
      label: "102",
      notes: "Do not leak this",
      branchId: TEST_BRANCH_ID,
      roomTypeId: cairoRoom,
    });
    const audits = await client.auditEvent.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "physical-room.updated",
      changes: { label: { from: "101", to: "102" }, notesChanged: true },
    });
    expect(JSON.stringify(audits)).not.toContain("Do not leak this");
  });

  it("deactivates and reactivates with one audit event each, and no-ops add none", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    expect((await patch(unit.id, { active: false })).status).toBe(200);
    expect((await patch(unit.id, { active: false })).status).toBe(200);
    expect((await patch(unit.id, { active: true })).status).toBe(200);
    expect((await patch(unit.id, { active: true, label: "101" })).status).toBe(
      200,
    );
    const audits = await client.auditEvent.findMany({
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.changes)).toEqual([
      { active: { from: true, to: false } },
      { active: { from: false, to: true } },
    ]);
  });

  it("returns 409 for a duplicate label and leaves the unit and audit unchanged", async () => {
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const other = await seedUnit(cairoRoom, TEST_BRANCH_ID, "102");
    const response = await patch(other.id, { label: "101" });
    expect(response.status).toBe(409);
    expect((await response.json()).fieldErrors.label).toBeDefined();
    expect(
      (await client.physicalRoom.findUniqueOrThrow({ where: { id: other.id } }))
        .label,
    ).toBe("102");
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("cannot move a unit between branches or listings", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    for (const body of [
      { branchId: GIZA },
      { roomTypeId: gizaRoom },
      { label: "x", branchId: GIZA },
    ]) {
      expect((await patch(unit.id, body)).status).toBe(422);
    }
    expect(
      await client.physicalRoom.findUniqueOrThrow({ where: { id: unit.id } }),
    ).toMatchObject({ branchId: TEST_BRANCH_ID, roomTypeId: cairoRoom });
  });

  it("answers 404 identically for a missing unit and another branch's unit", async () => {
    const foreign = await seedUnit(gizaRoom, GIZA, "G1");
    session.staff = principal("MANAGER", [TEST_BRANCH_ID]);
    const hidden = await patch(foreign.id, { label: "Taken" });
    const missing = await patch("no-such-unit", { label: "Taken" });
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    const strip = ({ requestId, ...rest }: Record<string, unknown>) => {
      void requestId;
      return rest;
    };
    expect(strip(await hidden.json())).toEqual(strip(await missing.json()));
    expect(
      (
        await client.physicalRoom.findUniqueOrThrow({
          where: { id: foreign.id },
        })
      ).label,
    ).toBe("G1");
  });

  it("refuses receptionists and editors, and lets a branch manager through", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    session.staff = principal("RECEPTIONIST", [TEST_BRANCH_ID]);
    expect((await patch(unit.id, { label: "x" })).status).toBe(403);
    session.staff = principal("EDITOR");
    expect((await patch(unit.id, { label: "x" })).status).toBe(403);
    session.staff = null;
    expect((await patch(unit.id, { label: "x" })).status).toBe(401);
    session.staff = principal("MANAGER", [TEST_BRANCH_ID]);
    expect((await patch(unit.id, { label: "ok" })).status).toBe(200);
  });

  it("rejects cross-site requests before anything runs", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const response = await patchRoute(
      new Request(`${ORIGIN}/api/v1/staff/physical-rooms/${unit.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ label: "x" }),
      }),
      params({ id: unit.id }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("CROSS_SITE_REQUEST");
  });

  it("returns 422 for empty and unknown-field patches", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    expect((await patch(unit.id, {})).status).toBe(422);
    expect((await patch(unit.id, { colour: "red" })).status).toBe(422);
    expect((await patch(unit.id, { notes: "n".repeat(501) })).status).toBe(422);
  });

  it("stores blank notes as null over HTTP, on create and update", async () => {
    const created = await post(TEST_BRANCH_ID, {
      roomTypeId: cairoRoom,
      label: "N1",
      notes: "   ",
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.notes).toBeNull();
    const stored = await client.physicalRoom.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored.notes).toBeNull();

    await patch(body.id, { notes: "keep" });
    const cleared = await patch(body.id, { notes: "" });
    expect((await cleared.json()).notes).toBeNull();
    expect(
      (await client.physicalRoom.findUniqueOrThrow({ where: { id: body.id } }))
        .notes,
    ).toBeNull();
  });

  it("clears notes with null", async () => {
    const unit = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    await patch(unit.id, { notes: "keep" });
    const response = await patch(unit.id, { notes: null });
    expect((await response.json()).notes).toBeNull();
  });

  it("rolls back a deactivation, an edit, and an activation when the audit append fails", async () => {
    const active = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const inactive = await seedUnit(cairoRoom, TEST_BRANCH_ID, "102", false);
    const useCase = physicalRoomUseCase(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit unavailable");
        },
      }),
    });
    const admin = principal("ADMIN");
    await expect(
      useCase.update(admin, active.id, { active: false }),
    ).rejects.toThrow();
    await expect(
      useCase.update(admin, active.id, { label: "renamed" }),
    ).rejects.toThrow();
    await expect(
      useCase.update(admin, inactive.id, { active: true }),
    ).rejects.toThrow();
    const rows = await client.physicalRoom.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((row) => [row.label, row.active])).toEqual([
      ["101", true],
      ["102", false],
    ]);
    expect(await client.auditEvent.count()).toBe(0);
  });
});

// These tests inject sold nights and assignments through the consumption
// port. They prove the guard's reduction logic on a real database, not
// integration with real reservation consumption: the production adapter is
// empty until M8, which owns that verification.
describe("T-INV: deactivation against consumption", () => {
  const FAR = "2031-07-04";
  const consuming = (
    sold: number,
    assignments: readonly never[] = [],
  ): ReservationConsumptionReader => ({
    readSoldOnDates: async (input) =>
      input.nights
        .filter((night) => night.value === FAR)
        .map((night) => ({ roomTypeId: cairoRoom, night, sold })),
    readFutureSold: async (input) => [
      { roomTypeId: input.roomTypeId, night: LocalDate.parse(FAR), sold },
    ],
    readAssignments: async () => assignments,
  });

  it("refuses to take sold capacity away, naming the night, with nothing written", async () => {
    const only = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const response = await physicalRoomUseCase(client, {
      consumption: consuming(1),
      clock: () => new Date("2027-03-01T10:00:00Z"),
    }).update(principal("ADMIN"), only.id, { active: false });
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_UNAVAILABLE",
        context: { firstUnavailableNight: FAR, roomTypeId: cairoRoom },
      },
    });
    expect(
      (await client.physicalRoom.findUniqueOrThrow({ where: { id: only.id } }))
        .active,
    ).toBe(true);
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("allows deactivation while another active unit covers the sale", async () => {
    const first = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "102");
    const result = await physicalRoomUseCase(client, {
      consumption: consuming(1),
    }).update(principal("ADMIN"), first.id, { active: false });
    expect(result.ok).toBe(true);
  });

  it("does not count a blocked unit twice", async () => {
    const first = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    await seedUnit(cairoRoom, TEST_BRANCH_ID, "102");
    await client.inventoryBlock.create({
      data: {
        id: "block-1",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: first.id,
        startDate: new Date("2031-07-01T00:00:00Z"),
        endDate: new Date("2031-07-10T00:00:00Z"),
        reason: "MAINTENANCE",
        createdById: "actor-admin",
      },
    });
    const result = await physicalRoomUseCase(client, {
      consumption: consuming(1),
    }).update(principal("ADMIN"), first.id, { active: false });
    expect(result.ok).toBe(true);
  });

  it("refuses when the unit holds a consuming assignment", async () => {
    const only = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const { StayRange } = await import("@/domain/shared/stay-range");
    const reader: ReservationConsumptionReader = {
      readSoldOnDates: async () => [],
      readFutureSold: async () => [],
      readAssignments: async () => [
        StayRange.create(
          LocalDate.parse("2099-01-01"),
          LocalDate.parse("2099-01-03"),
        ),
      ],
    };
    const result = await physicalRoomUseCase(client, {
      consumption: reader,
    }).update(principal("ADMIN"), only.id, { active: false });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(
      (await client.physicalRoom.findUniqueOrThrow({ where: { id: only.id } }))
        .active,
    ).toBe(true);
  });
});

describe("listing lock behavior through HTTP", () => {
  it("returns 503 TRY_AGAIN with Retry-After 5 when the listing is locked, but edits, creation, and activation do not wait", async () => {
    const inactive = await seedUnit(cairoRoom, TEST_BRANCH_ID, "100", false);
    const target = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Room" WHERE id = ${cairoRoom} FOR NO KEY UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 30_000 },
    );
    try {
      await held.promise;
      // Not reductions: no listing lock, so they finish while it is held.
      expect((await patch(target.id, { label: "101b" })).status).toBe(200);
      expect((await patch(inactive.id, { active: true })).status).toBe(200);
      expect(
        (await post(TEST_BRANCH_ID, { roomTypeId: cairoRoom, label: "103" }))
          .status,
      ).toBe(201);

      const started = Date.now();
      const response = await patch(target.id, { active: false });
      expect(Date.now() - started).toBeGreaterThanOrEqual(4_500);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      const problem = await response.json();
      expect(response.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(problem).toMatchObject({ status: 503, code: "TRY_AGAIN" });
      expect(JSON.stringify(problem)).not.toMatch(
        /55P03|lock_timeout|FOR UPDATE|FOR NO KEY|Prisma|PhysicalRoom"|stack|postgres/i,
      );
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
    expect(
      (
        await client.physicalRoom.findUniqueOrThrow({
          where: { id: target.id },
        })
      ).active,
    ).toBe(true);
  }, 30_000);
});

describe("unit row lock timeout", () => {
  it("returns 503 TRY_AGAIN, not 500, when a plain edit waits on a locked unit row", async () => {
    const target = await seedUnit(cairoRoom, TEST_BRANCH_ID, "101");
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "PhysicalRoom" WHERE id = ${target.id} FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 30_000 },
    );
    try {
      await held.promise;
      const response = await patch(target.id, { label: "102" });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
    expect(
      (
        await client.physicalRoom.findUniqueOrThrow({
          where: { id: target.id },
        })
      ).label,
    ).toBe("101");
    expect(await client.auditEvent.count()).toBe(0);
  }, 30_000);
});
