import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seedDatabase } from "../../prisma/seed-data";
import { createTestClient, resetDatabase } from "./support/database";

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

  it("contains no booking, pricing, guest, payment, or redemption data", async () => {
    const columns = await client.$queryRaw<
      { table_name: string; column_name: string }[]
    >`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    `;
    const forbidden = new Set([
      "availability",
      "booking",
      "checkin",
      "checkout",
      "discount",
      "guest",
      "payment",
      "price",
      "rate",
      "redemption",
      "reservation",
      "stay",
    ]);
    const words = (name: string) =>
      name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[\s_]+/)
        .map((word) => word.replace(/s$/, ""));
    const offending = columns
      .flatMap(({ table_name, column_name }) => [table_name, column_name])
      .filter((name) => words(name).some((word) => forbidden.has(word)));

    expect(offending).toEqual([]);
  });
});

describe("seed", () => {
  it("creates singleton settings and unpublished required pages idempotently", async () => {
    const environment = {
      SEED_ADMIN_EMAIL: "Owner@Example.test",
      SEED_ADMIN_NAME: "Owner",
    };

    await seedDatabase(client, environment);
    await seedDatabase(client, environment);

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
    expect(await client.user.findMany()).toEqual([
      expect.objectContaining({ email: "owner@example.test", role: "ADMIN" }),
    ]);
    expect(await client.room.count()).toBe(0);
    expect(await client.promotion.count()).toBe(0);
  });

  it("does not overwrite content edited after the first seed", async () => {
    await seedDatabase(client, {});
    await client.siteSettings.update({
      where: { id: "default" },
      data: { siteName: "Edited name" },
    });

    await seedDatabase(client, {});

    expect(
      (
        await client.siteSettings.findUniqueOrThrow({
          where: { id: "default" },
        })
      ).siteName,
    ).toBe("Edited name");
  });
});
