import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AvailabilityResponse } from "@/contracts/api/v1/availability";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { SearchPublicAvailability } from "@/application/public/search-public-availability";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { StayRange } from "@/domain/shared/stay-range";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { failure } from "@/application/shared/result";

import { runSeed } from "../../../prisma/seed/index";
import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";

vi.mock("next/cache", () => ({
  unstable_cache: () => () => {
    throw new Error("P5 must not use the marketing cache.");
  },
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("test-p5-hmac-secret"),
}));
const { GET } = await import(
  "@/app/api/v1/branches/[branchSlug]/availability/route"
);
const client = createTestClient();
const NOW = new Date("2031-03-01T10:00:00Z");
const QUERY = "checkIn=2031-03-10&checkOut=2031-03-14&adults=2&children=0";
const GIZA = "p5-other-branch";
const date = (value: string) => new Date(`${value}T00:00:00Z`);
let listing: string;
let unit: string;
let period: string;
const request = (query = QUERY, slug = "new-cairo") =>
  GET(
    new Request(
      `http://localhost/api/v1/branches/${slug}/availability?${query}`,
    ),
    { params: Promise.resolve({ branchSlug: slug }) },
  );
const body = async (response: Response) =>
  AvailabilityResponse.parse(await response.json());

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await resetDatabase(client);
  await createActor(client);
  const room = await createRoom(client, {
    status: "PUBLISHED",
    slug: "garden-room",
  });
  listing = room.id;
  unit = "p5-unit-a";
  await client.physicalRoom.createMany({
    data: [unit, "p5-unit-b"].map((id) => ({
      id,
      branchId: TEST_BRANCH_ID,
      roomTypeId: listing,
      label: id,
    })),
  });
  await client.roomBaseRate.create({
    data: { roomTypeId: listing, amountMinor: 8000 },
  });
  const first = await client.ratePeriod.create({
    data: {
      id: "p5-period-first",
      roomTypeId: listing,
      startDate: date("2031-03-10"),
      endDate: date("2031-03-12"),
      amountMinor: 6000,
    },
  });
  period = first.id;
  await client.ratePeriod.create({
    data: {
      id: "p5-period-second",
      roomTypeId: listing,
      startDate: date("2031-03-12"),
      endDate: date("2031-03-14"),
      amountMinor: 7000,
    },
  });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await client.$disconnect();
  await getPrisma().$disconnect();
});

describe("API-P5 real Route Handler (M6 AC-1, AC-6, AC-8)", () => {
  it("prices the two-period worked example at $260 and uses the exact public field allowlist", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const raw: unknown = await response.clone().json();
    const value = await body(response);
    expect(raw).toEqual(value);
    expect(Object.keys(value).sort()).toEqual(["occupancy", "results", "stay"]);
    expect(value.results).toHaveLength(1);
    const result = value.results[0]!;
    expect(result).toMatchObject({
      available: true,
      unitsAvailable: 2,
      accommodationTotal: { amountMinor: 26000, currency: "USD" },
    });
    expect(result.pricePerNight.map((n) => n.amountMinor)).toEqual([
      6000, 6000, 7000, 7000,
    ]);
    expect(Object.keys(result).sort()).toEqual([
      "accommodationTotal",
      "available",
      "pricePerNight",
      "roomType",
      "unitsAvailable",
    ]);
    expect(Object.keys(result.roomType).sort()).toEqual([
      "accommodationType",
      "bathroomCount",
      "bedroomCount",
      "detailUrl",
      "heroImage",
      "maxAdults",
      "maxChildren",
      "name",
      "shortDescription",
      "slug",
    ]);
    expect(result.roomType.detailUrl).toBe("/new-cairo/stay/garden-room");
    expect(JSON.stringify(value)).not.toMatch(
      /p5-unit|roomTypeId|capacity|blocked|sold|branchId|updatedAt/,
    );
    expect((await client.loginThrottle.findMany())[0]?.failures).toBe(1);
  });

  it.each([1, 2, 3, 5])(
    "computes availability and total for quantity %i",
    async (quantity) => {
      const result = (
        await body(await request(`${QUERY}&unitsRequested=${quantity}`))
      ).results[0]!;
      expect(result.available).toBe(quantity <= 2);
      expect(result.unitsAvailable).toBe(2);
      expect(result.accommodationTotal?.amountMinor).toBe(26000 * quantity);
      expect(result.reason).toBe(quantity <= 2 ? undefined : "SOLD_OUT");
    },
  );

  it("caps disclosure at five and permits requesting five", async () => {
    await client.physicalRoom.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `extra-${i}`,
        branchId: TEST_BRANCH_ID,
        roomTypeId: listing,
        label: `extra-${i}`,
      })),
    });
    expect(
      (await body(await request(`${QUERY}&unitsRequested=5`))).results[0],
    ).toMatchObject({
      available: true,
      unitsAvailable: 5,
      accommodationTotal: { amountMinor: 130000 },
    });
  });

  it("handles zero capacity, occupancy and missing pricing without fabricated prices", async () => {
    await client.physicalRoom.updateMany({ data: { active: false } });
    expect((await body(await request())).results[0]).toMatchObject({
      available: false,
      unitsAvailable: 0,
      reason: "SOLD_OUT",
      accommodationTotal: { amountMinor: 26000 },
    });
    expect(
      (await body(await request(QUERY.replace("adults=2", "adults=3"))))
        .results[0],
    ).toMatchObject({ reason: "OCCUPANCY", unitsAvailable: 0 });
    await client.roomBaseRate.deleteMany();
    await client.ratePeriod.deleteMany({ where: { amountMinor: 7000 } });
    expect(
      (await body(await request(QUERY.replace("adults=2", "adults=3"))))
        .results[0],
    ).toMatchObject({
      reason: "UNPRICED",
      unitsAvailable: 0,
      pricePerNight: [],
      accommodationTotal: null,
    });
  });

  it("isolates branches with matching names and excludes unpublished listings", async () => {
    await createRoom(client, { slug: "draft", status: "DRAFT" });
    await createRoom(client, { slug: "archived", status: "ARCHIVED" });
    await createBranch(client, { id: GIZA, slug: "giza" });
    const other = await createRoom(client, {
      branchId: GIZA,
      status: "PUBLISHED",
      slug: "giza-garden-room",
    });
    await client.room.update({
      where: { id: other.id },
      data: {
        name: (await client.room.findUniqueOrThrow({ where: { id: listing } }))
          .name,
      },
    });
    await client.roomBaseRate.create({
      data: { roomTypeId: other.id, amountMinor: 9000 },
    });
    expect((await body(await request())).results).toHaveLength(1);
    const result = (await body(await request(QUERY, "giza"))).results[0]!;
    expect(result.accommodationTotal?.amountMinor).toBe(36000);
    expect(result.roomType.detailUrl).toBe("/giza/stay/giza-garden-room");
    expect(result.unitsAvailable).toBe(0);
    expect(
      (await client.branch.findUniqueOrThrow({ where: { id: GIZA } }))
        .onlineBookingEnabled,
    ).toBe(false);
  });

  it("reads price, inventory, publication and branch status afresh for identical URLs", async () => {
    expect(
      (await body(await request())).results[0]?.accommodationTotal?.amountMinor,
    ).toBe(26000);
    await client.ratePeriod.update({
      where: { id: period },
      data: { amountMinor: 9000 },
    });
    expect(
      (await body(await request())).results[0]?.accommodationTotal?.amountMinor,
    ).toBe(32000);
    await client.inventoryBlock.create({
      data: {
        id: "p5-hidden-block",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: unit,
        startDate: date("2031-03-11"),
        endDate: date("2031-03-12"),
        reason: "OWNER_USE",
        note: "private reason",
        createdById: "actor-admin",
      },
    });
    expect((await body(await request())).results[0]?.unitsAvailable).toBe(1);
    await client.room.update({
      where: { id: listing },
      data: { status: "DRAFT" },
    });
    expect((await body(await request())).results).toEqual([]);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { status: "INACTIVE" },
    });
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["unknown", "inactive"])(
    "hides %s branches with 404",
    async (slug) => {
      if (slug === "inactive")
        await createBranch(client, { id: GIZA, slug, status: "INACTIVE" });
      expect((await request(QUERY, slug)).status).toBe(404);
    },
  );

  it("returns an empty result list for an active branch without published listings", async () => {
    await createBranch(client, { id: GIZA, slug: "empty" });
    expect((await body(await request(QUERY, "empty"))).results).toEqual([]);
  });

  it.each([
    ["checkOut=2031-03-14&adults=2&children=0", 400, "checkIn"],
    [`${QUERY}&branchId=other`, 400, "branchId"],
    [`${QUERY}&adults=2`, 400, "adults"],
    [QUERY.replace("2031-03-10", "not-a-date"), 422, "checkIn"],
    [QUERY.replace("2031-03-10", "2031-02-30"), 422, "checkIn"],
    [QUERY.replace("2031-03-14", "2031-03-10"), 422, "checkOut"],
    [QUERY.replace("2031-03-10", "2031-02-28"), 422, "checkIn"],
    [QUERY.replace("2031-03-14", "2031-04-10"), 422, "checkOut"],
    [QUERY.replace("adults=2", "adults=0"), 422, "adults"],
    [QUERY.replace("adults=2", "adults=1.5"), 422, "adults"],
    [QUERY.replace("children=0", "children="), 422, "children"],
    [QUERY.replace("children=0", "children=-1"), 422, "children"],
    [`${QUERY}&unitsRequested=0`, 422, "unitsRequested"],
    [`${QUERY}&unitsRequested=6`, 422, "unitsRequested"],
    [`${QUERY}&unitsRequested=`, 422, "unitsRequested"],
    [`${QUERY}&unitsRequested=no`, 422, "unitsRequested"],
  ])("maps validation %s to %i", async (query, status, field) => {
    const response = await request(query);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(await response.json()).toMatchObject({
      code: status === 400 ? "INVALID_QUERY" : "VALIDATION",
      fieldErrors: { [field]: expect.any(Array) },
    });
  });

  it("uses the branch calendar date when Cairo has advanced beyond UTC", async () => {
    vi.setSystemTime(new Date("2031-03-01T22:30:00Z"));
    const response = await request(
      "checkIn=2031-03-01&checkOut=2031-03-03&adults=2&children=0",
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      fieldErrors: { checkIn: expect.any(Array) },
    });
  });

  it("accepts exactly 30 nights and rejects arrival beyond the 540-day horizon", async () => {
    expect(
      (
        await request(
          "checkIn=2031-03-10&checkOut=2031-04-09&adults=2&children=0",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "checkIn=2033-01-01&checkOut=2033-01-02&adults=2&children=0",
        )
      ).status,
    ).toBe(422);
  });

  it("admits only 60 concurrent requests across branches and denies before querying inventory", async () => {
    const responses = await Promise.all(
      Array.from({ length: 70 }, (_, i) =>
        request(QUERY, i % 2 ? "new-cairo" : "missing"),
      ),
    );
    expect(responses.filter((r) => r.status === 429)).toHaveLength(10);
    expect(
      responses.filter((r) => r.status === 200 || r.status === 404),
    ).toHaveLength(60);
    for (const response of responses.filter((r) => r.status === 429)) {
      expect(response.headers.get("retry-after")).toBe("60");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    vi.setSystemTime(new Date(+NOW + 1_001));
    const denied = await request("bad=query", "missing");
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("59");
    vi.setSystemTime(new Date(+NOW + 60_000));
    expect((await request()).status).toBe(200);
  });

  it("omits a listing unpublished between calculation and summary read", async () => {
    const rooms = new PrismaRoomRepository(client);
    const row = await rooms.findAdminById(listing);
    expect(row).not.toBeNull();
    const useCase = new SearchPublicAvailability({
      branches: new PrismaBranchRepository(client),
      rooms,
      search: {
        execute: async () => {
          await client.room.update({
            where: { id: listing },
            data: { status: "DRAFT" },
          });
          return {
            ok: true,
            value: {
              stay: StayRange.create(
                LocalDate.parse("2031-03-10"),
                LocalDate.parse("2031-03-14"),
              ),
              occupancy: Occupancy.create({ adults: 2, children: 0 }),
              unitsRequested: 1,
              results: [
                {
                  roomTypeId: listing,
                  name: "old",
                  available: true,
                  unitsAvailable: 2,
                  pricePerNight: [],
                  accommodationTotal: null,
                },
              ],
            },
          };
        },
      },
    });
    const found = await useCase.execute("new-cairo", {});
    expect(found.ok && found.value.results).toEqual([]);
  });

  it("returns missing branch or failed search without loading public summaries", async () => {
    const rooms = { listPublished: vi.fn() };
    const search = { execute: vi.fn(async () => failure("NOT_FOUND", "gone")) };
    const missing = new SearchPublicAvailability({
      branches: { findActiveRowBySlug: async () => null },
      rooms,
      search,
    });
    expect((await missing.execute("missing", {})).ok).toBe(false);
    expect(search.execute).not.toHaveBeenCalled();
    const failing = new SearchPublicAvailability({
      branches: new PrismaBranchRepository(client),
      rooms,
      search,
    });
    expect(await failing.execute("new-cairo", {})).toEqual(
      failure("NOT_FOUND", "gone"),
    );
    expect(rooms.listPublished).not.toHaveBeenCalled();
  });

  it("serves fresh and repeated guarded demo seeds with usable public summaries and rates", async () => {
    await resetDatabase(client);
    const root = await mkdtemp(path.join(tmpdir(), "rivana-p5-seed-"));
    try {
      const options = {
        mediaRoot: root,
        adminPassword: "river-lantern-4471-quiet",
        demo: true,
        log: () => undefined,
      };
      await runSeed(client, options);
      const first = await body(await request(QUERY, "demo-giza"));
      expect(first.results).toHaveLength(2);
      expect(
        first.results.every(
          (r) =>
            r.available &&
            r.roomType.heroImage &&
            r.roomType.detailUrl.startsWith("/demo-giza/"),
        ),
      ).toBe(true);
      await runSeed(client, options);
      expect(await body(await request(QUERY, "demo-giza"))).toEqual(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
