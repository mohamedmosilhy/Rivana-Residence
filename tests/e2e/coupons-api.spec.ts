import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

type ApiResult = {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown> & {
    id?: string;
    items?: { id: string; code: string }[];
    code?: string;
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

test("staff manage coupons through S37 to S39 with branch scope and audit", async ({
  page,
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const code = `CPN-${testInfo.project.name === "desktop-chromium" ? "DESKTOP" : "MOBILE"}-${testInfo.retry}`;
  const branchId = (
    await sql('SELECT id FROM "Branch" WHERE slug = $1', ["new-cairo"])
  ).rows[0].id;
  const ids: string[] = [];
  const body = {
    code,
    kind: "PERCENT",
    percentBasisPoints: 1500,
    allBranches: false,
    branchIds: [branchId],
    active: true,
  };
  const root = "/api/v1/staff/coupons";
  await page.goto("/admin/login");
  expect((await api(page, root)).status).toBe(401);
  await signInAs(page, accounts.admin);
  try {
    const created = await api(page, root, "POST", body);
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    ids.push(id);
    expect(created.headers.location).toBe(`${root}/${id}`);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(
      (await api(page, root, "POST", { ...body, code: code.toLowerCase() }))
        .status,
    ).toBe(409);
    const global = await api(page, root, "POST", {
      ...body,
      code: `${code}-ALL`,
      allBranches: true,
      branchIds: [],
    });
    expect(global.status).toBe(201);
    ids.push(String(global.body.id));
    const context = await browser.newContext();
    try {
      const manager = await context.newPage();
      await signInAs(manager, accounts.manager);
      const listed = await api(manager, `${root}?q=${code}`);
      expect(listed.status).toBe(200);
      expect(listed.body.items?.map((item) => item.id)).toEqual([id]);
      expect(
        (await api(manager, `${root}/${id}`, "PATCH", { active: false }))
          .status,
      ).toBe(200);
      expect(
        (
          await api(manager, `${root}/${id}`, "PATCH", {
            allBranches: true,
            branchIds: [],
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api(manager, `${root}/${global.body.id}`, "PATCH", {
            active: false,
          })
        ).status,
      ).toBe(404);
      expect(
        (await api(manager, `${root}/${id}`, "PATCH", { code: "IMMUTABLE" }))
          .status,
      ).toBe(422);
      expect(
        (await api(manager, `${root}/${id}`, "PATCH", { active: false }))
          .status,
      ).toBe(200);
    } finally {
      await context.close();
    }
    const audit = await sql(
      'SELECT action, changes FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "occurredAt"',
      [id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "coupon.create",
      "coupon.update",
    ]);
    expect(audit.rows[1].changes).toMatchObject({
      before: { active: true },
      after: { active: false },
    });
    await testInfo.attach("coupon-api-proof", {
      body: JSON.stringify(
        {
          created,
          listed: await api(page, `${root}?q=${code}`),
          audit: audit.rows,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  } finally {
    await sql('DELETE FROM "AuditEvent" WHERE "entityId" = ANY($1::text[])', [
      ids,
    ]);
    await sql('DELETE FROM "Coupon" WHERE id = ANY($1::text[])', [ids]);
  }
});
