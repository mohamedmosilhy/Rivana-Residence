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
    method?: "POST" | "PUT";
    body?: unknown;
    key?: string;
    version?: string | null;
  } = {},
) {
  return page.evaluate(
    async ({ path, method, body, key, version }) => {
      const response = await fetch(path, {
        method: method ?? "GET",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...(version ? { "If-Match": version } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        etag: response.headers.get("etag"),
        body: await response.json(),
      };
    },
    { path, ...options },
  );
}

test("staff change and cancel a reservation and acknowledge the current hotel system update", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop-chromium";
  const fixture = `t9-${testInfo.project.name}`;
  const phone = desktop ? "+12025550183" : "+12025550184";
  const checkIn = desktop ? "2034-08-10" : "2034-08-12";
  const checkOut = desktop ? "2034-08-11" : "2034-08-13";
  const stay = { checkIn, checkOut };
  const base = "/api/v1/staff/reservations";
  const account = accountsFor(testInfo.project.name).admin;
  const {
    rows: [listing],
  } = await sql(
    `SELECT r.id, r."branchId"
       FROM "Room" r JOIN "Branch" b ON b.id = r."branchId"
      WHERE b.slug = 'new-cairo' AND r.status = 'PUBLISHED'
      ORDER BY r.id LIMIT 1`,
  );
  const lines = [
    { roomTypeId: listing.id, occupancy: { adults: 1, children: 0 } },
  ];
  const override = (amountMinor: number) => ({
    lines: [{ nights: [{ night: checkIn, amountMinor }] }],
    reason: "E2E rate decision",
  });
  await signInAs(page, account);
  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
    [fixture, listing.branchId, listing.id],
  );
  let id: string | undefined;
  try {
    const created = await request(page, base, {
      method: "POST",
      key: `${fixture}-${testInfo.retry}-booking`,
      body: {
        branchId: listing.branchId,
        stay,
        lines,
        priceOverride: override(2000),
        guest: {
          fullName: "Fictional Change Guest",
          phone,
          email: "change@example.test",
        },
        sendConfirmation: false,
      },
    });
    expect(created.status).toBe(201);
    id = created.body.id as string;
    // Fixture for an existing website booking already entered by reception.
    await sql(
      `UPDATE "Reservation" SET source = 'WEBSITE', "createdById" = NULL,
        "pmsEnteredAt" = now(), "pmsEnteredById" = (SELECT id FROM "User" WHERE email = $2)
        WHERE id = $1`,
      [id, account],
    );
    const path = `${base}/${id}`;
    const detail = await request(page, path);
    expect(detail.etag).toBe('"v1"');
    const put = (amountMinor: number) =>
      request(page, `${path}/stay`, {
        method: "PUT",
        version: detail.etag,
        body: {
          stay,
          lines,
          priceOverride: override(4000),
          acceptedTotal: { amountMinor, currency: "USD" },
        },
      });
    const requote = await put(1);
    expect(requote).toMatchObject({
      status: 409,
      body: { code: "PRICE_CHANGED" },
    });
    const modified = await put(requote.body.context.quote.totalMinor);
    expect(modified).toMatchObject({
      status: 200,
      etag: '"v2"',
      body: { changeSeq: 1, pmsUpdatePendingSince: expect.any(String) },
    });
    const cancelled = await request(page, `${path}/cancellation`, {
      method: "POST",
      version: modified.etag,
      body: {
        reason: "GUEST_REQUEST",
        notifyGuest: false,
        note: "Private test note",
      },
    });
    expect(cancelled).toMatchObject({
      status: 200,
      etag: '"v3"',
      body: {
        status: "CANCELLED",
        changeSeq: 2,
        pmsUpdatePendingSince: modified.body.pmsUpdatePendingSince,
      },
    });
    const acknowledge = (changeSeq: number) =>
      request(page, `${path}/pms-update`, {
        method: "POST",
        version: cancelled.etag,
        body: { changeSeq },
      });
    expect(await acknowledge(1)).toMatchObject({
      status: 409,
      body: { code: "PMS_UPDATE_STALE", context: { currentChangeSeq: 2 } },
    });
    expect(await acknowledge(2)).toMatchObject({
      status: 200,
      body: { pmsUpdatePendingSince: null, changeSeq: 2 },
    });
    const history = await request(page, `${path}/history`);
    expect(history.status).toBe(200);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "reservation.stay-modified" }),
        expect.objectContaining({
          action: "reservation.cancelled",
          changes: expect.objectContaining({
            reason: "GUEST_REQUEST",
            guestNotified: false,
          }),
        }),
        expect.objectContaining({ action: "reservation.pms-update-entered" }),
      ]),
    );
    expect(JSON.stringify(history.body)).not.toContain("Private test note");
  } finally {
    if (id) {
      await sql('DELETE FROM "ReservationChange" WHERE "reservationId" = $1', [
        id,
      ]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [id]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [id]);
    }
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [fixture]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
  }
});

test("staff re-quote, add, edit and remove an airport transfer through S6", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop-chromium";
  const fixture = desktop ? "t9b-desktop" : "t9b-mobile";
  const phone = desktop ? "+12025550185" : "+12025550186";
  const checkIn = desktop ? "2034-09-10" : "2034-09-12";
  const checkOut = desktop ? "2034-09-11" : "2034-09-13";
  const stay = { checkIn, checkOut };
  const base = "/api/v1/staff/reservations";
  const account = accountsFor(testInfo.project.name).admin;
  const {
    rows: [listing],
  } = await sql(
    `SELECT r.id, r."branchId"
       FROM "Room" r JOIN "Branch" b ON b.id = r."branchId"
      WHERE b.slug = 'new-cairo' AND r.status = 'PUBLISHED' ORDER BY r.id LIMIT 1`,
  );
  const lines = [
    { roomTypeId: listing.id, occupancy: { adults: 1, children: 0 } },
  ];
  await signInAs(page, account);
  // Both projects use the same read-only offering in the disposable database.
  await sql(
    `INSERT INTO "ServiceOffering" (id, "branchId", kind, "priceUnit", "priceMinor", "maxVehicles", active, "updatedAt")
     VALUES ('e2e-t9b-transfer', $1, 'AIRPORT_TRANSFER', 'PER_VEHICLE', 1500, 3, true, now())
     ON CONFLICT ("branchId", kind) DO NOTHING`,
    [listing.branchId],
  );
  await sql(
    'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
    [fixture, listing.branchId, listing.id],
  );
  let id: string | undefined;
  try {
    const created = await request(page, base, {
      method: "POST",
      key: `${fixture}-${testInfo.retry}-booking`,
      body: {
        branchId: listing.branchId,
        stay,
        lines,
        priceOverride: {
          lines: [{ nights: [{ night: checkIn, amountMinor: 2000 }] }],
          reason: "E2E rate decision",
        },
        guest: {
          fullName: "Fictional Service Guest",
          phone,
          email: "transfer@example.test",
        },
        sendConfirmation: false,
      },
    });
    expect(created.status).toBe(201);
    id = created.body.id as string;
    await sql(
      `UPDATE "Reservation" SET source = 'WEBSITE', "createdById" = NULL,
       "pmsEnteredAt" = now(), "pmsEnteredById" = (SELECT id FROM "User" WHERE email = $2)
       WHERE id = $1`,
      [id, account],
    );
    const path = `${base}/${id}`;
    const change = (
      services: unknown,
      version: string | null,
      amountMinor: number,
    ) =>
      request(page, `${path}/stay`, {
        method: "PUT",
        version,
        body: {
          stay,
          lines,
          services,
          acceptedTotal: { amountMinor, currency: "USD" },
        },
      });
    const detail = await request(page, path);
    const transfer = {
      kind: "AIRPORT_TRANSFER",
      vehicles: 2,
      details: "Demo MS100 10:30",
    };
    expect(await change([transfer], detail.etag, 2300)).toMatchObject({
      status: 409,
      body: {
        code: "PRICE_CHANGED",
        context: { quote: { servicesMinor: 3000, totalMinor: 5750 } },
      },
    });
    const added = await change([transfer], detail.etag, 5750);
    expect(added).toMatchObject({
      status: 200,
      etag: '"v2"',
      body: {
        changeSeq: 1,
        pmsUpdatePendingSince: expect.any(String),
        price: {
          totalMinor: 5750,
          services: [{ ...transfer, amountMinor: 3000 }],
        },
      },
    });
    expect(
      await change([{ ...transfer, vehicles: "3" }], detail.etag, 5750),
    ).toMatchObject({ status: 412, body: { code: "STALE_VERSION" } });
    const edited = await change(
      [{ kind: transfer.kind, details: " " }],
      added.etag,
      5750,
    );
    expect(edited).toMatchObject({
      status: 200,
      etag: '"v3"',
      body: {
        changeSeq: 2,
        pmsUpdatePendingSince: added.body.pmsUpdatePendingSince,
        price: {
          services: [{ kind: transfer.kind, vehicles: 2, details: null }],
        },
      },
    });
    const history = await request(page, `${path}/history`);
    expect(history.status).toBe(200);
    expect(
      history.body.items.filter(
        (item: { action: string }) =>
          item.action === "reservation.stay-modified",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(history.body)).not.toContain(transfer.details);
    const removed = await change([], edited.etag, 2300);
    expect(removed).toMatchObject({
      status: 200,
      etag: '"v4"',
      body: { changeSeq: 3, price: { services: [], totalMinor: 2300 } },
    });
    expect(
      await request(page, `${path}/pms-update`, {
        method: "POST",
        version: removed.etag,
        body: { changeSeq: 3 },
      }),
    ).toMatchObject({
      status: 200,
      body: { pmsUpdatePendingSince: null, changeSeq: 3 },
    });
  } finally {
    if (id) {
      await sql('DELETE FROM "ReservationChange" WHERE "reservationId" = $1', [
        id,
      ]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [id]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [id]);
    }
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [fixture]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
  }
});
