import { inspect } from "node:util";

import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  configureWhatsApp,
  NOW,
  seedBookable,
  seedBranch,
} from "./support/website-booking";

// M10-T4: the details page's setup read and server quote, through production
// composition on real PostgreSQL.
vi.stubEnv("PAYMENT_PROVIDER", "fake");
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
vi.stubEnv("EMAIL_PROVIDER", "fake");
vi.stubEnv("AUTH_TRUST_PROXY_HEADERS", "true");
vi.stubEnv("ANALYTICS_ENABLED", "true");
vi.stubEnv(
  "PHONE_VERIFICATION_SECRET",
  "booking-details-phone-secret-0123456789",
);
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("test-booking-details-hmac-secret"),
}));
const { getBookingSetup, quoteBookingDetails } = await import(
  "@/composition/booking-details"
);
const codes = await import("@/app/api/v1/phone-verifications/route");
const confirmations = await import(
  "@/app/api/v1/phone-verifications/[verificationId]/confirmation/route"
);
const { whatsAppTransport } = await import("@/composition/notifications");

const client = createTestClient();
const input = {
  branchSlug: "new-cairo",
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
  lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
  services: [],
};
const visitor = (address: string) =>
  new Headers({ "x-forwarded-for": address });

beforeEach(async () => {
  await resetDatabase(client);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(async () => {
  vi.useRealTimers();
  await client.$disconnect();
});

it("follows the stored switches for readiness and channels (AC-14)", async () => {
  await seedBookable(client);
  await expect(getBookingSetup(TEST_BRANCH_ID)).resolves.toMatchObject({
    bookable: false,
    notBookableReason: "VERIFICATION_NOT_CONFIGURED",
  });
  await configureWhatsApp(client);
  await expect(getBookingSetup(TEST_BRANCH_ID)).resolves.toMatchObject({
    bookable: true,
    channels: { whatsapp: true, email: false },
  });
  // The Admin switch alone is not enough: an email booking is paid online.
  await client.verificationSettings.update({
    where: { id: "default" },
    data: { emailEnabled: true },
  });
  await expect(getBookingSetup(TEST_BRANCH_ID)).resolves.toMatchObject({
    channels: { whatsapp: true, email: false },
    onlinePaymentPossible: false,
  });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true },
  });
  await expect(getBookingSetup(TEST_BRANCH_ID)).resolves.toMatchObject({
    channels: { whatsapp: true, email: true },
    onlinePaymentPossible: true,
  });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { checkInTime: null },
  });
  await expect(getBookingSetup(TEST_BRANCH_ID)).resolves.toMatchObject({
    bookable: false,
    notBookableReason: "CHECK_IN_TIME_MISSING",
  });
});

it("reads only this branch's active services", async () => {
  await seedBookable(client);
  await seedBranch(client, { id: "other-branch", slug: "other" });
  for (const [id, branchId, kind, active] of [
    ["own-breakfast", TEST_BRANCH_ID, "BREAKFAST", false],
    ["own-transfer", TEST_BRANCH_ID, "AIRPORT_TRANSFER", true],
    ["other-breakfast", "other-branch", "BREAKFAST", true],
  ] as const)
    await client.serviceOffering.create({
      data: {
        id,
        branchId,
        kind,
        active,
        priceUnit: kind === "BREAKFAST" ? "PER_BOOKING" : "PER_VEHICLE",
        priceMinor: 3000,
        maxVehicles: kind === "AIRPORT_TRANSFER" ? 4 : null,
      },
    });
  const setup = await getBookingSetup(TEST_BRANCH_ID);
  expect(setup?.services.map(({ kind }) => kind)).toEqual(["AIRPORT_TRANSFER"]);
  expect(setup?.maxVehicles).toBe(4);
});

it("prices under P6's per client limit, writing no booking or website step", async () => {
  await seedBookable(client);
  const first = await quoteBookingDetails(input, visitor("192.0.2.10"));
  expect(first).toMatchObject({
    ok: true,
    value: { available: true, quote: { accommodationMinor: 30_000 } },
  });
  for (let count = 1; count < 60; count += 1)
    await quoteBookingDetails(input, visitor("192.0.2.10"));
  const limited = await quoteBookingDetails(input, visitor("192.0.2.10"));
  expect(limited).toMatchObject({
    ok: false,
    error: { code: "RATE_LIMITED" },
  });
  await expect(
    quoteBookingDetails(input, visitor("192.0.2.11")),
  ).resolves.toMatchObject({ ok: true });
  expect(await client.siteEvent.count()).toBe(0);
  expect(await client.reservation.count()).toBe(0);
});

it("leaves no token, code or contact in a log line or website event (AC-13)", async () => {
  await seedBookable(client);
  await configureWhatsApp(client);
  const phone = "+12025550177";
  const visit = "cd".repeat(16);
  const logged: unknown[] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map(
    (level) =>
      vi
        .spyOn(console, level)
        .mockImplementation((...line: unknown[]) => void logged.push(line)),
  );
  const post = (path: string, body: unknown) =>
    new Request(`http://localhost/api/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 Android Mobile",
        "x-forwarded-for": "192.0.2.77",
        "rivana-analytics-session": visit,
      },
      body: JSON.stringify(body),
    });
  try {
    const requested = await codes.POST(
      post("phone-verifications", { phone, purpose: "BOOKING" }),
    );
    expect(requested.status).toBe(201);
    const { verificationId } = await requested.json();
    const transport = whatsAppTransport();
    if (!(transport instanceof FakeWhatsAppTransport))
      throw new Error("The fake transport is required.");
    const code = transport.deliveries.at(-1)!.parameters[0]!;
    const confirmed = await confirmations.POST(
      post(`phone-verifications/${verificationId}/confirmation`, { code }),
      { params: Promise.resolve({ verificationId }) },
    );
    expect(confirmed.status).toBe(200);
    const { token } = await confirmed.json();

    await vi.waitFor(async () =>
      expect(await client.siteEvent.count()).toBe(2),
    );
    const events = await client.siteEvent.findMany({ omit: { id: true } });
    expect(events.map(({ name }) => name).sort()).toEqual([
      "CODE_REQUESTED",
      "PHONE_VERIFIED",
    ]);
    // The routes did log, so the absence below means something.
    expect(logged.length).toBeGreaterThan(0);
    // `inspect` also reaches into error objects, which JSON would empty.
    const output = inspect(logged, {
      depth: Infinity,
      maxArrayLength: Infinity,
      maxStringLength: Infinity,
    });
    for (const secret of [token, code, phone]) {
      expect(JSON.stringify(events)).not.toContain(secret);
      expect(output).not.toContain(secret);
    }
    expect(JSON.stringify(events)).not.toContain(verificationId);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
