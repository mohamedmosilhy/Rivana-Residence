import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// M6-T8 (API-S20) through a real browser session: the grid shape, no-store,
// blocks lowering capacity, the 400 versus 422 split, roles, and branch scope.

type ApiResult = {
  status: number;
  headers: Record<string, string>;
  body: {
    roomTypes?: {
      id: string;
      nights: {
        night: string;
        capacity: number;
        sold: number;
        free: number;
        blocked: number;
      }[];
    }[];
    lastSyncCheckpoint?: string | null;
  };
};

function api(page: Page, path: string) {
  return page.evaluate(async (target): Promise<ApiResult> => {
    const response = await fetch(target);
    const text = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text ? JSON.parse(text) : {},
    };
  }, path);
}

async function cairo() {
  return (
    await sql(
      'SELECT b.id AS branch, r.id AS room FROM "Branch" b JOIN "Room" r ON r."branchId" = b.id WHERE b.slug = $1 ORDER BY r."sortOrder", r.id LIMIT 1',
      ["new-cairo"],
    )
  ).rows[0];
}

test("staff read the availability grid and a block lowers capacity", async ({
  page,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const place = await cairo();
  const unitId = `e2e-av-${testInfo.project.name}-${testInfo.retry}`;
  const blockId = `${unitId}-b`;
  const path = `/api/v1/staff/branches/${place.branch}/availability`;
  const window = "from=2090-03-10&to=2090-03-13";

  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, active, "updatedAt") VALUES ($1, $2, $3, $1, true, now())',
    [unitId, place.branch, place.room],
  );
  await sql(
    `INSERT INTO "InventoryBlock" (id, "branchId", "physicalRoomId", "startDate", "endDate", reason, "createdById")
     VALUES ($1, $2, $3, '2090-03-11', '2090-03-12', 'MAINTENANCE', (SELECT id FROM "User" WHERE email = $4))`,
    [blockId, place.branch, unitId, accounts.admin],
  );

  try {
    await page.goto("/admin/login");
    expect((await api(page, `${path}?${window}`)).status).toBe(401);
    await signInAs(page, accounts.admin);

    const grid = await api(page, `${path}?${window}`);
    expect(grid.status).toBe(200);
    expect(grid.headers["cache-control"]).toBe("no-store");
    expect(grid.body.lastSyncCheckpoint).toBeNull();
    const nights = grid.body.roomTypes?.find(
      (room) => room.id === place.room,
    )?.nights;
    expect(nights?.map((row) => row.night)).toEqual([
      "2090-03-10",
      "2090-03-11",
      "2090-03-12",
    ]);
    // The block removes this unit from capacity on exactly one night.
    expect(nights?.[1]?.blocked).toBe(1);
    expect(nights?.[0]?.blocked).toBe(0);
    expect(nights?.[1]?.capacity).toBe((nights?.[0]?.capacity ?? 0) - 1);
    expect(nights?.every((row) => row.sold === 0)).toBe(true);

    // Calendar and length rules are 422; query structure is 400.
    expect(
      (await api(page, `${path}?from=2090-02-30&to=2090-03-02`)).status,
    ).toBe(422);
    expect(
      (await api(page, `${path}?from=2090-03-01&to=2090-08-01`)).status,
    ).toBe(422);
    expect((await api(page, `${path}?from=2090-03-01`)).status).toBe(400);
    expect((await api(page, `${path}?${window}&x=1`)).status).toBe(400);
  } finally {
    await sql('DELETE FROM "InventoryBlock" WHERE id = $1', [blockId]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [unitId]);
  }
});

test("availability grid keeps role and branch restrictions", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const place = await cairo();
  const giza = (
    await sql('SELECT id FROM "Branch" WHERE slug = $1', ["demo-giza"])
  ).rows[0];
  const window = "from=2090-03-10&to=2090-03-13";

  for (const role of ["manager", "receptionist", "editor"] as const) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInAs(page, accounts[role]);
      expect(
        (
          await api(
            page,
            `/api/v1/staff/branches/${place.branch}/availability?${window}`,
          )
        ).status,
      ).toBe(role === "editor" ? 403 : 200);
      if (giza) {
        expect(
          (
            await api(
              page,
              `/api/v1/staff/branches/${giza.id}/availability?${window}`,
            )
          ).status,
        ).toBe(403);
      }
    } finally {
      await context.close();
    }
  }
});
