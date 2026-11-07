import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaEnquiryRepository } from "@/infrastructure/db/prisma/repositories/enquiry-repository";

import {
  actor,
  createActor,
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const enquiries = new PrismaEnquiryRepository(client);
const now = new Date("2026-10-01T12:00:00Z");

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
});

describe("enquiry repository", () => {
  it("stores valid enquiries and lists them for admins", async () => {
    const created = await enquiries.create({
      branchId: TEST_BRANCH_ID,
      name: "Amira",
      email: "amira@example.test",
      phone: null,
      subject: "Family stay",
      message: "Do you have connecting rooms?",
    });

    expect(created).toMatchObject({ ok: true, value: { status: "NEW" } });
    expect(await enquiries.listAdmin("NEW")).toHaveLength(1);
    expect(await enquiries.listAdmin("ARCHIVED")).toHaveLength(0);
  });

  it("rejects markup and archives enquiries", async () => {
    expect(
      await enquiries.create({
        branchId: null,
        name: "<script>",
        email: "x@example.test",
        phone: null,
        subject: null,
        message: "hi",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    const created = await enquiries.create({
      branchId: null,
      name: "Omar",
      email: "omar@example.test",
      phone: null,
      subject: null,
      message: "Hello",
    });
    if (!created.ok) throw new Error("Expected enquiry to be created");

    expect((await enquiries.archive(created.value.id, actor, now)).ok).toBe(
      true,
    );
    expect(await enquiries.listAdmin("ARCHIVED")).toHaveLength(1);
    expect(await enquiries.archive("missing", actor, now)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

// AC-14: an enquiry records its branch; the list filters by branch inside
// the caller's scope and names the branch.
describe("enquiries per branch", () => {
  const OTHER = "branch-giza-0000000000000000";
  const message = (branchId: string | null, name: string) =>
    enquiries.create({
      branchId,
      name,
      email: `${name.toLowerCase()}@example.test`,
      phone: null,
      subject: null,
      message: "Hello",
    });
  const page = (
    query: Partial<Parameters<typeof enquiries.listAdminPage>[0]>,
  ) =>
    enquiries.listAdminPage({
      status: null,
      search: null,
      page: 1,
      pageSize: 20,
      branchScope: "ALL",
      branchId: null,
      ...query,
    });

  beforeEach(async () => {
    await createBranch(client, { id: OTHER, slug: "demo-giza", sortOrder: 1 });
    await message(TEST_BRANCH_ID, "Cairo");
    await message(OTHER, "Giza");
    await message(null, "Before");
  });

  it("stores and names the branch", async () => {
    const all = await page({});
    expect(
      all.items.map((item) => [item.name, item.branchId === OTHER]),
    ).toEqual(expect.arrayContaining([["Giza", true]]));
    expect(
      all.items.find((item) => item.name === "Before")?.branchName,
    ).toBeNull();
    expect(
      all.items.find((item) => item.name === "Giza")?.branchName,
    ).toBeTruthy();
  });

  it("filters by one branch", async () => {
    expect(
      (await page({ branchId: OTHER })).items.map((item) => item.name),
    ).toEqual(["Giza"]);
  });

  it("never shows a scoped role enquiries without a branch", async () => {
    expect(
      (await page({ branchScope: [TEST_BRANCH_ID] })).items.map(
        (item) => item.name,
      ),
    ).toEqual(["Cairo"]);
  });
});
