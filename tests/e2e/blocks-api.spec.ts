import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// M6-T6 (API-S24…S27) through a real browser session: success shapes,
// Location, no-store, 204, overlap and validation refusals, audit without
// note bodies, role and branch restrictions, CSRF.

type ApiResult = {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown> & {
    id?: string;
    items?: { id: string }[];
    fieldErrors?: Record<string, string[]>;
  };
};

function api(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async (input): Promise<ApiResult> => {
      const response = await fetch(input.path, {
        method: input.method,
        ...(input.body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input.body),
            }),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text ? JSON.parse(text) : {},
      };
    },
    { path, method, body },
  );
}

async function cairo() {
  return (
    await sql(
      'SELECT b.id AS branch, r.id AS room FROM "Branch" b JOIN "Room" r ON r."branchId" = b.id WHERE b.slug = $1 ORDER BY r."sortOrder", r.id LIMIT 1',
      ["new-cairo"],
    )
  ).rows[0];
}

test("staff manage blocks over REST and the audit trail records it", async ({
  page,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const place = await cairo();
  const unitId = `e2e-blk-${testInfo.project.name}-${testInfo.retry}`;
  const base = `/api/v1/staff/branches/${place.branch}/blocks`;
  const window = "from=2090-03-01&to=2090-03-31";
  let blockId: string | undefined;

  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, active, "updatedAt") VALUES ($1, $2, $3, $1, true, now())',
    [unitId, place.branch, place.room],
  );

  await page.goto("/admin/login");
  expect((await api(page, `${base}?${window}`)).status).toBe(401);
  await signInAs(page, accounts.admin);

  try {
    const created = await api(page, base, "POST", {
      physicalRoomId: unitId,
      startDate: "2090-03-10",
      endDate: "2090-03-12",
      reason: "MAINTENANCE",
      note: "e2e private note",
    });
    expect(created.status).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    blockId = String(created.body.id);
    expect(created.headers.location).toBe(`/api/v1/staff/blocks/${blockId}`);
    expect(created.body).toMatchObject({
      branchId: place.branch,
      physicalRoomId: unitId,
      startDate: "2090-03-10",
      endDate: "2090-03-12",
      cancelledAt: null,
    });

    const overlap = await api(page, base, "POST", {
      physicalRoomId: unitId,
      startDate: "2090-03-11",
      endDate: "2090-03-13",
      reason: "OTHER",
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.fieldErrors?.startDate).toBeDefined();

    for (const bad of [
      {
        physicalRoomId: unitId,
        startDate: "2090-03-10",
        endDate: "2090-03-10",
        reason: "OTHER",
      },
      {
        physicalRoomId: unitId,
        startDate: "2090-03-20",
        endDate: "2090-03-22",
        reason: "NOPE",
      },
      {
        physicalRoomId: unitId,
        startDate: "2090-03-20",
        endDate: "2090-03-22",
        reason: "OTHER",
        branchId: "x",
      },
    ]) {
      expect((await api(page, base, "POST", bad)).status).toBe(422);
    }
    expect(
      (
        await api(page, base, "POST", {
          physicalRoomId: "nope",
          startDate: "2090-03-20",
          endDate: "2090-03-22",
          reason: "OTHER",
        })
      ).status,
    ).toBe(404);

    const listed = await api(page, `${base}?${window}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items?.map((item) => item.id)).toContain(blockId);
    expect(
      (await api(page, `${base}?from=2090-01-01&to=2090-12-31`)).status,
    ).toBe(422);

    const item = `/api/v1/staff/blocks/${blockId}`;
    expect((await api(page, item, "PATCH", {})).status).toBe(422);
    const extended = await api(page, item, "PATCH", { endDate: "2090-03-15" });
    expect(extended).toMatchObject({
      status: 200,
      body: { endDate: "2090-03-15" },
    });
    expect(
      (await api(page, item, "PATCH", { note: "another private note" })).status,
    ).toBe(200);
    expect(
      (await api(page, "/api/v1/staff/blocks/nope", "PATCH", { note: "x" }))
        .status,
    ).toBe(404);

    // Cancellation is idempotent and a cancelled block cannot change.
    const cancelled = await api(page, item, "DELETE");
    expect(cancelled.status).toBe(204);
    expect(cancelled.headers["cache-control"]).toBe("no-store");
    expect((await api(page, item, "DELETE")).status).toBe(204);
    expect(
      (await api(page, item, "PATCH", { endDate: "2090-03-16" })).status,
    ).toBe(409);
    expect(
      (await api(page, "/api/v1/staff/blocks/nope", "DELETE")).status,
    ).toBe(404);

    const audits = await sql(
      'SELECT action, changes FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "occurredAt", id',
      [blockId],
    );
    expect(audits.rows.map((row) => row.action).sort()).toEqual([
      "inventory-block.cancelled",
      "inventory-block.created",
      "inventory-block.updated",
      "inventory-block.updated",
    ]);
    expect(JSON.stringify(audits.rows)).not.toContain("private note");

    const cookie = (await page.context().cookies())
      .filter((entry) => entry.name.endsWith("rivana-staff.session_token"))
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    const refused = await page.request.delete(item, {
      headers: {
        cookie,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CROSS_SITE_REQUEST" });
  } finally {
    if (blockId) {
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [blockId]);
    }
    await sql('DELETE FROM "InventoryBlock" WHERE "physicalRoomId" = $1', [
      unitId,
    ]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [unitId]);
  }
});

test("block REST keeps role and branch restrictions", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const place = await cairo();
  const giza = (
    await sql('SELECT id FROM "Branch" WHERE slug = $1', ["demo-giza"])
  ).rows[0];
  const window = "from=2090-03-01&to=2090-03-31";
  const unitId = `e2e-blk-role-${testInfo.project.name}-${testInfo.retry}`;
  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, active, "updatedAt") VALUES ($1, $2, $3, $1, true, now())',
    [unitId, place.branch, place.room],
  );
  const created: string[] = [];
  try {
    for (const role of ["manager", "receptionist", "editor"] as const) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInAs(page, accounts[role]);
        const own = `/api/v1/staff/branches/${place.branch}/blocks`;
        expect((await api(page, `${own}?${window}`)).status).toBe(
          role === "editor" ? 403 : 200,
        );
        if (giza) {
          expect(
            (
              await api(
                page,
                `/api/v1/staff/branches/${giza.id}/blocks?${window}`,
              )
            ).status,
          ).toBe(403);
        }
        const result = await api(page, own, "POST", {
          physicalRoomId: unitId,
          startDate: "2090-03-20",
          endDate: "2090-03-21",
          reason: "OTHER",
        });
        if (role === "editor") {
          expect(result.status).toBe(403);
        } else {
          // Managers and receptionists both manage blocks in their branch.
          expect([201, 409]).toContain(result.status);
          if (result.status === 201) {
            created.push(String(result.body.id));
            expect(
              (
                await api(
                  page,
                  `/api/v1/staff/blocks/${result.body.id}`,
                  "DELETE",
                )
              ).status,
            ).toBe(204);
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    for (const id of created) {
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [id]);
    }
    await sql('DELETE FROM "InventoryBlock" WHERE "physicalRoomId" = $1', [
      unitId,
    ]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [unitId]);
  }
});
