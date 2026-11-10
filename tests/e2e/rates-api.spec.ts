import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

type ApiResult = {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown> & {
    id?: string;
    calendar?: { amount: { amountMinor: number } | null }[];
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

const money = (amountMinor: number) => ({ amountMinor, currency: "USD" });

async function newRoom(id: string) {
  const branch = (
    await sql('SELECT id FROM "Branch" WHERE slug = $1', ["new-cairo"])
  ).rows[0].id;
  await sql(
    'INSERT INTO "Room" (id, "branchId", name, slug, "shortDescription", description, "maxAdults", "sortOrder", status, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, 2, $7, \'DRAFT\', now())',
    [
      id,
      branch,
      `Rate test ${id}`,
      id,
      "Rate API test",
      '{"type":"doc","content":[]}',
      id.includes("role") ? -9_998 : -9_999,
    ],
  );
  return branch;
}

async function cleanup(roomTypeId: string) {
  await sql(
    'DELETE FROM "AuditEvent" WHERE "entityId" IN (SELECT id FROM "RatePeriod" WHERE "roomTypeId" = $1) OR "entityId" = $1',
    [roomTypeId],
  );
  await sql('DELETE FROM "RatePeriod" WHERE "roomTypeId" = $1', [roomTypeId]);
  await sql('DELETE FROM "RoomBaseRate" WHERE "roomTypeId" = $1', [roomTypeId]);
  await sql('DELETE FROM "Room" WHERE id = $1', [roomTypeId]);
}

test("staff manage rates through S30 to S34 with audit and conflicts", async ({
  page,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const roomTypeId = `e2e-rate-${testInfo.project.name}-${testInfo.retry}`;
  await newRoom(roomTypeId);
  const rates = `/api/v1/staff/room-types/${roomTypeId}/rates`;
  const base = `/api/v1/staff/room-types/${roomTypeId}/base-rate`;
  const periods = `/api/v1/staff/room-types/${roomTypeId}/rate-periods`;
  const query = "from=2090-03-10&to=2090-03-14";
  const periodIds: string[] = [];

  await page.goto("/admin/login");
  expect((await api(page, `${rates}?${query}`)).status).toBe(401);
  await signInAs(page, accounts.admin);

  try {
    const baseResult = await api(page, base, "PUT", { amount: money(5_000) });
    expect(baseResult).toMatchObject({
      status: 200,
      body: { amountMinor: 5_000, currency: "USD" },
    });
    for (const input of [
      {
        startDate: "2090-03-10",
        endDate: "2090-03-12",
        amount: money(6_000),
        label: "High season",
      },
      {
        startDate: "2090-03-12",
        endDate: "2090-03-14",
        amount: money(7_000),
        label: "Peak",
      },
    ]) {
      const created = await api(page, periods, "POST", input);
      expect(created.status).toBe(201);
      expect(created.headers.location).toBe(
        `/api/v1/staff/rate-periods/${created.body.id}`,
      );
      periodIds.push(String(created.body.id));
    }

    const calendar = await api(page, `${rates}?${query}`);
    expect(calendar.status).toBe(200);
    expect(calendar.headers["cache-control"]).toBe("no-store");
    expect(
      calendar.body.calendar?.map((night) => night.amount?.amountMinor),
    ).toEqual([6_000, 6_000, 7_000, 7_000]);

    const overlap = await api(page, periods, "POST", {
      startDate: "2090-03-11",
      endDate: "2090-03-13",
      amount: money(8_000),
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.fieldErrors?.startDate).toBeDefined();

    const item = `/api/v1/staff/rate-periods/${periodIds[0]}`;
    expect((await api(page, item, "PATCH", { label: null })).status).toBe(200);
    expect((await api(page, item, "DELETE")).status).toBe(204);
    expect((await api(page, item, "DELETE")).status).toBe(204);

    const audits = await sql(
      'SELECT action, changes FROM "AuditEvent" WHERE "entityId" = $1 OR "entityId" = ANY($2::text[]) ORDER BY "occurredAt", id',
      [roomTypeId, periodIds],
    );
    expect(audits.rows.map((row) => row.action).sort()).toEqual([
      "rate-period.created",
      "rate-period.created",
      "rate-period.updated",
      "rate-period.updated",
      "room-base-rate.updated",
    ]);

    const cookie = (await page.context().cookies())
      .filter((entry) => entry.name.endsWith("rivana-staff.session_token"))
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    const refused = await page.request.put(base, {
      headers: {
        cookie,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      data: { amount: money(9_000) },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CROSS_SITE_REQUEST" });
  } finally {
    await cleanup(roomTypeId);
  }
});

test("rate REST enforces receptionist and manager branch scope", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const roomTypeId = `e2e-rate-role-${testInfo.project.name}-${testInfo.retry}`;
  await newRoom(roomTypeId);
  const rates = `/api/v1/staff/room-types/${roomTypeId}/rates?from=2090-04-01&to=2090-04-02`;
  const base = `/api/v1/staff/room-types/${roomTypeId}/base-rate`;
  try {
    for (const role of ["receptionist", "manager", "editor"] as const) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signInAs(page, accounts[role]);
        expect((await api(page, rates)).status).toBe(
          role === "editor" ? 403 : 200,
        );
        expect(
          (await api(page, base, "PUT", { amount: money(5_000) })).status,
        ).toBe(role === "manager" ? 200 : 403);
      } finally {
        await context.close();
      }
    }
  } finally {
    await cleanup(roomTypeId);
  }
});
