import { createHmac, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

import { E2E_PHONE_VERIFICATION_SECRET } from "./support/phone-verification";
import { sql } from "./support/session";

// Runtime proof for the collection part of AC-11 and AC-13.
test("the running app receives a browser beacon and drops a DNT request", async ({
  page,
}) => {
  const sessionId = randomBytes(16).toString("hex");
  const endpoint = "/api/v1/analytics/events";
  await page.goto("/new-cairo");
  const waitForBeacon = page.waitForResponse(
    (response) => new URL(response.url()).pathname === endpoint,
  );
  const sent = await page.evaluate(
    ({ endpoint, sessionId }) =>
      navigator.sendBeacon(
        endpoint,
        JSON.stringify({
          sessionId,
          events: [
            {
              name: "PAGE_VIEW",
              path: "/reservations/manage?email=example%40example.test#t=example-token",
            },
          ],
        }),
      ),
    { endpoint, sessionId },
  );
  expect(sent).toBe(true);
  const beacon = await waitForBeacon;
  expect(beacon.status()).toBe(204);
  expect(beacon.headers()["set-cookie"]).toBeUndefined();

  await page.setExtraHTTPHeaders({ DNT: "1" });
  const optedOut = await page.evaluate(
    ({ endpoint, sessionId }) =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          events: [{ name: "PAGE_VIEW", path: "/new-cairo" }],
        }),
      }).then((response) => response.status),
    { endpoint, sessionId },
  );
  expect(optedOut).toBe(204);
  const { rows } = await sql(
    'SELECT "path", "funnelStep", "branchId" FROM "SiteEvent" WHERE "sessionId" = $1',
    [sessionId],
  );
  expect(rows).toEqual([
    { path: "/reservations/manage", funnelStep: 1, branchId: null },
  ]);
});

// Runtime proof for AC-11 on the production server: server side steps are
// written after the response. This server has no payment, WhatsApp or email
// provider, so booking submission is proved on PostgreSQL in the integration
// suite (tests/integration/reservations/analytics-funnel.test.ts).
test("the running app records server side steps after answering, and honors DNT", async ({
  playwright,
  baseURL,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop-chromium";
  const sessionId = randomBytes(16).toString("hex");
  const request = await playwright.request.newContext({
    ...(baseURL ? { baseURL } : {}),
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Rivana-E2E",
    extraHTTPHeaders: {
      "X-Forwarded-For": desktop ? "198.51.100.90" : "198.51.100.91",
    },
  });
  const id = `m10-t0b-${sessionId.slice(0, 12)}`;
  const phone = "+12025550105";
  const code = "000789";
  const now = new Date();
  await sql(
    'INSERT INTO "PhoneVerification" (id,phone,purpose,"codeHash","expiresAt","clientKey","createdAt") VALUES ($1,$2,$3::"VerificationPurpose",$4,$5,$6,$7)',
    [
      id,
      phone,
      "BOOKING",
      createHmac("sha256", E2E_PHONE_VERIFICATION_SECRET)
        .update(JSON.stringify([id, phone, "BOOKING", code]))
        .digest("hex"),
      new Date(now.getTime() + 600_000),
      "e2e-hashed-client",
      now,
    ],
  );
  const header = { "Rivana-Analytics-Session": sessionId };
  // A party no listing can hold, so the answer never depends on other specs.
  const search =
    "/api/v1/branches/new-cairo/availability?checkIn=2027-04-10&checkOut=2027-04-12&adults=20&children=0";
  const rows = async () =>
    (
      await sql(
        'SELECT "name", "funnelStep", "outcome", "path", "visitorHash" IS NOT NULL AS hashed FROM "SiteEvent" WHERE "sessionId" = $1 ORDER BY "id"',
        [sessionId],
      )
    ).rows;
  try {
    const optedOut = await request.get(search, {
      headers: { ...header, DNT: "1" },
    });
    expect(optedOut.status()).toBe(200);
    const found = await request.get(search, { headers: header });
    expect(found.status()).toBe(200);
    expect(found.headers()["set-cookie"]).toBeUndefined();
    await expect.poll(rows).toHaveLength(1);
    const confirmed = await request.post(
      `/api/v1/phone-verifications/${id}/confirmation`,
      { headers: header, data: { code } },
    );
    expect(confirmed.status()).toBe(200);
    await expect.poll(rows).toEqual([
      {
        name: "SEARCH",
        funnelStep: 3,
        outcome: "NO_AVAILABILITY",
        path: null,
        hashed: true,
      },
      {
        name: "PHONE_VERIFIED",
        funnelStep: 6,
        outcome: null,
        path: null,
        hashed: true,
      },
    ]);
  } finally {
    await sql('DELETE FROM "PhoneVerification" WHERE id = $1', [id]);
    await request.dispose();
  }
});
