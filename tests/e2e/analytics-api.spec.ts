import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

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
