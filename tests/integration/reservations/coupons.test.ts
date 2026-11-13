import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { testDatabaseUrl } from "../support/test-database";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";

import {
  createActor,
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";
import { backendPid } from "./support/physical-rooms";
import { commercialUseCases } from "./support/commercial";

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

const { GET, POST } = await import("@/app/api/v1/staff/coupons/route");
const { PATCH } = await import("@/app/api/v1/staff/coupons/[id]/route");
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
const manager = (branchIds: readonly string[]): StaffPrincipal => ({
  ...admin,
  id: "actor-manager",
  role: "MANAGER",
  branchIds,
});
const receptionist = (branchIds: readonly string[]): StaffPrincipal => ({
  ...admin,
  id: "actor-receptionist",
  role: "RECEPTIONIST",
  branchIds,
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

const input = (overrides: Record<string, unknown> = {}) => ({
  code: "SUMMER26",
  kind: "PERCENT",
  percentBasisPoints: 1500,
  allBranches: false,
  branchIds: [TEST_BRANCH_ID],
  active: true,
  description: "Staff note",
  ...overrides,
});
const create = (body = input()) =>
  POST(request("POST", "/api/v1/staff/coupons", body));
const list = (query = "") =>
  GET(request("GET", `/api/v1/staff/coupons${query}`));
const patch = (id: string, body: unknown) =>
  PATCH(request("PATCH", `/api/v1/staff/coupons/${id}`, body), {
    params: Promise.resolve({ id }),
  });
const stored = (id: string) =>
  client.coupon.findUniqueOrThrow({
    where: { id },
    include: { branches: true },
  });
const audits = () =>
  client.auditEvent.findMany({
    where: { entityType: "Coupon" },
    orderBy: { occurredAt: "asc" },
  });
const createId = async (body = input()) => {
  const response = await create(body);
  expect(response.status).toBe(201);
  return (await response.json()).id as string;
};
afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await client.user.create({
    data: {
      id: "actor-manager",
      name: "Manager",
      email: "manager@example.test",
      role: "MANAGER",
    },
  });
  await createBranch(client, { id: GIZA, slug: "demo-giza" });
  session.staff = admin;
});

describe("coupon staff APIs on PostgreSQL (T-CPN-6…8, AC-5)", () => {
  it("creates a normalized coupon, returns Location and a complete DTO, and audits without free text", async () => {
    const response = await create(input({ code: "  summer26 " }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(response.headers.get("location")).toBe(
      `/api/v1/staff/coupons/${body.id}`,
    );
    expect(body).toMatchObject({
      code: "SUMMER26",
      redemptionsTotal: 0,
      amount: null,
      branchIds: [TEST_BRANCH_ID],
      description: "Staff note",
    });
    expect(await stored(body.id)).toMatchObject({
      currency: "USD",
      createdById: admin.id,
      updatedById: admin.id,
    });
    expect(await audits()).toMatchObject([
      {
        actorId: admin.id,
        action: "coupon.create",
        branchId: null,
        changes: {
          before: null,
          after: { code: "SUMMER26", percentBasisPoints: 1500 },
          descriptionChanged: true,
        },
      },
    ]);
    expect(JSON.stringify(await audits())).not.toContain("Staff note");
  });
  it("refuses a duplicate code case insensitively without another row or audit", async () => {
    await createId();
    expect((await create(input({ code: "summer26" }))).status).toBe(409);
    expect(await client.coupon.count()).toBe(1);
    expect(await audits()).toHaveLength(1);
  });
  it("allows Admin global scope, fixed values, and scope transitions", async () => {
    const id = await createId(input({ allBranches: true, branchIds: [] }));
    expect(
      (
        await patch(id, {
          kind: "FIXED",
          percentBasisPoints: null,
          amount: { amountMinor: 5000, currency: "USD" },
          allBranches: false,
          branchIds: [GIZA],
        })
      ).status,
    ).toBe(200);
    expect(await stored(id)).toMatchObject({
      kind: "FIXED",
      amountMinor: 5000,
      percentBasisPoints: null,
      allBranches: false,
      branches: [{ branchId: GIZA }],
    });
    expect((await patch(id, { allBranches: true, branchIds: [] })).status).toBe(
      200,
    );
    expect((await stored(id)).branches).toEqual([]);
  });
  it("lets a Manager manage only coupons entirely within their assignments", async () => {
    const global = await createId(
      input({ code: "GLOBAL26", allBranches: true, branchIds: [] }),
    );
    const shared = await createId(
      input({ code: "SHARED26", branchIds: [TEST_BRANCH_ID, GIZA] }),
    );
    const foreign = await createId(
      input({ code: "FOREIGN26", branchIds: [GIZA] }),
    );
    session.staff = manager([TEST_BRANCH_ID]);
    const own = await createId(input({ code: "OWN26" }));
    for (const id of [global, shared, foreign, "missing"])
      expect((await patch(id, { active: false })).status).toBe(404);
    expect((await patch(own, { active: false })).status).toBe(200);
    expect((await patch(own, { branchIds: [GIZA] })).status).toBe(403);
    expect(
      (await patch(own, { allBranches: true, branchIds: [] })).status,
    ).toBe(403);
    expect(
      (
        await create(
          input({ code: "FORBIDDEN26", branchIds: [TEST_BRANCH_ID, GIZA] }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await create(
          input({ code: "GLOBAL27", allBranches: true, branchIds: [] }),
        )
      ).status,
    ).toBe(403);
    const page = await list().then((r) => r.json());
    expect(page.total).toBe(1);
    expect(page.items.map((item: { id: string }) => item.id)).toEqual([own]);
    expect((await list(`?branchId=${GIZA}`)).status).toBe(403);
    session.staff = manager([TEST_BRANCH_ID, GIZA]);
    expect((await patch(shared, { active: false })).status).toBe(200);
  });
  it("returns no coupons for an unassigned Manager, including malformed empty-scope legacy rows", async () => {
    const id = await createId();
    await client.couponBranch.deleteMany({ where: { couponId: id } });
    session.staff = manager([]);
    expect(await list().then((r) => r.json())).toMatchObject({
      items: [],
      total: 0,
    });
    expect((await patch(id, { active: false })).status).toBe(404);
  });
  it("applies filters and scope before pagination and counting", async () => {
    for (let i = 0; i < 22; i++)
      await createId(
        input({ code: `OWN${String(i).padStart(3, "0")}`, active: i !== 21 }),
      );
    await createId(input({ code: "FOREIGN26", branchIds: [GIZA] }));
    await createId(
      input({ code: "GLOBAL26", branchIds: [], allBranches: true }),
    );
    session.staff = manager([TEST_BRANCH_ID]);
    const first = await list().then((r) => r.json());
    const second = await list("?page=2").then((r) => r.json());
    expect(first).toMatchObject({ total: 22, pageSize: 20, page: 1 });
    expect(first.items).toHaveLength(20);
    expect(second.items.map((item: { code: string }) => item.code)).toEqual([
      "OWN020",
      "OWN021",
    ]);
    expect(
      await list("?active=false&q=own").then((r) => r.json()),
    ).toMatchObject({ total: 1, items: [{ code: "OWN021" }] });
    session.staff = admin;
    expect(await list(`?branchId=${GIZA}`).then((r) => r.json())).toMatchObject(
      { total: 2 },
    );
  });
  it.each([
    ["?active=1", 400],
    ["?page=0", 400],
    ["?page=1000001", 422],
    ["?unexpected=yes", 400],
  ] as const)("refuses invalid filters %s", async (query, status) => {
    expect((await list(query)).status).toBe(status);
  });
  it.each([
    { percentBasisPoints: 0 },
    { kind: "FIXED" },
    { branchIds: [] },
    { branchIds: [TEST_BRANCH_ID, TEST_BRANCH_ID] },
    { branchIds: ["missing"] },
    { allBranches: true },
    { code: "CHANGED26" },
    {},
    { amount: { amountMinor: 10, currency: "USD" } },
  ])("refuses invalid patches without changes or audit %j", async (body) => {
    const id = await createId();
    const before = await stored(id);
    expect((await patch(id, body)).status).toBe(422);
    expect(await stored(id)).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });
  it("validates dates after merging, preserves omissions, clears nulls, and skips no-op audit", async () => {
    const id = await createId(
      input({
        startsAt: "2026-11-13T00:00:00Z",
        endsAt: "2026-11-15T00:00:00Z",
        maxRedemptions: 5,
      }),
    );
    expect((await patch(id, { endsAt: "2026-11-12T00:00:00Z" })).status).toBe(
      422,
    );
    const first = await stored(id);
    expect(
      (
        await patch(id, {
          percentBasisPoints: 1500,
          branchIds: [TEST_BRANCH_ID],
        })
      ).status,
    ).toBe(200);
    expect(await stored(id)).toEqual(first);
    expect(await audits()).toHaveLength(1);
    expect(
      (
        await patch(id, {
          endsAt: null,
          maxRedemptions: null,
          description: null,
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(await stored(id)).toMatchObject({
      startsAt: first.startsAt,
      endsAt: null,
      maxRedemptions: null,
      description: null,
      active: false,
    });
    expect((await audits())[1]?.changes).toMatchObject({
      before: { active: true },
      after: { active: false },
      descriptionChanged: true,
    });
  });
  it("requires a session, capability and same-origin mutation", async () => {
    const id = await createId();
    for (const staff of [
      null,
      receptionist([TEST_BRANCH_ID]),
      { ...admin, role: "EDITOR" as const },
    ]) {
      session.staff = staff;
      const status = staff ? 403 : 401;
      expect((await list()).status).toBe(status);
      expect((await create()).status).toBe(status);
      expect((await patch(id, { active: false })).status).toBe(status);
    }
    session.staff = admin;
    const response = await POST(
      new Request(`${ORIGIN}/api/v1/staff/coupons`, {
        method: "POST",
        headers: {
          origin: "https://foreign.test",
          "content-type": "application/json",
        },
        body: JSON.stringify(input()),
      }),
    );
    expect(response.status).toBe(403);
    expect(await audits()).toHaveLength(1);
  });
  it("rolls back coupon and branch changes on audit failure", async () => {
    const failing = commercialUseCases(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit down");
        },
      }),
    }).coupons;
    await expect(failing.create(admin, input())).rejects.toThrow("audit down");
    expect(await client.coupon.count()).toBe(0);
    const id = await createId();
    const before = await stored(id);
    await expect(
      failing.update(admin, id, { branchIds: [GIZA], active: false }),
    ).rejects.toThrow("audit down");
    expect(await stored(id)).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });
});

describe("coupon concurrency and failure boundaries", () => {
  it.each(["partial", "scope", "window"] as const)(
    "serializes %s edits and rechecks locked state, 20 races",
    async (scenario) => {
      await withIndependentClients(3, async ([holder, waiter, observer]) => {
        for (let round = 0; round < 20; round++) {
          await client.auditEvent.deleteMany();
          await client.couponBranch.deleteMany();
          await client.coupon.deleteMany();
          const id = await createId(
            input({
              startsAt: "2026-11-13T00:00:00Z",
              endsAt: "2026-11-18T00:00:00Z",
            }),
          );
          await client.auditEvent.deleteMany();
          const held = deferred();
          const release = deferred();
          const firstPatch =
            scenario === "scope"
              ? { branchIds: [GIZA] }
              : scenario === "window"
                ? { startsAt: "2026-11-16T00:00:00Z" }
                : { percentBasisPoints: 2000 };
          const secondPatch =
            scenario === "window"
              ? { endsAt: "2026-11-15T00:00:00Z" }
              : { active: false };
          const holding = commercialUseCases(holder!, {
            audit: (inner) => ({
              append: async (event) => {
                await inner.append(event);
                held.resolve();
                await release.promise;
              },
            }),
          }).coupons.update(admin, id, firstPatch);
          let waiting:
            | ReturnType<
                ReturnType<typeof commercialUseCases>["coupons"]["update"]
              >
            | undefined;
          try {
            await held.promise;
            const probe = backendPid();
            waiting = commercialUseCases(waiter!, {
              onBackend: probe.onBackend,
            }).coupons.update(
              scenario === "scope" ? manager([TEST_BRANCH_ID]) : admin,
              id,
              secondPatch,
            );
            await waitForDatabaseLock(observer!, await probe.pid.promise);
          } finally {
            release.resolve();
          }
          expect((await holding).ok).toBe(true);
          const result = await waiting!;
          if (scenario === "partial") {
            expect(result.ok).toBe(true);
            expect(await stored(id)).toMatchObject({
              percentBasisPoints: 2000,
              active: false,
            });
            const rows = await audits();
            expect(rows).toHaveLength(2);
            expect(rows[0]?.changes).toMatchObject({
              before: { percentBasisPoints: 1500 },
              after: { percentBasisPoints: 2000, active: true },
            });
            expect(rows[1]?.changes).toMatchObject({
              before: { percentBasisPoints: 2000, active: true },
              after: { percentBasisPoints: 2000, active: false },
            });
          } else {
            expect(result).toMatchObject({
              ok: false,
              error: {
                code: scenario === "scope" ? "NOT_FOUND" : "VALIDATION",
              },
            });
            expect((await stored(id)).active).toBe(true);
            expect(await audits()).toHaveLength(1);
          }
        }
      });
    },
    60_000,
  );

  it("serializes duplicate creates at the unique index, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      for (let round = 0; round < 20; round++) {
        await client.auditEvent.deleteMany();
        await client.couponBranch.deleteMany();
        await client.coupon.deleteMany();
        const held = deferred();
        const release = deferred();
        const holding = commercialUseCases(holder!, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
            },
          }),
        }).coupons.create(admin, input());
        await held.promise;
        const probe = backendPid();
        const waiting = commercialUseCases(waiter!, {
          onBackend: probe.onBackend,
        }).coupons.create(admin, input({ code: "summer26" }));
        try {
          await waitForDatabaseLock(observer!, await probe.pid.promise);
        } finally {
          release.resolve();
        }
        expect((await holding).ok).toBe(true);
        expect(await waiting).toMatchObject({
          ok: false,
          error: { code: "CONFLICT" },
        });
        expect(await client.coupon.count()).toBe(1);
        expect(await audits()).toHaveLength(1);
      }
    });
  }, 60_000);

  it("returns TRY_AGAIN when the coupon lock stays busy, with no mutation", async () => {
    const id = await createId();
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${id} FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const response = await patch(id, { active: false });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toMatchObject({ code: "TRY_AGAIN" });
      expect((await stored(id)).active).toBe(true);
      expect(await audits()).toHaveLength(1);
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  }, 20_000);
});

describe("coupon list snapshot isolation", () => {
  it("never hydrates a Manager's item with foreign branches after a competing scope move", async () => {
    const id = await createId(input({ code: "LIST-RACE" }));
    const writer = commercialUseCases(client).coupons;
    const adapter = new PrismaPg({
      connectionString: testDatabaseUrl().url,
      options: "-c TimeZone=UTC",
    });
    const connect = adapter.connect.bind(adapter);
    let raced = false;
    adapter.connect = async () => {
      const connection = await connect();
      const query = connection.queryRaw.bind(connection);
      connection.queryRaw = async (statement) => {
        const result = await query(statement);
        // Commit after the item SELECT has read its snapshot, before Prisma
        // receives it. A later relation query must not see the moved scope.
        const itemSelect =
          statement.sql.startsWith('SELECT "public"."Coupon"."id"') ||
          statement.sql.includes('FROM "Coupon" c');
        if (!raced && itemSelect && !statement.sql.includes("count(*)")) {
          raced = true;
          const moved = await writer.update(admin, id, { branchIds: [GIZA] });
          expect(moved.ok).toBe(true);
        }
        return result;
      };
      return connection;
    };
    const reader = new PrismaClient({ adapter });
    try {
      const result = await commercialUseCases(reader).coupons.list(
        manager([TEST_BRANCH_ID]),
        { q: "LIST-RACE" },
      );
      expect(raced).toBe(true);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected a coupon page");
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]?.branchIds).toEqual([TEST_BRANCH_ID]);
      expect(
        await commercialUseCases(reader).coupons.list(
          manager([TEST_BRANCH_ID]),
          { q: "LIST-RACE" },
        ),
      ).toMatchObject({ ok: true, value: { items: [], total: 0 } });
    } finally {
      await reader.$disconnect();
    }
  });
});
