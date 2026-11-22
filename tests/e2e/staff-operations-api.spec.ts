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
    method?: "POST" | "PUT" | "PATCH";
    body?: unknown;
    key?: string;
    etag?: string | null;
  } = {},
) {
  return page.evaluate(
    async ({ path, method, body, key, etag }) => {
      const response = await fetch(path, {
        method: method ?? "GET",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        etag: response.headers.get("etag"),
        body:
          response.status === 202
            ? await response.text()
            : await response.json(),
      };
    },
    { path, ...options },
  );
}

test("staff exercise all seven operational routes and verify persisted effects", async ({
  page,
}, testInfo) => {
  const key = `t10-${testInfo.project.name}-${testInfo.retry}`;
  const phone =
    testInfo.project.name === "desktop-chromium"
      ? "+12025550191"
      : "+12025550192";
  const account = accountsFor(testInfo.project.name).admin;
  const base = "/api/v1/staff/reservations";
  const {
    rows: [listing],
  } = await sql(
    `SELECT r.id, r."branchId",
            to_char((now() AT TIME ZONE b."timeZone")::date - 1, 'YYYY-MM-DD') AS yesterday,
            to_char((now() AT TIME ZONE b."timeZone")::date, 'YYYY-MM-DD') AS today,
            to_char((now() AT TIME ZONE b."timeZone")::date + 1, 'YYYY-MM-DD') AS tomorrow,
            to_char((now() AT TIME ZONE b."timeZone")::date + 2, 'YYYY-MM-DD') AS later
       FROM "Room" r JOIN "Branch" b ON b.id = r."branchId"
      WHERE b.slug = 'new-cairo' AND r.status = 'PUBLISHED'
      ORDER BY r.id LIMIT 1`,
  );
  await signInAs(page, account);
  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
    [key, listing.branchId, listing.id],
  );
  const ids: string[] = [];
  const makeExternal = async (
    suffix: string,
    nights: string[],
    checkout: string,
  ) => {
    const created = await request(page, "/api/v1/staff/external-reservations", {
      method: "POST",
      key: `${key}-${suffix}`,
      body: {
        branchId: listing.branchId,
        stay: { checkIn: nights[0], checkOut: checkout },
        lines: [
          {
            roomTypeId: listing.id,
            occupancy: { adults: 1, children: 0 },
            amounts: {
              nights: nights.map((night) => ({ night, amountMinor: 2000 })),
            },
          },
        ],
        guest: {
          fullName: "Fictional Operations Guest",
          email: "operations@example.test",
          phone,
        },
        externalReference: `${key}-${suffix}`,
      },
    });
    expect(created.status).toBe(201);
    ids.push(created.body.id);
    return created.body;
  };
  try {
    const booking = await makeExternal(
      "arrival",
      [listing.yesterday, listing.today, listing.tomorrow],
      listing.later,
    );
    // Use the same priced shape for a website fixture, including a verified profile.
    await sql(`UPDATE "Guest" SET "phoneVerifiedAt" = now() WHERE phone = $1`, [
      phone,
    ]);
    await sql(
      `UPDATE "Reservation" SET source = 'WEBSITE', "createdById" = NULL, "externalReference" = NULL WHERE id = $1`,
      [booking.id],
    );
    const path = `${base}/${booking.id}`;
    const first = await request(page, path);
    expect(first.body.allowedActions).toContain("MARK_ENTERED_IN_HOTEL_SYSTEM");
    const edit = await request(page, path, {
      method: "PATCH",
      etag: first.etag,
      body: { specialRequests: "Fictional request" },
    });
    expect(edit).toMatchObject({
      status: 200,
      etag: '"v2"',
      body: { guest: { specialRequests: "Fictional request" } },
    });
    const assigned = await request(
      page,
      `${path}/rooms/${booking.lines[0].id}/assignment`,
      {
        method: "PUT",
        etag: edit.etag,
        body: { physicalRoomId: key },
      },
    );
    expect(assigned).toMatchObject({
      status: 200,
      etag: '"v3"',
      body: { lines: [expect.objectContaining({ physicalRoomId: key })] },
    });
    const entered = await request(page, `${path}/pms-entry`, {
      method: "POST",
      etag: assigned.etag,
    });
    expect(entered).toMatchObject({
      status: 200,
      etag: '"v4"',
      body: {
        pmsEnteredAt: expect.any(String),
        pmsEnteredById: expect.any(String),
      },
    });
    const duplicate = await request(page, `${path}/pms-entry`, {
      method: "POST",
      etag: entered.etag,
    });
    expect(duplicate).toMatchObject({
      status: 409,
      body: { code: "CONFLICT" },
    });
    expect(
      await request(page, `${path}/manage-link`, { method: "POST" }),
    ).toMatchObject({ status: 202, body: "" });
    const afterResend = await request(page, path);
    const checkedIn = await request(page, `${path}/check-in`, {
      method: "POST",
      etag: afterResend.etag,
    });
    expect(checkedIn).toMatchObject({
      status: 200,
      body: { status: "CHECKED_IN" },
    });
    const checkedOut = await request(page, `${path}/check-out`, {
      method: "POST",
      etag: checkedIn.etag,
    });
    expect(checkedOut).toMatchObject({
      status: 200,
      body: {
        status: "CHECKED_OUT",
        stay: { checkOut: listing.today },
        price: booking.price,
      },
    });
    expect(checkedOut.body.lines[0].nights).toEqual(booking.lines[0].nights);
    expect(
      (
        await sql(
          `SELECT "manageTokenExpiresAt" = (("checkOut" + 30)::timestamp AT TIME ZONE 'UTC') AS matches
       FROM "Reservation" WHERE id = $1`,
          [booking.id],
        )
      ).rows,
    ).toEqual([{ matches: true }]);
    expect(
      (
        await sql(
          `SELECT channel FROM "NotificationOutbox" WHERE "reservationId" = $1 AND kind = 'reservation.manage-link' ORDER BY channel`,
          [booking.id],
        )
      ).rows.map((row) => row.channel),
    ).toEqual(["EMAIL", "WHATSAPP"]);
    const history = await request(page, `${path}/history`);
    expect(
      history.body.items.map((item: { action: string }) => item.action),
    ).toEqual(
      expect.arrayContaining([
        "reservation.contact-edited",
        "reservation.room-assigned",
        "reservation.pms-entered",
        "reservation.manage-link-resent",
        "reservation.checked-in",
        "reservation.checked-out",
      ]),
    );
    expect(JSON.stringify(history.body)).not.toContain("Fictional request");

    const missed = await makeExternal(
      "missed",
      [listing.today],
      listing.tomorrow,
    );
    const marked = await request(page, `${base}/${missed.id}/no-show`, {
      method: "POST",
      etag: '"v1"',
    });
    expect(marked).toMatchObject({
      status: 200,
      body: {
        status: "NO_SHOW",
        lines: [expect.objectContaining({ consumesInventory: false })],
      },
    });
  } finally {
    for (const id of ids) {
      await sql('DELETE FROM "NotificationOutbox" WHERE "reservationId" = $1', [
        id,
      ]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [id]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [id]);
    }
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [key]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
  }
});
