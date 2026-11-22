import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable test database.",
);

function request(
  page: Page,
  path: string,
  options: {
    method?: "POST" | "DELETE";
    body?: unknown;
    key?: string;
    bearer?: string;
  } = {},
) {
  return page.evaluate(
    async ({ path, method, body, key, bearer }) => {
      const response = await fetch(path, {
        method: method ?? "GET",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, ...options },
  );
}

// A real token is 43 base64url characters.
const token = (label: string) =>
  `${label.replace(/[^A-Za-z0-9_-]/g, "-")}${"x".repeat(43)}`.slice(0, 43);

test("a guest reads their reservation by link and phone session, and a staff block ends the session", async ({
  page,
}, testInfo) => {
  const key = `t11-${testInfo.project.name}-${testInfo.retry}`;
  const phone =
    testInfo.project.name === "desktop-chromium"
      ? "+12025550193"
      : "+12025550194";
  const manage = token(`manage-${key}`);
  const live = token(`session-${key}`);
  const account = accountsFor(testInfo.project.name).admin;
  const {
    rows: [listing],
  } = await sql(
    `SELECT r.id, r."branchId",
            to_char((now() AT TIME ZONE b."timeZone")::date + 20, 'YYYY-MM-DD') AS arrival,
            to_char((now() AT TIME ZONE b."timeZone")::date + 22, 'YYYY-MM-DD') AS departure
       FROM "Room" r JOIN "Branch" b ON b.id = r."branchId"
      WHERE b.slug = 'new-cairo' AND r.status = 'PUBLISHED'
      ORDER BY r.id LIMIT 1`,
  );
  const nights = (
    await sql(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS night
         FROM generate_series($1::date, $2::date - 1, '1 day') d`,
      [listing.arrival, listing.departure],
    )
  ).rows.map((row) => ({ night: row.night, amountMinor: 2000 }));
  await signInAs(page, account);
  // Inventory comes from physical units; give the listing one for this test.
  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
    [key, listing.branchId, listing.id],
  );
  let reservationId: string | null = null;
  try {
    const created = await request(page, "/api/v1/staff/external-reservations", {
      method: "POST",
      key,
      body: {
        branchId: listing.branchId,
        stay: { checkIn: listing.arrival, checkOut: listing.departure },
        lines: [
          {
            roomTypeId: listing.id,
            occupancy: { adults: 1, children: 0 },
            amounts: { nights },
          },
        ],
        guest: {
          fullName: "Fictional Access Guest",
          email: "access@example.test",
          phone,
        },
        externalReference: key,
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    reservationId = created.body.id as string;
    const reference = created.body.reference as string;
    // Make it a verified website booking with a manage link and a live session.
    await sql(`UPDATE "Guest" SET "phoneVerifiedAt" = now() WHERE phone = $1`, [
      phone,
    ]);
    await sql(
      `UPDATE "Reservation" SET source = 'WEBSITE', "createdById" = NULL, "externalReference" = NULL,
              "manageTokenHash" = encode(sha256(convert_to($2, 'UTF8')), 'hex'),
              "manageTokenExpiresAt" = now() + interval '40 days'
        WHERE id = $1`,
      [reservationId, manage],
    );
    await sql(
      `INSERT INTO "PhoneVerification"
         (id, phone, purpose, "codeHash", attempts, "expiresAt", "verifiedAt", "tokenHash", "tokenExpiresAt", "clientKey")
       VALUES ($1, $2, 'GUEST_SESSION', repeat('0', 64), 1, now() + interval '10 minutes', now(),
               encode(sha256(convert_to($3, 'UTF8')), 'hex'), now() + interval '30 minutes', 'e2e')`,
      [`pv-${key}`.slice(0, 32), phone, live],
    );

    // G1, G3 and G4: the guest sees their own reservation and contact details.
    expect(
      await request(page, "/api/v1/guest/reservation", { bearer: manage }),
    ).toMatchObject({
      status: 200,
      body: {
        reference,
        status: "CONFIRMED",
        contact: { fullName: "Fictional Access Guest", phone },
        allowedActions: [],
      },
    });
    const mine = await request(page, "/api/v1/guest/reservations", {
      bearer: live,
    });
    expect(mine.status).toBe(200);
    expect(
      mine.body.items.map((item: { reference: string }) => item.reference),
    ).toEqual([reference]);
    expect(
      (
        await request(page, `/api/v1/guest/reservations/${reference}`, {
          bearer: live,
        })
      ).status,
    ).toBe(200);
    // A session token is not a manage link.
    expect(
      (await request(page, "/api/v1/guest/reservation", { bearer: live }))
        .status,
    ).toBe(401);

    // Staff find the guest, block them, and the session stops working.
    const found = await request(
      page,
      `/api/v1/staff/guests?q=${encodeURIComponent(phone)}`,
    );
    expect(found.status).toBe(200);
    expect(found.body.items).toHaveLength(1);
    const guestId = found.body.items[0].id as string;
    expect(
      await request(page, `/api/v1/staff/guests/${guestId}/block`, {
        method: "POST",
        body: { reason: "Fictional block reason" },
      }),
    ).toMatchObject({
      status: 200,
      body: { blocked: true, blockReason: "Fictional block reason" },
    });
    expect(
      (await request(page, "/api/v1/guest/reservations", { bearer: live }))
        .status,
    ).toBe(401);
    // The booking they already hold stays readable through its link.
    expect(
      (await request(page, "/api/v1/guest/reservation", { bearer: manage }))
        .status,
    ).toBe(200);
    expect(
      await request(page, `/api/v1/staff/guests/${guestId}/block`, {
        method: "DELETE",
        body: { reason: "Fictional resolution" },
      }),
    ).toMatchObject({ status: 200, body: { blocked: false } });
  } finally {
    if (reservationId) {
      await sql('DELETE FROM "NotificationOutbox" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [reservationId]);
    }
    await sql(
      `DELETE FROM "AuditEvent" WHERE "entityType" = 'Guest' AND "entityId" IN (SELECT id FROM "Guest" WHERE phone = $1)`,
      [phone],
    );
    await sql('DELETE FROM "PhoneVerification" WHERE phone = $1', [phone]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [key]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
  }
});
