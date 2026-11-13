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

const { GET: getServices } = await import(
  "@/app/api/v1/staff/branches/[id]/services/route"
);
const { PUT: putService } = await import(
  "@/app/api/v1/staff/branches/[id]/services/[kind]/route"
);
const { GET: getSettings, PUT: putSettings } = await import(
  "@/app/api/v1/staff/settings/commercial/route"
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
const amount = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const offering = (overrides: Record<string, unknown> = {}) => ({
  priceUnit: "PER_PERSON",
  price: amount(1_200),
  childPrice: amount(600),
  active: true,
  description: "Buffet breakfast",
  ...overrides,
});

const list = (branchId: string) =>
  getServices(request("GET", `/api/v1/staff/branches/${branchId}/services`), {
    params: Promise.resolve({ id: branchId }),
  });
const setService = (branchId: string, kind: string, body: unknown) =>
  putService(
    request("PUT", `/api/v1/staff/branches/${branchId}/services/${kind}`, body),
    { params: Promise.resolve({ id: branchId, kind }) },
  );
const readVat = () =>
  getSettings(request("GET", "/api/v1/staff/settings/commercial"), {
    params: Promise.resolve({}),
  });
const setVat = (body: unknown) =>
  putSettings(request("PUT", "/api/v1/staff/settings/commercial", body), {
    params: Promise.resolve({}),
  });

const audits = (action: string) =>
  client.auditEvent.findMany({
    where: { action },
    orderBy: { occurredAt: "asc" },
  });

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await client.user.createMany({
    data: [
      {
        id: "actor-manager",
        name: "Manager",
        email: "manager@example.test",
        role: "MANAGER",
      },
      {
        id: "actor-receptionist",
        name: "Receptionist",
        email: "receptionist@example.test",
        role: "RECEPTIONIST",
      },
    ],
  });
  await createBranch(client, { id: GIZA, slug: "demo-giza" });
  session.staff = admin;
});

describe("S35 and S36 on PostgreSQL (T-SVC-3, T-SVC-4, M7 AC-5)", () => {
  it("lists both kinds, with absent kinds inactive and unpriced", async () => {
    const response = await list(TEST_BRANCH_ID);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([
      expect.objectContaining({
        kind: "BREAKFAST",
        price: null,
        priceUnit: null,
        active: false,
      }),
      expect.objectContaining({
        kind: "AIRPORT_TRANSFER",
        price: null,
        active: false,
      }),
    ]);
  });

  it("creates, replaces, and audits; an identical write adds no audit", async () => {
    const created = await setService(TEST_BRANCH_ID, "BREAKFAST", offering());
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      kind: "BREAKFAST",
      priceUnit: "PER_PERSON",
      price: amount(1_200),
      childPrice: amount(600),
      active: true,
    });
    expect(
      (await setService(TEST_BRANCH_ID, "BREAKFAST", offering())).status,
    ).toBe(200);
    expect(await audits("service.update")).toHaveLength(1);

    const changed = await setService(
      TEST_BRANCH_ID,
      "BREAKFAST",
      offering({
        priceUnit: "PER_BOOKING",
        price: amount(5_000),
        childPrice: null,
      }),
    );
    expect(changed.status).toBe(200);
    const rows = await audits("service.update");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorId: "actor-admin",
      entityType: "ServiceOffering",
      branchId: TEST_BRANCH_ID,
      changes: { kind: "BREAKFAST", before: null },
    });
    expect(rows[1]!.changes).toMatchObject({
      before: { priceUnit: "PER_PERSON", price: amount(1_200) },
      after: {
        priceUnit: "PER_BOOKING",
        price: amount(5_000),
        childPrice: null,
      },
    });
    expect(JSON.stringify(rows)).not.toContain("Buffet");
    expect(await client.serviceOffering.count()).toBe(1);
  });

  it("scopes a Manager to assigned branches and hides nothing else", async () => {
    session.staff = manager([TEST_BRANCH_ID]);
    expect(
      (
        await setService(
          TEST_BRANCH_ID,
          "AIRPORT_TRANSFER",
          offering({
            priceUnit: "PER_BOOKING",
            price: amount(3_000),
            childPrice: null,
          }),
        )
      ).status,
    ).toBe(200);
    expect((await list(TEST_BRANCH_ID)).status).toBe(200);
    expect((await setService(GIZA, "BREAKFAST", offering())).status).toBe(403);
    expect((await list(GIZA)).status).toBe(403);
    expect(
      await client.serviceOffering.count({ where: { branchId: GIZA } }),
    ).toBe(0);
  });

  it("lets a Receptionist read but not write, and refuses signed out callers", async () => {
    session.staff = receptionist([TEST_BRANCH_ID]);
    expect((await list(TEST_BRANCH_ID)).status).toBe(200);
    expect(
      (await setService(TEST_BRANCH_ID, "BREAKFAST", offering())).status,
    ).toBe(403);
    session.staff = null;
    expect((await list(TEST_BRANCH_ID)).status).toBe(401);
    expect(await client.serviceOffering.count()).toBe(0);
    expect(await audits("service.update")).toHaveLength(0);
  });

  it("answers 404 for a missing branch and 422 for bad input", async () => {
    expect((await list("missing")).status).toBe(404);
    expect((await setService("missing", "BREAKFAST", offering())).status).toBe(
      404,
    );
    for (const [kind, body] of [
      ["SPA", offering()],
      ["BREAKFAST", offering({ price: amount(0) })],
      ["BREAKFAST", offering({ priceUnit: "PER_NIGHT" })],
      ["BREAKFAST", { ...offering(), priceMinor: 1 }],
    ] as const) {
      expect((await setService(TEST_BRANCH_ID, kind, body)).status).toBe(422);
    }
    expect(await client.serviceOffering.count()).toBe(0);
    expect(await audits("service.update")).toHaveLength(0);
  });

  it("rolls a create and an update back when the audit append fails", async () => {
    const failing = commercialUseCases(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit down");
        },
      }),
    }).services;
    await expect(
      failing.set(admin, TEST_BRANCH_ID, "BREAKFAST", offering()),
    ).rejects.toThrow("audit down");
    expect(await client.serviceOffering.count()).toBe(0);

    await setService(TEST_BRANCH_ID, "BREAKFAST", offering());
    const before = await client.serviceOffering.findFirstOrThrow();
    await expect(
      failing.set(
        admin,
        TEST_BRANCH_ID,
        "BREAKFAST",
        offering({ price: amount(9_900) }),
      ),
    ).rejects.toThrow("audit down");
    expect(await client.serviceOffering.findFirstOrThrow()).toEqual(before);
    expect(await audits("service.update")).toHaveLength(1);
  });

  it("flags a description only edit without copying the text", async () => {
    await setService(TEST_BRANCH_ID, "BREAKFAST", offering());
    await setService(
      TEST_BRANCH_ID,
      "BREAKFAST",
      offering({ description: "Served until 11:00" }),
    );
    const rows = await audits("service.update");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.changes).toMatchObject({ descriptionChanged: true });
    expect(rows[1]!.changes).toMatchObject({ descriptionChanged: true });
    expect(JSON.stringify(rows)).not.toContain("11:00");
    await setService(
      TEST_BRANCH_ID,
      "BREAKFAST",
      offering({ description: "Served until 11:00", price: amount(1_300) }),
    );
    expect((await audits("service.update"))[2]!.changes).toMatchObject({
      descriptionChanged: false,
    });
  });

  it("proves a second first write waits and keeps the audit chain over 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      for (let round = 0; round < 20; round += 1) {
        await client.auditEvent.deleteMany();
        await client.serviceOffering.deleteMany();
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
        }).services.set(
          admin,
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(1_000) }),
        );
        await held.promise;
        const probe = backendPid();
        const waiting = commercialUseCases(waiter!, {
          onBackend: probe.onBackend,
        }).services.set(
          admin,
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(2_000) }),
        );
        await waitForDatabaseLock(observer!, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a.ok && b.ok).toBe(true);
        expect(await client.serviceOffering.count()).toBe(1);
        const rows = await audits("service.update");
        expect(rows).toHaveLength(2);
        const [first, second] = rows.map((row) => row.changes) as {
          before: { price: { amountMinor: number } } | null;
          after: { price: { amountMinor: number } };
        }[];
        expect(first!.before).toBeNull();
        expect(first!.after.price.amountMinor).toBe(1_000);
        expect(second!.before).toEqual(first!.after);
        expect(second!.after.price.amountMinor).toBe(2_000);
        expect(
          (await client.serviceOffering.findFirstOrThrow()).priceMinor,
        ).toBe(2_000);
      }
    });
  }, 60_000);

  it("proves a second update of an existing offering waits and keeps the chain, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      for (let round = 0; round < 20; round += 1) {
        await client.auditEvent.deleteMany();
        await client.serviceOffering.deleteMany();
        await setService(
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(500) }),
        );
        await client.auditEvent.deleteMany();
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
        }).services.set(
          admin,
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(1_000) }),
        );
        await held.promise;
        const probe = backendPid();
        const waiting = commercialUseCases(waiter!, {
          onBackend: probe.onBackend,
        }).services.set(
          admin,
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(2_000) }),
        );
        await waitForDatabaseLock(observer!, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a.ok && b.ok).toBe(true);
        const rows = await audits("service.update");
        const prices = rows.map((row) => {
          const changes = row.changes as {
            before: { price: { amountMinor: number } };
            after: { price: { amountMinor: number } };
          };
          return [
            changes.before.price.amountMinor,
            changes.after.price.amountMinor,
          ];
        });
        expect(prices).toEqual([
          [500, 1_000],
          [1_000, 2_000],
        ]);
      }
    });
  }, 60_000);

  it("audits a null predecessor after a competing first insert rolls back, 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      for (let round = 0; round < 20; round += 1) {
        await client.auditEvent.deleteMany();
        await client.serviceOffering.deleteMany();
        const held = deferred();
        const release = deferred();
        const holding = commercialUseCases(holder!, {
          audit: (inner) => ({
            append: async (event) => {
              await inner.append(event);
              held.resolve();
              await release.promise;
              throw new Error("rollback first writer");
            },
          }),
        }).services.set(admin, TEST_BRANCH_ID, "BREAKFAST", offering());
        await held.promise;
        const probe = backendPid();
        const waiting = commercialUseCases(waiter!, {
          onBackend: probe.onBackend,
        }).services.set(
          admin,
          TEST_BRANCH_ID,
          "BREAKFAST",
          offering({ price: amount(2_000) }),
        );
        await waitForDatabaseLock(observer!, await probe.pid.promise);
        release.resolve();
        await expect(holding).rejects.toThrow("rollback first writer");
        await expect(waiting).resolves.toMatchObject({ ok: true });
        const rows = await audits("service.update");
        expect(rows).toHaveLength(1);
        expect(rows[0]!.changes).toMatchObject({ before: null });
        expect(
          (await client.serviceOffering.findFirstOrThrow()).priceMinor,
        ).toBe(2_000);
      }
    });
  }, 60_000);

  it("bounds a busy service row at five seconds with a retry response", async () => {
    await setService(TEST_BRANCH_ID, "BREAKFAST", offering());
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "ServiceOffering" FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const response = await setService(
        TEST_BRANCH_ID,
        "BREAKFAST",
        offering({ price: amount(9_900) }),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toMatchObject({ code: "TRY_AGAIN" });
      expect(await audits("service.update")).toHaveLength(1);
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  }, 20_000);
});

describe("A5 on PostgreSQL (T-TAX-3, T-TAX-4, M7 AC-5, AC-7)", () => {
  it("starts at 15% for every staff role that can read pricing", async () => {
    for (const staff of [admin, manager([TEST_BRANCH_ID]), receptionist([])]) {
      session.staff = staff;
      const response = await readVat();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ vatRateBasisPoints: 1500 });
    }
  });

  it("changes the rate for an Admin and audits from and to", async () => {
    const response = await setVat({ vatRateBasisPoints: 1400 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ vatRateBasisPoints: 1400 });
    expect(
      await client.commercialSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).toMatchObject({ vatRateBasisPoints: 1400, updatedById: "actor-admin" });
    const rows = await audits("commercial.update");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: "actor-admin",
      entityType: "CommercialSettings",
      entityId: "default",
      branchId: null,
      changes: { vatRateBasisPoints: { from: 1500, to: 1400 } },
    });
    expect((await setVat({ vatRateBasisPoints: 1400 })).status).toBe(200);
    expect(await audits("commercial.update")).toHaveLength(1);
  });

  it("accepts the 0 and 100% bounds", async () => {
    expect((await setVat({ vatRateBasisPoints: 0 })).status).toBe(200);
    expect((await setVat({ vatRateBasisPoints: 10_000 })).status).toBe(200);
    expect((await readVat().then((r) => r.json())).vatRateBasisPoints).toBe(
      10_000,
    );
  });

  it.each([-1, 10_001, 14.5, null, "15", undefined])(
    "refuses %s with 422 and keeps the stored rate",
    async (value) => {
      const response = await setVat({ vatRateBasisPoints: value });
      expect(response.status).toBe(422);
      expect(
        (await response.json()).fieldErrors?.vatRateBasisPoints,
      ).toBeDefined();
      expect(
        (
          await client.commercialSettings.findUniqueOrThrow({
            where: { id: "default" },
          })
        ).vatRateBasisPoints,
      ).toBe(1500);
      expect(await audits("commercial.update")).toHaveLength(0);
    },
  );

  it("refuses a missing body key and non Admin writers", async () => {
    expect((await setVat({})).status).toBe(422);
    for (const staff of [manager([TEST_BRANCH_ID]), receptionist([])]) {
      session.staff = staff;
      expect((await setVat({ vatRateBasisPoints: 0 })).status).toBe(403);
    }
    session.staff = null;
    expect((await setVat({ vatRateBasisPoints: 0 })).status).toBe(401);
    expect(await audits("commercial.update")).toHaveLength(0);
  });

  it("rolls back and keeps the old rate when the audit append fails", async () => {
    const failing = commercialUseCases(client, {
      audit: () => ({
        append: async () => {
          throw new Error("audit down");
        },
      }),
    }).settings;
    await expect(
      failing.update(admin, { vatRateBasisPoints: 1000 }),
    ).rejects.toThrow("audit down");
    expect(
      (
        await client.commercialSettings.findUniqueOrThrow({
          where: { id: "default" },
        })
      ).vatRateBasisPoints,
    ).toBe(1500);
    expect(await audits("commercial.update")).toHaveLength(0);
  });

  it("proves a second edit waits and keeps the audit chain over 20 races", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      for (let round = 0; round < 20; round += 1) {
        await client.auditEvent.deleteMany();
        await client.commercialSettings.update({
          where: { id: "default" },
          data: { vatRateBasisPoints: 1500 },
        });
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
        }).settings.update(admin, { vatRateBasisPoints: 1000 });
        await held.promise;
        const probe = backendPid();
        const waiting = commercialUseCases(waiter!, {
          onBackend: probe.onBackend,
        }).settings.update(admin, { vatRateBasisPoints: 2000 });
        await waitForDatabaseLock(observer!, await probe.pid.promise);
        release.resolve();
        const [a, b] = await Promise.all([holding, waiting]);
        expect(a.ok && b.ok).toBe(true);
        const rows = await audits("commercial.update");
        expect(rows.map((row) => row.changes)).toEqual([
          { vatRateBasisPoints: { from: 1500, to: 1000 } },
          { vatRateBasisPoints: { from: 1000, to: 2000 } },
        ]);
        expect(
          (
            await client.commercialSettings.findUniqueOrThrow({
              where: { id: "default" },
            })
          ).vatRateBasisPoints,
        ).toBe(2000);
      }
    });
  }, 60_000);

  it("bounds a busy settings row at five seconds with a retry response", async () => {
    const holder = createTestClient();
    const held = deferred();
    const release = deferred();
    const holding = holder.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "CommercialSettings" FOR UPDATE`;
        held.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    try {
      await held.promise;
      const response = await setVat({ vatRateBasisPoints: 1000 });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toMatchObject({ code: "TRY_AGAIN" });
      expect(await audits("commercial.update")).toHaveLength(0);
    } finally {
      release.resolve();
      await holding;
      await holder.$disconnect();
    }
  }, 20_000);
});
