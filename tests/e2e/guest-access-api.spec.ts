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
    ifMatch?: string;
  } = {},
) {
  return page.evaluate(
    async ({ path, method, body, key, bearer, ifMatch }) => {
      const response = await fetch(path, {
        method: method ?? "GET",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(ifMatch ? { "If-Match": ifMatch } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        etag: response.headers.get("ETag"),
      };
    },
    { path, ...options },
  );
}

// A real token is 43 base64url characters.
const token = (label: string) =>
  `${label.replace(/[^A-Za-z0-9_-]/g, "-")}${"x".repeat(43)}`.slice(0, 43);

test("a guest changes a booking and requests cancellation, and staff can block writes and close the request", async ({
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
    const totalMinor = created.body.price.totalMinor as number;
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
        branch: { timeZone: "Africa/Cairo" },
        contact: { fullName: "Fictional Access Guest", phone },
        allowedActions: ["REQUEST_CANCELLATION", "CHANGE_RESERVATION"],
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
      await request(page, `/api/v1/guest/reservations/${reference}`, {
        bearer: live,
      }),
    ).toMatchObject({
      status: 200,
      body: {
        branch: { timeZone: "Africa/Cairo" },
        allowedActions: ["REQUEST_CANCELLATION", "CHANGE_RESERVATION"],
      },
    });
    // A session token is not a manage link.
    expect(
      (await request(page, "/api/v1/guest/reservation", { bearer: live }))
        .status,
    ).toBe(401);
    // M9-T12b (ADR 031): a session from an email code, typed with another
    // phone, finds the booking through its contact email alone.
    const byEmail = token(`email-session-${key}`);
    await sql(
      `INSERT INTO "PhoneVerification"
         (id, phone, purpose, channel, email, "codeHash", attempts, "expiresAt", "verifiedAt", "tokenHash", "tokenExpiresAt", "clientKey")
       VALUES ($1, $2, 'GUEST_SESSION', 'EMAIL', 'access@example.test', repeat('0', 64), 1, now() + interval '10 minutes', now(),
               encode(sha256(convert_to($3, 'UTF8')), 'hex'), now() + interval '30 minutes', 'e2e')`,
      [
        `pve-${key}`.slice(0, 32),
        testInfo.project.name === "desktop-chromium"
          ? "+12025550195"
          : "+12025550196",
        byEmail,
      ],
    );
    const viaEmail = await request(page, "/api/v1/guest/reservations", {
      bearer: byEmail,
    });
    expect(viaEmail.status).toBe(200);
    expect(
      viaEmail.body.items.map((item: { reference: string }) => item.reference),
    ).toContain(reference);
    expect(
      await request(page, `/api/v1/guest/reservations/${reference}`, {
        bearer: byEmail,
      }),
    ).toMatchObject({
      status: 200,
      body: { contact: { email: "access@example.test", phone } },
    });

    // G5 and G6 over real HTTP, through each way a guest can access a booking.
    const managePath = "/api/v1/guest/reservation";
    const sessionPath = `/api/v1/guest/reservations/${reference}`;
    const change = { guest: { specialRequests: "Fictional request" } };
    const preview = await request(page, `${managePath}/change-preview`, {
      method: "POST",
      bearer: manage,
      body: change,
    });
    expect(preview).toMatchObject({
      status: 200,
      etag: expect.stringMatching(/^"v[0-9]+"$/),
      body: {
        available: true,
        current: {
          total: { amountMinor: totalMinor, currency: "USD" },
          accommodation: { amountMinor: 4000 },
        },
        proposed: {
          total: { amountMinor: totalMinor, currency: "USD" },
          accommodation: { amountMinor: 4000 },
        },
        outcome: "APPLIES_NOW",
      },
    });
    const confirmed = {
      ...change,
      expectedTotal: preview.body.proposed.total as {
        amountMinor: number;
        currency: "USD";
      },
    };
    expect(
      await request(page, `${managePath}/changes`, {
        method: "POST",
        bearer: manage,
        body: confirmed,
      }),
    ).toMatchObject({ status: 428, body: { code: "PRECONDITION_REQUIRED" } });
    expect(
      await request(page, `${managePath}/changes`, {
        method: "POST",
        bearer: manage,
        ifMatch: preview.etag!,
        body: {
          ...confirmed,
          expectedTotal: { amountMinor: totalMinor - 1, currency: "USD" },
        },
      }),
    ).toMatchObject({
      status: 409,
      body: {
        code: "PRICE_CHANGED",
        context: {
          quote: { preview: { proposed: { total: confirmed.expectedTotal } } },
        },
      },
    });
    const applied = await request(page, `${managePath}/changes`, {
      method: "POST",
      bearer: manage,
      ifMatch: preview.etag!,
      body: confirmed,
    });
    expect(applied).toMatchObject({
      status: 200,
      body: {
        contact: { specialRequests: "Fictional request" },
        allowedActions: ["REQUEST_CANCELLATION", "CHANGE_RESERVATION"],
      },
    });
    expect(applied.etag).not.toBe(preview.etag);
    const sessionChange = { guest: { fullName: "Fictional Updated Guest" } };
    const sessionPreview = await request(
      page,
      `${sessionPath}/change-preview`,
      {
        method: "POST",
        bearer: live,
        body: sessionChange,
      },
    );
    expect(sessionPreview).toMatchObject({ status: 200, etag: applied.etag });
    const sessionConfirm = {
      ...sessionChange,
      expectedTotal: confirmed.expectedTotal,
    };
    expect(
      await request(page, `${sessionPath}/changes`, {
        method: "POST",
        bearer: live,
        ifMatch: preview.etag!,
        body: sessionConfirm,
      }),
    ).toMatchObject({ status: 412, body: { code: "STALE_VERSION" } });
    expect(
      await request(page, `${sessionPath}/changes`, {
        method: "POST",
        bearer: live,
        ifMatch: sessionPreview.etag!,
        body: sessionConfirm,
      }),
    ).toMatchObject({
      status: 200,
      body: {
        contact: {
          fullName: "Fictional Updated Guest",
          specialRequests: "Fictional request",
        },
      },
    });

    const submitted = await request(
      page,
      `/api/v1/guest/reservations/${reference}/cancellation-requests`,
      {
        method: "POST",
        bearer: live,
        body: { reason: "Fictional change of plans" },
      },
    );
    expect(submitted).toMatchObject({
      status: 201,
      body: { status: "OPEN", decisionReason: null },
    });
    expect(
      await request(page, "/api/v1/guest/reservation/cancellation-requests", {
        method: "POST",
        bearer: manage,
      }),
    ).toMatchObject({
      status: 409,
      body: { code: "CANCELLATION_REQUEST_EXISTS" },
    });
    expect(
      await request(page, "/api/v1/guest/reservation", { bearer: manage }),
    ).toMatchObject({
      status: 200,
      body: {
        status: "CONFIRMED",
        cancellationRequest: { id: submitted.body.id, status: "OPEN" },
        allowedActions: [],
      },
    });

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
      await request(page, "/api/v1/guest/reservation/cancellation-requests", {
        method: "POST",
        bearer: manage,
      }),
    ).toMatchObject({ status: 403, body: { code: "PHONE_BLOCKED" } });
    expect(
      await request(page, `/api/v1/staff/guests/${guestId}/block`, {
        method: "DELETE",
        body: { reason: "Fictional resolution" },
      }),
    ).toMatchObject({ status: 200, body: { blocked: false } });

    const {
      rows: [current],
    } = await sql('SELECT version FROM "Reservation" WHERE id = $1', [
      reservationId,
    ]);
    expect(
      await request(
        page,
        `/api/v1/staff/reservations/${reservationId}/cancellation`,
        {
          method: "POST",
          ifMatch: `"v${current.version}"`,
          body: { reason: "GUEST_REQUEST", notifyGuest: false },
        },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await request(page, "/api/v1/guest/reservation", { bearer: manage }),
    ).toMatchObject({
      status: 200,
      body: {
        status: "CANCELLED",
        cancellationRequest: { id: submitted.body.id, status: "CLOSED" },
        allowedActions: [],
      },
    });
  } finally {
    if (reservationId) {
      await sql(
        'DELETE FROM "AuditEvent" WHERE "entityType" = \'CancellationRequest\' AND "entityId" IN (SELECT id FROM "CancellationRequest" WHERE "reservationId" = $1)',
        [reservationId],
      );
      await sql(
        'DELETE FROM "CancellationRequest" WHERE "reservationId" = $1',
        [reservationId],
      );
      await sql('DELETE FROM "NotificationOutbox" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "AuditEvent" WHERE "entityId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "ReservationChange" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [reservationId]);
    }
    await sql(
      `DELETE FROM "AuditEvent" WHERE "entityType" = 'Guest' AND "entityId" IN (SELECT id FROM "Guest" WHERE phone = $1)`,
      [phone],
    );
    await sql('DELETE FROM "PhoneVerification" WHERE phone = $1', [phone]);
    await sql('DELETE FROM "PhoneVerification" WHERE id = $1', [
      `pve-${key}`.slice(0, 32),
    ]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [key]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
  }
});

test("staff decide paid changes over HTTP and close a request at the desk", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === "desktop-chromium" ? "d" : "m";
  const key = `paid-change-${suffix}-${testInfo.retry}`;
  await page.setExtraHTTPHeaders({
    "X-Forwarded-For": suffix === "d" ? "198.51.100.70" : "198.51.100.71",
  });
  const phone = suffix === "d" ? "+12025550171" : "+12025550172";
  const manage = token(`manage-${key}`);
  const session = token(`session-${key}`);
  const branch = (
    await sql(
      `SELECT id,
            to_char((now() AT TIME ZONE "timeZone")::date + 32, 'YYYY-MM-DD') AS arrival,
            to_char((now() AT TIME ZONE "timeZone")::date + 33, 'YYYY-MM-DD') AS night2,
            to_char((now() AT TIME ZONE "timeZone")::date + 34, 'YYYY-MM-DD') AS departure,
            to_char((now() AT TIME ZONE "timeZone")::date + 35, 'YYYY-MM-DD') AS longer
       FROM "Branch" WHERE slug = 'new-cairo'`,
    )
  ).rows[0];
  await signInAs(page, accountsFor(testInfo.project.name).admin);
  let reservationId: string | null = null;
  try {
    await sql(
      `INSERT INTO "Room" (id, "branchId", name, slug, "shortDescription", description, "maxAdults", "sortOrder", status, "updatedAt")
       VALUES ($1, $2, 'Paid change test room', $1, 'Fixture', '{"type":"doc","content":[]}', 2, $3, 'PUBLISHED', now())`,
      [key, branch.id, suffix === "d" ? 9998 : 9999],
    );
    await sql(
      'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $1, $1, now())',
      [key, branch.id],
    );
    await sql(
      'INSERT INTO "RoomBaseRate" ("roomTypeId", "amountMinor", "updatedAt") VALUES ($1, 2000, now())',
      [key],
    );
    const created = await request(page, "/api/v1/staff/external-reservations", {
      method: "POST",
      key,
      body: {
        branchId: branch.id,
        stay: { checkIn: branch.arrival, checkOut: branch.departure },
        lines: [
          {
            roomTypeId: key,
            occupancy: { adults: 1, children: 0 },
            amounts: {
              nights: [branch.arrival, branch.night2].map((night) => ({
                night,
                amountMinor: 2000,
              })),
            },
          },
        ],
        guest: {
          fullName: "Paid Test Guest",
          email: "paid-change@example.test",
          phone,
        },
        externalReference: key,
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    reservationId = created.body.id as string;
    const paid = created.body.price.totalMinor as number;
    await sql(
      `UPDATE "Reservation"
          SET source = 'WEBSITE', "createdById" = NULL, "externalReference" = NULL, "externalChannel" = NULL,
              "paymentMethod" = 'ONLINE', "paymentStatus" = 'PAID',
              "manageTokenHash" = encode(sha256(convert_to($2, 'UTF8')), 'hex'),
              "manageTokenExpiresAt" = now() + interval '40 days'
        WHERE id = $1`,
      [reservationId, manage],
    );
    await sql(
      `INSERT INTO "Payment" (id, "reservationId", provider, "amountMinor", currency, status, "expiresAt", "updatedAt")
       VALUES ($1, $2, 'e2e-fixture', $3, 'USD', 'SUCCEEDED', now(), now())`,
      [key, reservationId, paid],
    );
    await sql(
      `INSERT INTO "PhoneVerification"
         (id, phone, purpose, "codeHash", "expiresAt", "verifiedAt", "tokenHash", "tokenExpiresAt", "clientKey")
       VALUES ($1, $2, 'GUEST_SESSION', repeat('0', 64), now() + interval '10 minutes', now(),
               encode(sha256(convert_to($3, 'UTF8')), 'hex'), now() + interval '30 minutes', 'e2e')`,
      [key, phone, session],
    );
    const guest = "/api/v1/guest/reservation";
    const mine = `/api/v1/guest/reservations/${created.body.reference}`;
    const queue = "/api/v1/staff/change-requests";
    const change = {
      stay: { checkIn: branch.arrival, checkOut: branch.longer },
    };
    const submit = async (
      path: string,
      bearer: string,
      input: typeof change,
    ) => {
      const preview = await request(page, `${path}/change-preview`, {
        method: "POST",
        bearer,
        body: input,
      });
      expect(preview).toMatchObject({
        status: 200,
        body: { available: true, outcome: "NEEDS_APPROVAL" },
      });
      const applied = await request(page, `${path}/changes`, {
        method: "POST",
        bearer,
        ifMatch: preview.etag!,
        body: { ...input, expectedTotal: preview.body.proposed.total },
      });
      expect(applied).toMatchObject({
        status: 202,
        etag: preview.etag,
        body: { status: "OPEN" },
      });
      return applied.body.id as string;
    };
    const sameTotal = await request(page, `${guest}/change-preview`, {
      method: "POST",
      bearer: manage,
      body: { guest: { fullName: "Paid Guest Updated" } },
    });
    expect(sameTotal).toMatchObject({
      status: 200,
      body: {
        outcome: "APPLIES_NOW",
        proposed: { total: { amountMinor: paid } },
      },
    });
    expect(
      await request(page, `${guest}/changes`, {
        method: "POST",
        bearer: manage,
        ifMatch: sameTotal.etag!,
        body: {
          guest: { fullName: "Paid Guest Updated" },
          expectedTotal: sameTotal.body.proposed.total,
        },
      }),
    ).toMatchObject({
      status: 200,
      body: {
        branch: { timeZone: expect.any(String) },
        contact: { fullName: "Paid Guest Updated" },
      },
    });
    const first = await submit(guest, manage, change);
    expect(
      await request(page, `${queue}?branchId=${branch.id}&status=OPEN`),
    ).toMatchObject({
      status: 200,
      body: {
        items: expect.arrayContaining([
          expect.objectContaining({
            id: first,
            paidTotalMinor: paid,
            status: "OPEN",
          }),
        ]),
      },
    });
    expect(
      await request(page, `${queue}/${first}/rejection`, {
        method: "POST",
        body: { reason: "Please confirm again." },
      }),
    ).toMatchObject({
      status: 200,
      body: { status: "REJECTED", decisionReason: "Please confirm again." },
    });
    expect(await request(page, guest, { bearer: manage })).toMatchObject({
      status: 200,
      body: { changeRequest: { id: first, status: "REJECTED" } },
    });
    const second = await submit(mine, session, change);
    expect(
      await request(page, `${guest}/cancellation-requests`, {
        method: "POST",
        bearer: manage,
      }),
    ).toMatchObject({
      status: 409,
      body: { code: "CANCELLATION_REQUEST_EXISTS" },
    });
    const approved = await request(page, `${queue}/${second}/approval`, {
      method: "POST",
      body: {},
    });
    expect(approved).toMatchObject({
      status: 200,
      body: { stay: change.stay, paymentStatus: "PAID" },
    });
    expect(
      await request(page, `${queue}/${second}/approval`, {
        method: "POST",
        body: {},
      }),
    ).toMatchObject({
      status: 409,
      body: { code: "INVALID_TRANSITION" },
    });
    expect(
      (
        await sql('SELECT status, "amountMinor" FROM "Payment" WHERE id = $1', [
          key,
        ])
      ).rows,
    ).toEqual([{ status: "SUCCEEDED", amountMinor: paid }]);
    const third = await submit(guest, manage, {
      stay: { checkIn: branch.arrival, checkOut: branch.night2 },
    });
    await sql(
      'UPDATE "Reservation" SET "checkIn" = current_date - 1, "checkOut" = current_date + 2 WHERE id = $1',
      [reservationId],
    );
    expect(
      await request(
        page,
        `/api/v1/staff/reservations/${reservationId}/no-show`,
        {
          method: "POST",
          ifMatch: approved.etag!,
          body: {},
        },
      ),
    ).toMatchObject({ status: 200, body: { status: "NO_SHOW" } });
    expect(await request(page, guest, { bearer: manage })).toMatchObject({
      status: 200,
      body: {
        changeRequest: { id: third, status: "CLOSED", closedReason: "NO_SHOW" },
        allowedActions: [],
      },
    });
    const alerts = await sql(
      `SELECT count(*)::int AS number FROM "NotificationOutbox"
       WHERE "reservationId" = $1 AND kind = 'request.staff-alert' AND channel = 'EMAIL'
         AND payload->>'requestKind' = 'CHANGE'`,
      [reservationId],
    );
    expect(alerts.rows).toEqual([{ number: 3 }]);
  } finally {
    if (reservationId) {
      await sql(
        `DELETE FROM "AuditEvent" WHERE "entityId" = $1 OR
          ("entityType" = 'ChangeRequest' AND "entityId" IN
             (SELECT id FROM "ChangeRequest" WHERE "reservationId" = $1))`,
        [reservationId],
      );
      await sql('DELETE FROM "NotificationOutbox" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "ReservationChange" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "ChangeRequest" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "Payment" WHERE "reservationId" = $1', [
        reservationId,
      ]);
      await sql('DELETE FROM "Reservation" WHERE id = $1', [reservationId]);
    }
    await sql('DELETE FROM "PhoneVerification" WHERE phone = $1', [phone]);
    await sql('DELETE FROM "Guest" WHERE phone = $1', [phone]);
    await sql('DELETE FROM "PhysicalRoom" WHERE id = $1', [key]);
    await sql('DELETE FROM "RoomBaseRate" WHERE "roomTypeId" = $1', [key]);
    await sql('DELETE FROM "Room" WHERE id = $1', [key]);
  }
});
