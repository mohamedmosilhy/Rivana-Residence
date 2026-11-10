import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { SearchAvailability } from "@/application/inventory";
import { PrismaAvailabilityCatalog } from "@/infrastructure/db/prisma/repositories/reservations/inventory/availability-catalog";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";

// M6-T8: the staff grid (API-S20) through the real Route Handler, and the
// public search use case, on real repositories and PostgreSQL.

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

const { GET: gridRoute } = await import(
  "@/app/api/v1/staff/branches/[id]/availability/route"
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
const staff = (
  role: StaffPrincipal["role"],
  branchIds: string[],
): StaffPrincipal => ({ ...admin, role, branchIds });

const grid = (branchId: string, query: string) =>
  gridRoute(
    new Request(
      `${ORIGIN}/api/v1/staff/branches/${branchId}/availability?${query}`,
    ),
    { params: Promise.resolve({ id: branchId }) },
  );

const NOW = new Date("2031-03-01T10:00:00.000Z");
const search = new SearchAvailability({
  catalog: new PrismaAvailabilityCatalog(client),
  reader: new PrismaInventoryReader(
    client,
    new EmptyReservationConsumptionReader(),
  ),
  rates: new PrismaRateRepository(client),
  clock: { now: () => NOW },
});

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);
const unit = (
  roomTypeId: string,
  branchId: string,
  id: string,
  active = true,
) =>
  client.physicalRoom.create({
    data: { id, branchId, roomTypeId, label: id, active },
  });

let published: string;
let draft: string;
let archived: string;
let unitless: string;
let gizaRoom: string;

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
  published = (await createRoom(client, { status: "PUBLISHED", sortOrder: 2 }))
    .id;
  draft = (await createRoom(client, { status: "DRAFT", sortOrder: 1 })).id;
  archived = (await createRoom(client, { status: "ARCHIVED", sortOrder: 3 }))
    .id;
  unitless = (await createRoom(client, { status: "PUBLISHED", sortOrder: 4 }))
    .id;
  gizaRoom = (await createRoom(client, { branchId: GIZA, status: "PUBLISHED" }))
    .id;
  await unit(published, TEST_BRANCH_ID, "p1");
  await unit(published, TEST_BRANCH_ID, "p2");
  await unit(published, TEST_BRANCH_ID, "p-off", false);
  await unit(draft, TEST_BRANCH_ID, "d1");
  await unit(archived, TEST_BRANCH_ID, "a1");
  await unit(gizaRoom, GIZA, "g1");
  session.staff = admin;
});

describe("API-S20 availability grid", () => {
  it("lists every listing in any status, in sortOrder, with every night", async () => {
    await client.inventoryBlock.create({
      data: {
        id: "b1",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "p2",
        startDate: utc("2031-06-11"),
        endDate: utc("2031-06-12"),
        reason: "MAINTENANCE",
        createdById: admin.id,
      },
    });
    const response = await grid(
      TEST_BRANCH_ID,
      "from=2031-06-10&to=2031-06-13",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as {
      roomTypes: { id: string; nights: Record<string, unknown>[] }[];
      lastSyncCheckpoint: unknown;
    };
    expect(body.roomTypes.map((room) => room.id)).toEqual([
      draft,
      published,
      archived,
      unitless,
    ]);
    expect(body.lastSyncCheckpoint).toBeNull();
    expect(body.roomTypes.every((room) => room.nights.length === 3)).toBe(true);
    const publishedRows = body.roomTypes[1]!.nights;
    expect(publishedRows).toEqual([
      { night: "2031-06-10", capacity: 2, sold: 0, free: 2, blocked: 0 },
      { night: "2031-06-11", capacity: 1, sold: 0, free: 1, blocked: 1 },
      { night: "2031-06-12", capacity: 2, sold: 0, free: 2, blocked: 0 },
    ]);
    const zero = body.roomTypes[3]!.nights;
    expect(
      zero.every(
        (row) =>
          row.capacity === 0 &&
          row.free === 0 &&
          row.sold === 0 &&
          row.blocked === 0,
      ),
    ).toBe(true);
  });

  it("isolates branches: writes in one branch never change the other's grid", async () => {
    const before = await (
      await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13")
    ).text();
    await unit(gizaRoom, GIZA, "g2");
    await client.inventoryBlock.create({
      data: {
        id: "bg",
        branchId: GIZA,
        physicalRoomId: "g1",
        startDate: utc("2031-06-10"),
        endDate: utc("2031-06-13"),
        reason: "OTHER",
        createdById: admin.id,
      },
    });
    expect(
      await (
        await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13")
      ).text(),
    ).toBe(before);
    const giza = (await (
      await grid(GIZA, "from=2031-06-10&to=2031-06-13")
    ).json()) as {
      roomTypes: {
        id: string;
        nights: { capacity: number; blocked: number }[];
      }[];
    };
    expect(giza.roomTypes.map((room) => room.id)).toEqual([gizaRoom]);
    expect(giza.roomTypes[0]!.nights[0]).toMatchObject({
      capacity: 1,
      blocked: 1,
    });
  });

  it("enforces authorization, branch scope, and the 400 versus 422 split", async () => {
    session.staff = null;
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13")).status,
    ).toBe(401);
    session.staff = staff("EDITOR", [TEST_BRANCH_ID]);
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13")).status,
    ).toBe(403);
    session.staff = staff("RECEPTIONIST", [GIZA]);
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13")).status,
    ).toBe(403);
    expect((await grid(GIZA, "from=2031-06-10&to=2031-06-13")).status).toBe(
      200,
    );
    session.staff = admin;
    expect(
      (await grid("missing-branch", "from=2031-06-10&to=2031-06-13")).status,
    ).toBe(404);
    // Calendar and length semantics are 422; structure and unknown keys are 400.
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-02-30&to=2031-03-02")).status,
    ).toBe(422);
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-09-10")).status,
    ).toBe(422);
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-10")).status,
    ).toBe(422);
    expect((await grid(TEST_BRANCH_ID, "from=2031-06-10")).status).toBe(400);
    expect(
      (await grid(TEST_BRANCH_ID, "from=2031-06-10&to=2031-06-13&x=1")).status,
    ).toBe(400);
  });
});

describe("SearchAvailability on PostgreSQL", () => {
  const stay = {
    checkIn: "2031-09-10",
    checkOut: "2031-09-14",
    adults: 2,
    children: 0,
  };

  async function rate(roomTypeId: string) {
    await client.roomBaseRate.create({
      data: { roomTypeId, amountMinor: 9000, currency: "USD" },
    });
  }

  it("returns published listings only, with the worked example total of $260.00", async () => {
    await client.ratePeriod.createMany({
      data: [
        {
          id: "w1",
          roomTypeId: published,
          startDate: utc("2031-09-10"),
          endDate: utc("2031-09-12"),
          amountMinor: 6000,
        },
        {
          id: "w2",
          roomTypeId: published,
          startDate: utc("2031-09-12"),
          endDate: utc("2031-09-20"),
          amountMinor: 7000,
        },
      ],
    });
    await rate(unitless);
    const result = await search.execute(TEST_BRANCH_ID, stay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results.map((r) => r.roomTypeId)).toEqual([
      published,
      unitless,
    ]);
    const [main, empty] = result.value.results;
    expect(main?.accommodationTotal?.amountMinor).toBe(26_000);
    expect(main).toMatchObject({ available: true, unitsAvailable: 2 });
    // A listing with no active unit is never invented as available.
    expect(empty).toMatchObject({
      available: false,
      unitsAvailable: 0,
      reason: "SOLD_OUT",
    });
  });

  it("reports UNPRICED when one night has no price and ignores inactive periods", async () => {
    await client.ratePeriod.create({
      data: {
        id: "w1",
        roomTypeId: published,
        startDate: utc("2031-09-10"),
        endDate: utc("2031-09-13"),
        amountMinor: 6000,
      },
    });
    await client.ratePeriod.create({
      data: {
        id: "w2",
        roomTypeId: published,
        startDate: utc("2031-09-13"),
        endDate: utc("2031-09-14"),
        amountMinor: 1,
        active: false,
      },
    });
    const result = await search.execute(TEST_BRANCH_ID, stay);
    expect(result.ok && result.value.results[0]).toMatchObject({
      reason: "UNPRICED",
      pricePerNight: [],
      accommodationTotal: null,
      unitsAvailable: 0,
    });
  });

  it("subtracts blocked units and keeps branches apart", async () => {
    await rate(published);
    await rate(gizaRoom);
    await client.inventoryBlock.create({
      data: {
        id: "b1",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "p1",
        startDate: utc("2031-09-12"),
        endDate: utc("2031-09-13"),
        reason: "MAINTENANCE",
        createdById: admin.id,
      },
    });
    const cairo = await search.execute(TEST_BRANCH_ID, {
      ...stay,
      unitsRequested: 2,
    });
    expect(cairo.ok && cairo.value.results).toHaveLength(2);
    expect(cairo.ok && cairo.value.results[0]).toMatchObject({
      roomTypeId: published,
      unitsAvailable: 1,
      available: false,
      reason: "SOLD_OUT",
    });
    const giza = await search.execute(GIZA, stay);
    expect(giza.ok && giza.value.results.map((r) => r.roomTypeId)).toEqual([
      gizaRoom,
    ]);
    expect(giza.ok && giza.value.results[0]?.unitsAvailable).toBe(1);
  });

  it("reads rates in one query pair for any number of listings", async () => {
    await rate(published);
    await rate(unitless);
    const baseRates = vi.spyOn(client.roomBaseRate, "findMany");
    const periods = vi.spyOn(client.ratePeriod, "findMany");
    try {
      const result = await search.execute(TEST_BRANCH_ID, stay);
      expect(result.ok && result.value.results).toHaveLength(2);
      expect(baseRates).toHaveBeenCalledTimes(1);
      expect(periods).toHaveBeenCalledTimes(1);
    } finally {
      baseRates.mockRestore();
      periods.mockRestore();
    }
  });

  it("allows an active branch with booking disabled and refuses an inactive one", async () => {
    await client.branch.update({
      where: { id: GIZA },
      data: { onlineBookingEnabled: false },
    });
    expect((await search.execute(GIZA, stay)).ok).toBe(true);
    await client.branch.update({
      where: { id: GIZA },
      data: { status: "INACTIVE" },
    });
    const result = await search.execute(GIZA, stay);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });

  it("treats a listing from another branch as absent from this branch's results", async () => {
    await rate(gizaRoom);
    const cairo = await search.execute(TEST_BRANCH_ID, stay);
    expect(
      cairo.ok && cairo.value.results.map((r) => r.roomTypeId),
    ).not.toContain(gizaRoom);
  });
});
