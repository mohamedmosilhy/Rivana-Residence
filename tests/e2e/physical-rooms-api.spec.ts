import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// M6-T5 (API-S21…S23) through a real browser session: success shapes,
// Location, no-store, strict bodies, role and branch restrictions, CSRF.

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
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.json(),
      };
    },
    { path, method, body },
  );
}

test("staff manage physical units over REST and the audit trail records it", async ({
  page,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const label = `E2E-${testInfo.project.name}-${testInfo.retry}`;
  const cairo = (
    await sql(
      'SELECT b.id AS branch, r.id AS room FROM "Branch" b JOIN "Room" r ON r."branchId" = b.id WHERE b.slug = $1 ORDER BY r."sortOrder", r.id LIMIT 1',
      ["new-cairo"],
    )
  ).rows[0];
  const base = `/api/v1/staff/branches/${cairo.branch}/physical-rooms`;

  await page.goto("/admin/login");
  expect((await api(page, base)).status).toBe(401);
  await signInAs(page, accounts.admin);

  let unitId: string | undefined;
  try {
    const created = await api(page, base, "POST", {
      roomTypeId: cairo.room,
      label,
      notes: "e2e private note",
    });
    expect(created.status).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    unitId = String(created.body.id);
    expect(created.headers.location).toBe(
      `/api/v1/staff/physical-rooms/${unitId}`,
    );
    expect(created.body).toMatchObject({
      branchId: cairo.branch,
      roomTypeId: cairo.room,
      label,
      active: true,
    });

    const duplicate = await api(page, base, "POST", {
      roomTypeId: cairo.room,
      label,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.fieldErrors?.label).toBeDefined();

    expect(
      (await api(page, base, "POST", { roomTypeId: cairo.room, label: "" }))
        .status,
    ).toBe(422);
    expect(
      (
        await api(page, base, "POST", {
          roomTypeId: cairo.room,
          label: "x",
          branchId: "other",
        })
      ).status,
    ).toBe(422);

    const listed = await api(page, base);
    expect(listed.status).toBe(200);
    expect(listed.body.items?.map((item: { id: string }) => item.id)).toContain(
      unitId,
    );

    const item = `/api/v1/staff/physical-rooms/${unitId}`;
    expect((await api(page, item, "PATCH", {})).status).toBe(422);
    const renamed = await api(page, item, "PATCH", { label: `${label}-b` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.label).toBe(`${label}-b`);
    const off = await api(page, item, "PATCH", { active: false });
    expect(off).toMatchObject({ status: 200, body: { active: false } });
    expect(
      (
        await api(page, "/api/v1/staff/physical-rooms/nope", "PATCH", {
          label: "x",
        })
      ).status,
    ).toBe(404);

    const audits = await sql(
      'SELECT action, changes FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "occurredAt"',
      [unitId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      "physical-room.created",
      "physical-room.updated",
      "physical-room.updated",
    ]);
    expect(JSON.stringify(audits.rows)).not.toContain("e2e private note");

    // CSRF: the browser would overwrite a spoofed Origin, so forward the
    // session cookie from the HTTP client instead.
    const cookie = (await page.context().cookies())
      .filter((entry) => entry.name.endsWith("rivana-staff.session_token"))
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    const refused = await page.request.patch(item, {
      headers: {
        cookie,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      data: { label: "must-not-save" },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CROSS_SITE_REQUEST" });
  } finally {
    if (unitId) {
      await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [unitId]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [unitId]);
    }
  }
});

test("physical unit REST keeps role and branch restrictions", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const rows = (
    await sql(
      'SELECT id, slug FROM "Branch" WHERE slug IN ($1, $2) ORDER BY slug',
      ["new-cairo", "demo-giza"],
    )
  ).rows;
  const cairo = rows.find((row) => row.slug === "new-cairo");
  const giza = rows.find((row) => row.slug === "demo-giza");
  const room = (
    await sql('SELECT id FROM "Room" WHERE "branchId" = $1 LIMIT 1', [cairo.id])
  ).rows[0];

  for (const role of ["manager", "receptionist", "editor"] as const) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInAs(page, accounts[role]);
      const own = `/api/v1/staff/branches/${cairo.id}/physical-rooms`;
      const listed = await api(page, own);
      expect(listed.status).toBe(role === "editor" ? 403 : 200);
      if (giza) {
        expect(
          (await api(page, `/api/v1/staff/branches/${giza.id}/physical-rooms`))
            .status,
        ).toBe(403);
      }
      const created = await api(page, own, "POST", {
        roomTypeId: room.id,
        label: `forbidden-${role}-${testInfo.project.name}`,
      });
      if (role === "manager") {
        expect(created.status).toBe(201);
        await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [
          created.body.id,
        ]);
        await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [
          created.body.id,
        ]);
      } else {
        expect(created.status).toBe(403);
      }
    } finally {
      await context.close();
    }
  }
  const leftovers = await sql(
    'SELECT count(*)::int AS n FROM "PhysicalRoom" WHERE label LIKE $1',
    ["forbidden-%"],
  );
  expect(leftovers.rows[0].n).toBe(0);
});
