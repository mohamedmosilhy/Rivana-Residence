import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PublicSite } from "@/application/public/public-site";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";

import { BRANCH } from "../../prisma/initial-content/content";
import { seedDatabase } from "../../prisma/seed-data";
import { seedBranchDetails } from "../../prisma/seed/branch";
import {
  actor,
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();

beforeEach(async () => {
  await resetDatabase(client);
  await seedDatabase(client);
});
afterAll(() => client.$disconnect());

describe("seedBranchDetails (F08)", () => {
  it("fills the branch's own contact, location, map, and times on a fresh database", async () => {
    const before = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(before.phone).toBeNull();
    expect(before.mapEmbedUrl).toBeNull();
    expect(before.checkInTime).toBeNull();

    const filled = await seedBranchDetails(client, TEST_BRANCH_ID);

    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(filled).toEqual(
      expect.arrayContaining([
        "phone",
        "mapEmbedUrl",
        "checkInTime",
        "checkOutTime",
      ]),
    );
    expect(branch).toMatchObject({
      phone: BRANCH.phone,
      email: BRANCH.email,
      addressLine1: BRANCH.addressLine1,
      city: BRANCH.city,
      mapEmbedUrl: BRANCH.mapEmbedUrl,
      checkInTime: "14:00",
      checkOutTime: "12:00",
      onlineBookingEnabled: false,
    });
    expect(Number(branch.latitude)).toBeCloseTo(BRANCH.latitude, 6);
    expect(Number(branch.longitude)).toBeCloseTo(BRANCH.longitude, 6);
  });

  it("is repeatable and changes nothing the second time", async () => {
    await seedBranchDetails(client, TEST_BRANCH_ID);
    expect(await seedBranchDetails(client, TEST_BRANCH_ID)).toEqual([]);
  });

  it("leaves a branch alone once staff have edited it", async () => {
    await createActor(client);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { phone: "+20 2 0000 1111", updatedById: actor.id },
    });

    const filled = await seedBranchDetails(client, TEST_BRANCH_ID);

    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(filled).toEqual([]);
    expect(branch.phone).toBe("+20 2 0000 1111");
    expect(branch.mapEmbedUrl).toBeNull();
  });

  it("does not bring back a field that staff cleared on purpose", async () => {
    await seedBranchDetails(client, TEST_BRANCH_ID);
    await createActor(client);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { phone: null, updatedById: actor.id },
    });

    await seedBranchDetails(client, TEST_BRANCH_ID);

    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(branch.phone).toBeNull();
  });

  it("fills only the empty fields of a branch nobody has edited", async () => {
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { phone: "+20 2 0000 1111" },
    });

    const filled = await seedBranchDetails(client, TEST_BRANCH_ID);

    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(branch.phone).toBe("+20 2 0000 1111");
    expect(filled).not.toContain("phone");
    expect(branch.mapEmbedUrl).toBe(BRANCH.mapEmbedUrl);
  });

  it("shows the seeded contact, map, and times to visitors through the public site", async () => {
    await seedBranchDetails(client, TEST_BRANCH_ID);
    const site = new PublicSite({
      settings: new PrismaSettingsRepository(client),
      media: new PrismaMediaRepository(client),
      pages: new PrismaPageRepository(client),
      rooms: new PrismaRoomRepository(client),
      facilities: new PrismaFacilityRepository(client),
      branches: new PrismaBranchRepository(client),
    });

    const branch = (await site.activeBranches()).find(
      (item) => item.slug === "new-cairo",
    );

    expect(branch).toMatchObject({
      phone: BRANCH.phone,
      email: BRANCH.email,
      addressLine1: BRANCH.addressLine1,
      mapEmbedUrl: BRANCH.mapEmbedUrl,
      checkInTime: "14:00",
      checkOutTime: "12:00",
    });
  });
});
