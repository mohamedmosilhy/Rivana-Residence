import { expect, test } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable test database.",
);

test("staff create, record and read reservations in the live REST API", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const id = `t8-${project}`;
  const {
    rows: [listing],
  } = await sql(
    `SELECT r.id, r."branchId"
       FROM "Room" r JOIN "Branch" b ON b.id = r."branchId"
      WHERE b.slug = 'new-cairo' AND r.status = 'PUBLISHED'
      ORDER BY r.id LIMIT 1`,
  );
  const date = project === "desktop-chromium" ? "2034-06-20" : "2034-06-22";
  const next = project === "desktop-chromium" ? "2034-06-21" : "2034-06-23";
  const staffBody = {
    branchId: listing.branchId as string,
    stay: { checkIn: date, checkOut: next },
    lines: [
      {
        roomTypeId: listing.id as string,
        occupancy: { adults: 1, children: 0 },
      },
    ],
    guest: {
      fullName: "Fictional E2E Guest",
      phone: project === "desktop-chromium" ? "+12025550181" : "+12025550182",
      email: "fictional@example.test",
    },
    priceOverride: {
      lines: [{ nights: [{ night: date, amountMinor: 2000 }] }],
      reason: "E2E test rate",
    },
    sendConfirmation: false,
  };
  const references: string[] = [];
  const path = "/api/v1/staff/reservations";
  const api = (route: string, payload?: unknown, key?: string) =>
    page.evaluate(
      async (input) => {
        const result = await fetch(
          input.route,
          input.payload === undefined
            ? {}
            : {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": input.key ?? "",
                },
                body: JSON.stringify(input.payload),
              },
        );
        return {
          status: result.status,
          body: await result.json(),
          etag: result.headers.get("etag"),
        };
      },
      { route, payload, key },
    );

  await page.goto("/admin/login");
  expect((await api(path)).status).toBe(401);
  await signInAs(page, accountsFor(project).admin);
  await sql(
    `INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())`,
    [id, listing.branchId, listing.id],
  );
  try {
    const staff = await api(path, staffBody, `${id}-staff-${testInfo.retry}`);
    expect(staff.status).toBe(201);
    references.push(String(staff.body.id));
    expect(staff.body).toMatchObject({
      source: "STAFF",
      status: "CONFIRMED",
      price: { accommodationMinor: 2000 },
    });
    expect(
      (await api(path, staffBody, `${id}-staff-${testInfo.retry}`)).status,
    ).toBe(200);
    const { priceOverride, sendConfirmation, ...shared } = staffBody;
    void priceOverride;
    void sendConfirmation;
    const external = await api(
      "/api/v1/staff/external-reservations",
      {
        ...shared,
        stay: { checkIn: "2034-06-24", checkOut: "2034-06-25" },
        externalReference: id,
        channel: "Fictional channel",
      },
      `${id}-external-${testInfo.retry}`,
    );
    expect(external.status).toBe(201);
    references.push(String(external.body.id));
    expect(external.body).toMatchObject({
      source: "EXTERNAL",
      price: null,
      externalChannel: "Fictional channel",
    });
    const list = await api(
      `${path}?branchId=${listing.branchId}&q=${staff.body.reference}`,
    );
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ id: staff.body.id }],
    });
    expect(await api(`${path}/${external.body.id}`)).toMatchObject({
      status: 200,
      etag: '"v1"',
      body: { externalChannel: "Fictional channel" },
    });
    const history = await api(`${path}/${staff.body.id}/history`);
    expect(history.body).toMatchObject({
      items: [{ action: "reservation.staff-created" }],
    });
    expect(JSON.stringify(history.body)).not.toContain(staffBody.guest.email);
  } finally {
    await sql('DELETE FROM "Reservation" WHERE id = ANY($1::text[])', [
      references,
    ]);
    await sql('DELETE FROM "AuditEvent" WHERE "entityId" = ANY($1::text[])', [
      references,
    ]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [id]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [staffBody.guest.phone]);
  }
});
