import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { verifyPassword } from "better-auth/crypto";

import { BRANCH } from "../../prisma/initial-content/content";
import { SEED_ADMIN } from "../../prisma/seed/admin-credentials";
import { runSeed } from "../../prisma/seed/index";
import {
  actor,
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const PASSWORD = "river-lantern-4471-quiet";
let mediaRoot: string;
let lines: string[];

const seed = () =>
  runSeed(client, {
    mediaRoot,
    adminPassword: PASSWORD,
    log: (message) => lines.push(message),
  });

beforeEach(async () => {
  await resetDatabase(client);
  mediaRoot = await mkdtemp(path.join(tmpdir(), "rivana-seed-test-"));
  lines = [];
});
afterAll(async () => {
  await client.$disconnect();
});

describe("the one seed (runSeed)", () => {
  it("builds a complete site on an empty database", async () => {
    const result = await seed();
    expect(result.contentSeeded).toBe(true);

    const admin = await client.user.findUniqueOrThrow({
      where: { email: SEED_ADMIN.email },
      include: { accounts: true },
    });
    expect(admin).toMatchObject({ role: "ADMIN", active: true });
    expect(
      await verifyPassword({
        hash: admin.accounts[0]!.password!,
        password: PASSWORD,
      }),
    ).toBe(true);

    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(branch).toMatchObject({
      phone: BRANCH.phone,
      mapEmbedUrl: BRANCH.mapEmbedUrl,
      checkInTime: "14:00",
      checkOutTime: "12:00",
    });

    expect(
      await client.room.count({
        where: { branchId: TEST_BRANCH_ID, status: "PUBLISHED" },
      }),
    ).toBe(3);
    expect(
      await client.facility.count({ where: { branchId: TEST_BRANCH_ID } }),
    ).toBeGreaterThanOrEqual(3);
    expect(
      await client.page.count({
        where: { branchId: TEST_BRANCH_ID, isPublished: true },
      }),
    ).toBe(3);
    expect(await client.mediaAsset.count({ where: { status: "READY" } })).toBe(
      33,
    );
    expect(lines.map((line) => line.split(":")[0])).toEqual([
      "Structure",
      "Admin",
      "Branch",
      "Content",
      "Branch",
    ]);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("changes nothing on a second run", async () => {
    await seed();
    const counts = async () => ({
      rooms: await client.room.count(),
      facilities: await client.facility.count(),
      media: await client.mediaAsset.count(),
      users: await client.user.count(),
      branches: await client.branch.count(),
    });
    const before = await counts();

    lines = [];
    const result = await seed();

    expect(result.contentSeeded).toBe(false);
    expect(await counts()).toEqual(before);
    expect(lines.join("\n")).toMatch(/password unchanged/);
    expect(lines.join("\n")).toMatch(/Content: skipped/);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("warns when it finds images but no rooms, like an interrupted run", async () => {
    await seed();
    await client.room.deleteMany();
    await client.facility.deleteMany();

    lines = [];
    await seed();

    expect(lines.join("\n")).toMatch(/interrupted earlier run/);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("adds nothing fictional without --demo", async () => {
    await seed();
    expect(await client.branch.count({ where: { slug: "demo-giza" } })).toBe(0);
    expect(await client.branch.count()).toBe(1);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("adds the fictional second branch with --demo, once", async () => {
    const withDemo = () =>
      runSeed(client, {
        mediaRoot,
        adminPassword: PASSWORD,
        demo: true,
        log: (message) => lines.push(message),
      });
    await withDemo();

    const giza = await client.branch.findUniqueOrThrow({
      where: { slug: "demo-giza" },
    });
    expect(giza.status).toBe("ACTIVE");
    expect(
      (
        await client.room.findMany({
          where: { branchId: giza.id, status: "PUBLISHED" },
          select: { accommodationType: true },
        })
      )
        .map((room) => room.accommodationType)
        .sort(),
    ).toEqual(["APARTMENT", "ROOM"]);
    expect(await client.facility.count({ where: { branchId: giza.id } })).toBe(
      2,
    );
    expect(
      await client.page.count({
        where: { branchId: giza.id, isPublished: true },
      }),
    ).toBe(3);
    expect(await client.branch.count({ where: { status: "ACTIVE" } })).toBe(2);
    // The same photos serve both branches; nothing is uploaded again.
    expect(await client.mediaAsset.count()).toBe(33);

    const counts = async () => ({
      branches: await client.branch.count(),
      rooms: await client.room.count(),
      pages: await client.page.count(),
    });
    const before = await counts();
    lines = [];
    await withDemo();
    expect(await counts()).toEqual(before);
    expect(lines.join("\n")).toMatch(/demo-giza already exists/);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("creates nothing if a demo photo is missing, and says which", async () => {
    await seed();
    await client.mediaAsset.updateMany({
      where: { originalFilename: "gym-02.jpg" },
      data: { status: "DELETED" },
    });

    await expect(
      runSeed(client, {
        mediaRoot,
        adminPassword: PASSWORD,
        demo: true,
        log: () => undefined,
      }),
    ).rejects.toThrow(/gym-02\.jpg/);

    expect(await client.branch.count({ where: { slug: "demo-giza" } })).toBe(0);
    expect(await client.room.count()).toBe(3);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("reports an inactive demo branch left by an older seed", async () => {
    await runSeed(client, {
      mediaRoot,
      adminPassword: PASSWORD,
      demo: true,
      log: () => undefined,
    });
    await client.branch.update({
      where: { slug: "demo-giza" },
      data: { status: "INACTIVE" },
    });

    lines = [];
    await runSeed(client, {
      mediaRoot,
      adminPassword: PASSWORD,
      demo: true,
      log: (message) => lines.push(message),
    });

    expect(lines.join("\n")).toMatch(/already exists \(inactive\)/);
    expect(lines.join("\n")).toMatch(/Admin > Branches/);
    expect(
      (await client.branch.findUniqueOrThrow({ where: { slug: "demo-giza" } }))
        .status,
    ).toBe("INACTIVE");
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("gives the default branch a hero image for the branch chooser", async () => {
    await seed();
    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
      include: { heroMedia: true },
    });
    expect(branch.heroMedia).toMatchObject({
      status: "READY",
      originalFilename: "exterior-wide.jpg",
    });
    expect(lines.join("\n")).toMatch(/hero image/);
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);

  it("does not replace or restore a hero that staff changed or removed", async () => {
    await seed();
    await createActor(client);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { heroMediaId: null, updatedById: actor.id },
    });

    await seed();

    expect(
      (await client.branch.findUniqueOrThrow({ where: { id: TEST_BRANCH_ID } }))
        .heroMediaId,
    ).toBeNull();
    await rm(mediaRoot, { recursive: true, force: true });
  }, 120_000);
});
