import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PublicSite } from "@/application/public/public-site";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";

import {
  actor,
  createActor,
  createBranch,
  createFacility,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const OTHER = "branch-giza-0000000000000000";

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await createBranch(client, { id: OTHER, slug: "giza", sortOrder: 1 });
});

// T-DB-2: branch-owned keys and the database checks Prisma cannot express.
describe("branch constraints", () => {
  it.each([
    ["admin"],
    ["api"],
    ["book"],
    ["sitemap.xml"],
    ["index.html"],
    ["New-Cairo"],
  ])("rejects the branch slug %s", async (slug) => {
    await expect(
      createBranch(client, { id: `b-${slug.length}`, slug }),
    ).rejects.toThrow(/Branch_slug_check/);
  });

  it.each([
    [{ checkInTime: "25:00" }, "Branch_times_check"],
    [{ syncReminderIntervalMinutes: 5 }, "Branch_sync_check"],
    [
      { syncReminderIntervalMinutes: 20, syncFollowUpMinutes: 20 },
      "Branch_sync_check",
    ],
    [{ currency: "EGP" }, "Branch_currency_check"],
    [{ name: "   " }, "Branch_name_check"],
  ])("rejects invalid branch values %j", async (values, check) => {
    await expect(
      client.branch.create({
        data: {
          id: "b-bad",
          slug: "bad",
          name: "Bad",
          sortOrder: 9,
          ...values,
        },
      }),
    ).rejects.toThrow(new RegExp(check));
  });

  it("keeps page keys unique per branch, not globally", async () => {
    const page = (id: string, branchId: string) =>
      client.page.create({
        data: { id, branchId, key: "HOME", title: "Home", canonicalPath: "/" },
      });
    await page("home-a", TEST_BRANCH_ID);
    await page("home-b", OTHER);
    await expect(page("home-a2", TEST_BRANCH_ID)).rejects.toThrow();
    expect(await client.page.count({ where: { key: "HOME" } })).toBe(2);
  });

  it("keeps display order unique per branch among active listings", async () => {
    await createRoom(client, { sortOrder: 0 });
    await createRoom(client, { sortOrder: 0, branchId: OTHER });
    await createRoom(client, { sortOrder: 0, status: "ARCHIVED" });
    await expect(createRoom(client, { sortOrder: 0 })).rejects.toThrow(
      /Room_branch_active_sortOrder_key|Unique constraint/,
    );
  });

  it("refuses to delete a branch that owns content", async () => {
    await createRoom(client, { branchId: OTHER });
    await expect(
      client.branch.delete({ where: { id: OTHER } }),
    ).rejects.toThrow();
  });

  it("rejects negative bedroom counts", async () => {
    const room = await createRoom(client);
    await expect(
      client.room.update({
        where: { id: room.id },
        data: { bedroomCount: -1 },
      }),
    ).rejects.toThrow(/Room_unit_counts_check/);
  });
});

describe("branch-owned content", () => {
  const rooms = new PrismaRoomRepository(client);
  const facilities = new PrismaFacilityRepository(client);

  it("lists and finds published rooms only within the given branch", async () => {
    const here = await createRoom(client, { status: "PUBLISHED" });
    const there = await createRoom(client, {
      status: "PUBLISHED",
      branchId: OTHER,
    });
    expect(
      (await rooms.listPublished(TEST_BRANCH_ID)).map((r) => r.id),
    ).toEqual([here.id]);
    expect(
      await rooms.findPublishedBySlug(TEST_BRANCH_ID, there.slug),
    ).toBeNull();
    expect((await rooms.findPublishedBySlug(OTHER, there.slug))?.branchId).toBe(
      OTHER,
    );
  });

  it("creates new rooms at the end of their own branch's order", async () => {
    await createRoom(client, { sortOrder: 4, branchId: OTHER });
    const created = await rooms.create(
      TEST_BRANCH_ID,
      {
        name: "Nile Studio",
        slug: "nile-studio",
        shortDescription: "Calm.",
        description: { type: "doc", content: [{ type: "paragraph" }] },
        sizeSqm: null,
        maxAdults: 2,
        maxChildren: 0,
        bedSummary: null,
        viewSummary: null,
        featured: false,
      },
      actor,
    );
    expect(created).toMatchObject({
      ok: true,
      value: { branchId: TEST_BRANCH_ID, sortOrder: 0 },
    });
  });

  it("reorders one branch without touching another's order", async () => {
    const a = await createRoom(client, { sortOrder: 0 });
    const b = await createRoom(client, { sortOrder: 1 });
    const other = await createRoom(client, { sortOrder: 0, branchId: OTHER });

    expect(await rooms.reorder(TEST_BRANCH_ID, [b.id, a.id], actor)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      (await client.room.findUniqueOrThrow({ where: { id: other.id } }))
        .sortOrder,
    ).toBe(0);
    expect((await rooms.listAdmin(TEST_BRANCH_ID)).map((r) => r.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it("refuses a reorder list that mixes in another branch's room", async () => {
    const a = await createRoom(client, { sortOrder: 0 });
    const other = await createRoom(client, { sortOrder: 0, branchId: OTHER });
    expect(
      await rooms.reorder(TEST_BRANCH_ID, [other.id, a.id], actor),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("scopes facility lists by branch", async () => {
    await createFacility(client);
    await createFacility(client, { branchId: OTHER });
    expect(await facilities.listAdmin(OTHER)).toHaveLength(1);
  });
});

describe("default branch resolution", () => {
  const branches = new PrismaBranchRepository(client);
  const site = new PublicSite({
    settings: new PrismaSettingsRepository(client),
    media: new PrismaMediaRepository(client),
    pages: new PrismaPageRepository(client),
    rooms: new PrismaRoomRepository(client),
    facilities: new PrismaFacilityRepository(client),
    promotions: new PrismaPromotionRepository(client),
    branches,
  });

  it("uses the lowest sort order, and only active branches for visitors", async () => {
    expect((await branches.findDefaultActive())?.id).toBe(TEST_BRANCH_ID);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { status: "INACTIVE" },
    });
    expect((await branches.findDefault())?.id).toBe(TEST_BRANCH_ID);
    expect((await branches.findDefaultActive())?.id).toBe(OTHER);
  });

  it("shows visitors nothing when no branch is active", async () => {
    await createRoom(client, { status: "PUBLISHED" });
    await client.branch.updateMany({ data: { status: "INACTIVE" } });
    expect(await site.rooms()).toEqual([]);
    expect(await site.page("HOME")).toBeNull();
  });
});

// Q-26: Receptionists and Managers see their branches' enquiries only.
describe("enquiry branch scope", () => {
  const enquiries = new PrismaEnquiryRepository(client);
  const query = { status: null, search: null, page: 1, pageSize: 20 };

  beforeEach(async () => {
    await client.contactEnquiry.createMany({
      data: [
        { id: "e-none", name: "A", email: "a@example.test", message: "Old." },
        {
          id: "e-here",
          name: "B",
          email: "b@example.test",
          message: "Here.",
          branchId: TEST_BRANCH_ID,
        },
        {
          id: "e-there",
          name: "C",
          email: "c@example.test",
          message: "There.",
          branchId: OTHER,
        },
      ],
    });
  });

  it.each([
    ["ALL", ["e-here", "e-none", "e-there"]],
    [[OTHER], ["e-there"]],
    [[], []],
  ] as const)("lists scope %j as %j", async (branchScope, ids) => {
    const page = await enquiries.listAdminPage({ ...query, branchScope });
    expect(page.items.map((item) => item.id).sort()).toEqual([...ids]);
    expect(page.total).toBe(ids.length);
  });
});

// T-AUD-1: the audit row commits or rolls back with the change it records.
describe("audit log", () => {
  const event = {
    occurredAt: new Date("2026-11-06T10:00:00Z"),
    actorType: "SYSTEM" as const,
    actorId: null,
    action: "staff.branch-assigned" as const,
    entityType: "User" as const,
    entityId: "user-1",
    branchId: TEST_BRANCH_ID,
    reason: null,
    changes: { branchId: TEST_BRANCH_ID },
  };

  it("appends an event", async () => {
    await new PrismaAuditLog(client).append(event);
    expect(await client.auditEvent.findMany()).toEqual([
      expect.objectContaining({
        action: "staff.branch-assigned",
        changes: { branchId: TEST_BRANCH_ID },
        occurredAt: event.occurredAt,
      }),
    ]);
  });

  it("leaves no row when the surrounding transaction rolls back", async () => {
    await expect(
      client.$transaction(async (transaction) => {
        await new PrismaAuditLog(transaction).append(event);
        throw new Error("roll back");
      }),
    ).rejects.toThrow("roll back");
    expect(await client.auditEvent.count()).toBe(0);
  });

  it("rejects an unknown actor type in the database", async () => {
    await expect(
      client.auditEvent.create({
        data: {
          id: "a1",
          actorType: "ROBOT",
          action: "x",
          entityType: "User",
          entityId: "u",
        },
      }),
    ).rejects.toThrow(/AuditEvent_actorType_check/);
  });
});
