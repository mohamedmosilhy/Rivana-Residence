import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemoCommercial } from "../../prisma/seed/demo";
import {
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function demoBranch() {
  return createBranch(client, { id: "demo", slug: "demo-giza" });
}
const snapshot = async () => ({
  services: await client.serviceOffering.findMany({ orderBy: { id: "asc" } }),
  coupons: await client.coupon.findMany({
    orderBy: { id: "asc" },
    include: { branches: { orderBy: { branchId: "asc" } } },
  }),
  settings: await client.commercialSettings.findMany(),
});

describe("M7 create only demo commercial seed", () => {
  it("upgrades a pre-M7 demo branch with two services and two scoped coupons", async () => {
    await demoBranch();
    expect(await seedDemoCommercial(client)).toEqual({ created: 4 });
    const state = await snapshot();
    expect(state.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: "demo",
          kind: "BREAKFAST",
          priceUnit: "PER_PERSON_PER_NIGHT",
          priceMinor: 1000,
          childPriceMinor: 500,
          active: true,
          currency: "USD",
        }),
        expect.objectContaining({
          branchId: "demo",
          kind: "AIRPORT_TRANSFER",
          priceUnit: "PER_BOOKING",
          priceMinor: 3000,
          childPriceMinor: null,
          active: true,
        }),
      ]),
    );
    expect(state.coupons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DEMO_PERCENT",
          kind: "PERCENT",
          percentBasisPoints: 1000,
          amountMinor: null,
        }),
        expect.objectContaining({
          code: "DEMO_FIXED",
          kind: "FIXED",
          amountMinor: 1500,
          percentBasisPoints: null,
        }),
      ]),
    );
    for (const coupon of state.coupons) {
      expect(coupon.allBranches).toBe(false);
      expect(coupon.branches).toEqual([
        { couponId: coupon.id, branchId: "demo" },
      ]);
      expect(coupon.description).toMatch(/Fictional demo/);
    }
    expect(state.settings).toMatchObject([
      { id: "default", vatRateBasisPoints: 1500 },
    ]);
    expect(
      await client.serviceOffering.count({
        where: { branchId: TEST_BRANCH_ID },
      }),
    ).toBe(0);
    expect(await seedDemoCommercial(client)).toEqual({ created: 0 });
    expect(await snapshot()).toEqual(state);
  });
  it("preserves staff prices, inactive settings, changed coupon scopes and VAT", async () => {
    await demoBranch();
    await seedDemoCommercial(client);
    await client.serviceOffering.updateMany({
      data: { priceMinor: 2345, active: false, description: "Edited" },
    });
    await client.coupon.updateMany({
      data: {
        active: false,
        startsAt: new Date("2027-01-01T00:00:00Z"),
        maxRedemptions: 3,
        description: "Edited",
      },
    });
    await client.couponBranch.deleteMany();
    await client.coupon.updateMany({ data: { allBranches: true } });
    await client.commercialSettings.update({
      where: { id: "default" },
      data: { vatRateBasisPoints: 0 },
    });
    const before = await snapshot();
    await seedDemoCommercial(client);
    expect(await snapshot()).toEqual(before);
  });
  it("preserves an existing service with a different identity", async () => {
    await demoBranch();
    await client.serviceOffering.create({
      data: {
        id: "staff-service",
        branchId: "demo",
        kind: "BREAKFAST",
        priceUnit: "PER_NIGHT",
        priceMinor: 1234,
      },
    });
    expect(await seedDemoCommercial(client)).toEqual({ created: 3 });
    expect(
      await client.serviceOffering.findUniqueOrThrow({
        where: { id: "staff-service" },
      }),
    ).toMatchObject({
      priceMinor: 1234,
      priceUnit: "PER_NIGHT",
      active: false,
    });
  });
  it("fails atomically on a conflicting staff coupon without adopting it", async () => {
    await demoBranch();
    await client.coupon.create({
      data: {
        id: "staff-coupon",
        code: "demo_fixed",
        kind: "FIXED",
        amountMinor: 100,
        allBranches: true,
      },
    });
    const before = await snapshot();
    await expect(seedDemoCommercial(client)).rejects.toMatchObject({
      code: "P2002",
    });
    expect(await snapshot()).toEqual(before);
  });
  it("fails without writing when the demo branch is absent", async () => {
    const before = await snapshot();
    await expect(seedDemoCommercial(client)).rejects.toMatchObject({
      code: "P2025",
    });
    expect(await snapshot()).toEqual(before);
  });
});
