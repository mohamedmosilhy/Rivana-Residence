import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { CheckHealth } from "@/application/health";
import { resolveStaffSession } from "@/infrastructure/auth/staff-session";
import { PrismaDatabaseProbe } from "@/infrastructure/db/prisma/database-probe";

import {
  StaffAdminError,
  assignStaffBranch,
  listStaff,
  setStaffRole,
  unassignStaffBranch,
} from "../../scripts/staff-admin";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  cookieHeader,
  createTestAuth,
  provision,
  signIn,
} from "./support/auth";
import {
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
const { auth, directory } = createTestAuth(client);
const OTHER = "branch-giza-0000000000000000";

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createBranch(client, { id: OTHER, slug: "giza", sortOrder: 1 });
});

async function principalFor(email: string) {
  return resolveStaffSession(
    auth,
    directory,
    cookieHeader(await signIn(auth, email)),
  );
}

async function auditActions() {
  return (
    await client.auditEvent.findMany({ orderBy: { occurredAt: "asc" } })
  ).map(({ action, actorType, actorId, changes }) => ({
    action,
    actorType,
    actorId,
    changes,
  }));
}

// AC-5 (session side): the principal carries the assignments, reloaded on
// every request (ADR 018).
describe("principal branch scope", () => {
  it("loads a receptionist's assigned branches with the session", async () => {
    await provision(client, "rana@example.test", "RECEPTIONIST", {
      branches: ["new-cairo", "giza"],
    });
    expect((await principalFor("rana@example.test"))?.branchIds).toEqual(
      [TEST_BRANCH_ID, OTHER].sort(),
    );
  });

  it("gives an unassigned manager no branches", async () => {
    await provision(client, "mona@example.test", "MANAGER");
    expect(await principalFor("mona@example.test")).toMatchObject({
      role: "MANAGER",
      branchIds: [],
    });
  });

  it("applies an assignment change on the next request", async () => {
    await provision(client, "rana@example.test", "RECEPTIONIST", {
      branches: ["new-cairo"],
    });
    const cookies = await signIn(auth, "rana@example.test");
    const resolve = () =>
      resolveStaffSession(auth, directory, cookieHeader(cookies));
    expect((await resolve())?.branchIds).toEqual([TEST_BRANCH_ID]);

    await unassignStaffBranch(client, "rana@example.test", "new-cairo");
    expect((await resolve())?.branchIds).toEqual([]);
  });
});

describe("staff CLI branch commands", () => {
  it("creates a receptionist with branches and audits each assignment", async () => {
    const created = await provision(
      client,
      "rana@example.test",
      "RECEPTIONIST",
      {
        branches: ["new-cairo"],
      },
    );
    expect(created).toMatchObject({
      role: "RECEPTIONIST",
      branches: ["new-cairo"],
    });
    expect(await auditActions()).toEqual([
      {
        action: "staff.branch-assigned",
        actorType: "SYSTEM",
        actorId: null,
        changes: { branchId: TEST_BRANCH_ID },
      },
    ]);
  });

  it.each(["ADMIN", "EDITOR"] as const)(
    "refuses branches for a new %s",
    async (role) => {
      await expect(
        provision(client, "x@example.test", role, { branches: ["new-cairo"] }),
      ).rejects.toBeInstanceOf(StaffAdminError);
      expect(await client.user.count()).toBe(0);
    },
  );

  it("refuses an unknown branch slug and creates nothing", async () => {
    await expect(
      provision(client, "rana@example.test", "RECEPTIONIST", {
        branches: ["luxor"],
      }),
    ).rejects.toThrow('No branch with the slug "luxor".');
    expect(await client.user.count()).toBe(0);
  });

  it("assigns and unassigns idempotently, auditing only real changes", async () => {
    await provision(client, "mona@example.test", "MANAGER");
    expect(await assignStaffBranch(client, "mona@example.test", "giza")).toBe(
      true,
    );
    expect(await assignStaffBranch(client, "mona@example.test", "giza")).toBe(
      false,
    );
    expect(await unassignStaffBranch(client, "mona@example.test", "giza")).toBe(
      true,
    );
    expect(await unassignStaffBranch(client, "mona@example.test", "giza")).toBe(
      false,
    );
    expect((await auditActions()).map((event) => event.action)).toEqual([
      "staff.branch-assigned",
      "staff.branch-unassigned",
    ]);
  });

  it("allows an inactive branch to be assigned", async () => {
    await client.branch.update({
      where: { id: OTHER },
      data: { status: "INACTIVE" },
    });
    await provision(client, "mona@example.test", "MANAGER");
    expect(await assignStaffBranch(client, "mona@example.test", "giza")).toBe(
      true,
    );
  });

  it("refuses to assign a branch to an administrator or editor", async () => {
    await provision(client, "amira@example.test", "ADMIN");
    await expect(
      assignStaffBranch(client, "amira@example.test", "giza"),
    ).rejects.toThrow(/only receptionists and managers/);
  });

  it("clears assignments when the role becomes administrator, in one audited change", async () => {
    await provision(client, "amira@example.test", "ADMIN");
    await provision(client, "mona@example.test", "MANAGER", {
      branches: ["new-cairo", "giza"],
    });
    await setStaffRole(client, "mona@example.test", "ADMIN");

    expect(await client.staffBranchAssignment.count()).toBe(0);
    expect((await auditActions()).map((event) => event.action)).toEqual([
      "staff.branch-assigned",
      "staff.branch-assigned",
      "staff.role-changed",
      "staff.branch-unassigned",
      "staff.branch-unassigned",
    ]);
    expect((await auditActions())[2]?.changes).toEqual({
      role: { from: "MANAGER", to: "ADMIN" },
    });
  });

  it("still refuses to demote the last active administrator", async () => {
    await provision(client, "amira@example.test", "ADMIN");
    await expect(
      setStaffRole(client, "amira@example.test", "RECEPTIONIST"),
    ).rejects.toThrow("last active administrator");
  });

  it("lists branch scope per account", async () => {
    await provision(client, "amira@example.test", "ADMIN");
    await provision(client, "omar@example.test", "EDITOR");
    await provision(client, "rana@example.test", "RECEPTIONIST", {
      branches: ["giza", "new-cairo"],
    });
    await provision(client, "mona@example.test", "MANAGER");
    const scope = Object.fromEntries(
      (await listStaff(client)).map((row) => [row.email, row.branches]),
    );
    expect(scope).toEqual({
      "amira@example.test": "all",
      "omar@example.test": "-",
      "rana@example.test": "giza, new-cairo",
      "mona@example.test": "none",
    });
  });
});

// AC-2: the health use case against a real database, up and unreachable.
describe("health check", () => {
  it("reports ok with the database up", async () => {
    expect(
      await new CheckHealth(new PrismaDatabaseProbe(client)).execute(),
    ).toEqual({ ok: true, value: { status: "ok", database: "ok" } });
  });

  it("reports TRY_AGAIN quickly when the database is unreachable", async () => {
    const unreachable = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: "postgresql://nobody@127.0.0.1:1/none_test",
        options: "-c TimeZone=UTC",
      }),
    });
    try {
      const started = Date.now();
      const result = await new CheckHealth(
        new PrismaDatabaseProbe(unreachable),
        2000,
      ).execute();
      expect(result).toMatchObject({ ok: false, error: { code: "TRY_AGAIN" } });
      expect(Date.now() - started).toBeLessThan(2500);
    } finally {
      await unreachable.$disconnect();
    }
  });
});
