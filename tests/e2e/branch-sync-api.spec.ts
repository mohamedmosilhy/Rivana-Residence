import { expect, test, type Page } from "@playwright/test";

import { SyncStatus } from "../../src/contracts/api/v1/branch-sync";
import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable test database.",
);

function request(page: Page, path: string, kind?: "STARTED" | "COMPLETED") {
  return page.evaluate(
    async ({ path, kind }) => {
      const response = await fetch(
        path,
        kind
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind }),
            }
          : {},
      );
      return {
        status: response.status,
        cache: response.headers.get("cache-control"),
        body: await response.json(),
      };
    },
    { path, kind },
  );
}

// T-SYNCAPI-2. Exercise the real server, sessions and database on both viewports.
test("a manual sync updates another staff session and the availability grid", async ({
  page,
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const branchId = `sync-${testInfo.project.name}-${testInfo.retry}`;
  const base = `/api/v1/staff/branches/${branchId}`;
  const statusPath = `${base}/sync-status`;
  const checkpointPath = `${base}/sync-checkpoints`;
  const gridPath = `${base}/availability?from=2090-03-10&to=2090-03-11`;
  const second = await browser.newContext();
  try {
    await sql(
      `INSERT INTO "Branch" (id, slug, name, status, "sortOrder", "updatedAt")
       VALUES ($1, $1, 'Sync test branch', 'INACTIVE', 100, now())`,
      [branchId],
    );
    await sql(
      `INSERT INTO "StaffBranchAssignment" ("userId", "branchId")
               SELECT id, $1 FROM "User" WHERE email = $2`,
      [branchId, accounts.receptionist],
    );
    await page.goto("/admin/login");
    expect((await request(page, statusPath)).status).toBe(401);
    await signInAs(page, accounts.receptionist);
    const admin = await second.newPage();
    await signInAs(admin, accounts.admin);

    const initial = await request(page, statusPath);
    expect(initial.status).toBe(200);
    expect(initial.cache).toBe("no-store");
    const empty = SyncStatus.parse(initial.body);
    expect(empty).toMatchObject({
      due: true,
      lastCompletedAt: null,
      notEnteredInHotelSystem: 0,
    });
    expect(empty.dueAt).toBe(empty.serverTime);

    const startedResponse = await request(page, checkpointPath, "STARTED");
    expect(startedResponse.status).toBe(201);
    const started = SyncStatus.parse(startedResponse.body);
    expect(started).toMatchObject({
      due: false,
      lastCompletedAt: null,
      startedAt: expect.any(String),
    });
    expect(
      Date.parse(started.dueAt) - Date.parse(started.startedAt ?? ""),
    ).toBe(10 * 60_000);
    expect(
      SyncStatus.parse((await request(admin, statusPath)).body).startedAt,
    ).toBe(started.startedAt);

    const completionResponse = await request(
      admin,
      checkpointPath,
      "COMPLETED",
    );
    expect(completionResponse.status).toBe(201);
    const completed = SyncStatus.parse(completionResponse.body);
    expect(completed).toMatchObject({
      due: false,
      lastCompletedAt: expect.any(String),
      lastCompletedBy: expect.any(String),
    });
    expect(completed).not.toHaveProperty("startedAt");
    expect(
      Date.parse(completed.dueAt) - Date.parse(completed.lastCompletedAt ?? ""),
    ).toBe(30 * 60_000);
    const observed = SyncStatus.parse((await request(page, statusPath)).body);
    expect(observed).toMatchObject({
      due: false,
      dueAt: completed.dueAt,
      lastCompletedAt: completed.lastCompletedAt,
    });
    const grid = await request(page, gridPath);
    expect(grid.status).toBe(200);
    expect(grid.body.lastSyncCheckpoint).toBe(completed.lastCompletedAt);

    const { rows } = await sql(
      `SELECT "actorId", changes FROM "AuditEvent"
                                WHERE "branchId" = $1 AND action = 'sync-checkpoint.recorded'`,
      [branchId],
    );
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      actorId: completed.lastCompletedBy,
      changes: { kind: "COMPLETED", noteProvided: false },
    });
    expect(rows).toContainEqual({
      actorId: expect.any(String),
      changes: { kind: "STARTED", noteProvided: false },
    });
  } finally {
    await second.close();
    await sql('DELETE FROM "AuditEvent" WHERE "branchId" = $1', [branchId]);
    await sql('DELETE FROM "BranchSyncCheckpoint" WHERE "branchId" = $1', [
      branchId,
    ]);
    await sql('DELETE FROM "StaffBranchAssignment" WHERE "branchId" = $1', [
      branchId,
    ]);
    await sql('DELETE FROM "Branch" WHERE id = $1', [branchId]);
  }
});
