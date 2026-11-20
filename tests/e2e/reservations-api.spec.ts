import { expect, test } from "@playwright/test";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run reservation E2E.",
);

// covers: API-P7 transport rules against the production server. Bookings
// themselves are proved on real PostgreSQL in the integration suite. The route
// allows five requests per client per hour and both browser projects share the
// server, so this spec runs in the desktop project only (two requests in all,
// so a CI retry or a rerun within the hour stays under the limit).
const booking = {
  branchSlug: "new-cairo",
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
  lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
  services: [],
  guest: {
    fullName: "Amina Hassan",
    email: "amina@example.test",
    phone: "+12025550101",
  },
  phoneVerificationToken: "token-0123456789abcdef",
  paymentMethod: "PAY_AT_HOTEL",
  expectedTotal: { amountMinor: 34_500, currency: "USD" },
  consent: { privacyNoticeVersion: "privacy-placeholder-v1" },
};

test("a booking needs an Idempotency-Key and a strict body", async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The route allows five requests per client per hour; one project is enough for transport rules.",
  );
  const missing = await request.post("/api/v1/reservations", {
    data: booking,
  });
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({
    code: "MISSING_IDEMPOTENCY_KEY",
  });
  expect(missing.headers()["cache-control"]).toBe("no-store");

  const priced = await request.post("/api/v1/reservations", {
    headers: { "Idempotency-Key": "e2e-reservation-key-1" },
    data: { ...booking, totalMinor: 1 },
  });
  expect(priced.status()).toBe(422);
  expect(await priced.json()).toMatchObject({ code: "VALIDATION" });
});
