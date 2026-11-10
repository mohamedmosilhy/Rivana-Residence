import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../prisma/seed-data";
import { RESERVATION_MODELS } from "../support/reservation-models";
import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();

afterAll(() => client.$disconnect());
beforeEach(() => resetDatabase(client));

describe("migration from an empty database", () => {
  it("applies the full migration history", async () => {
    const migrations = await client.$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at FROM "_prisma_migrations"`;

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.every((row) => row.finished_at !== null)).toBe(true);
  });

  // Replaces the Phase 2 "no booking data" word check (D-12): reservation
  // tables arrive with their milestones (M6+), never earlier.
  it("contains no reservation-module table before its milestone", async () => {
    const tables = await client.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const present = new Set(tables.map(({ tablename }) => tablename));
    expect(RESERVATION_MODELS.filter((model) => present.has(model))).toEqual([
      "PhysicalRoom",
      "InventoryBlock",
      "RoomBaseRate",
      "RatePeriod",
    ]);
  });

  it("has the M4 branch, assignment, and audit tables", async () => {
    const tables = await client.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    expect(tables.map(({ tablename }) => tablename)).toEqual(
      expect.arrayContaining(["Branch", "StaffBranchAssignment", "AuditEvent"]),
    );
  });
});

describe("seed", () => {
  it("creates singleton settings and unpublished required pages idempotently", async () => {
    await seedDatabase(client);
    await seedDatabase(client);

    expect(await client.siteSettings.findMany()).toEqual([
      expect.objectContaining({ id: "default", siteName: "Rivana Residence" }),
    ]);
    const pages = await client.page.findMany({ orderBy: { key: "asc" } });
    expect(
      pages.map(({ key, canonicalPath, isPublished }) => ({
        key,
        canonicalPath,
        isPublished,
      })),
    ).toEqual([
      { key: "HOME", canonicalPath: "/", isPublished: false },
      { key: "ABOUT", canonicalPath: "/about", isPublished: false },
      { key: "CONTACT", canonicalPath: "/contact", isPublished: false },
    ]);
    expect(await client.branch.findMany()).toEqual([
      expect.objectContaining({ slug: "new-cairo", status: "ACTIVE" }),
    ]);
    expect(pages.every((page) => page.branchId === TEST_BRANCH_ID)).toBe(true);
    expect(await client.user.count()).toBe(0);
    expect(await client.room.count()).toBe(0);
    expect(await client.promotion.count()).toBe(0);
  });

  it("does not overwrite content edited after the first seed", async () => {
    await seedDatabase(client);
    await client.siteSettings.update({
      where: { id: "default" },
      data: { siteName: "Edited name" },
    });

    await seedDatabase(client);

    expect(
      (
        await client.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        })
      ).siteName,
    ).toBe("Edited name");
  });
});
