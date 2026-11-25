import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import type { FakeVerificationCodeEmail } from "@/infrastructure/email/verification-code-email";

import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";

// covers: Q-99 and AC-13 through production composition on real PostgreSQL:
// API-A9, the P9 email channel and its readiness, P10, the branch switch,
// and a staff block on email codes (T-VCH-1, T-VCH-5, T-VCH-8).
const session = vi.hoisted(() => ({ staff: null as StaffPrincipal | null }));
vi.stubEnv(
  "PHONE_VERIFICATION_SECRET",
  "integration-phone-secret-0123456789abcdef",
);
vi.stubEnv("EMAIL_PROVIDER", "fake");
vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(load: () => Promise<T>) =>
    () =>
      load(),
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => session.staff,
  throttleKeys: () => ({
    namespaced: (namespace: string, value: string) =>
      `rl:${namespace}:${value}`,
  }),
}));

const settingsRoute = await import(
  "@/app/api/v1/staff/settings/verification/route"
);
const requestRoute = await import("@/app/api/v1/phone-verifications/route");
const confirmRoute = await import(
  "@/app/api/v1/phone-verifications/[verificationId]/confirmation/route"
);
const branchRoute = await import("@/app/api/v1/staff/branches/[id]/route");
const { verificationCodeEmail } = await import(
  "@/composition/verification-channels"
);
const { staffGuests } = await import("@/composition/guests");

const client = createTestClient();
const ORIGIN = "http://localhost:3000";
const phone = "+12025550101";
const email = "guest@example.test";
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Test",
  email: "t@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};
const manager: StaffPrincipal = {
  ...admin,
  id: "actor-manager",
  role: "MANAGER",
  branchIds: [TEST_BRANCH_ID],
};
const outbox = () => verificationCodeEmail() as FakeVerificationCodeEmail;

const request = (method: string, path: string, body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      // A distinct client per request keeps the per client bucket out of the way.
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = (value: Record<string, string> = {}) => ({
  params: Promise.resolve(value),
});
const readSettings = () =>
  settingsRoute.GET(
    request("GET", "/api/v1/staff/settings/verification"),
    params(),
  );
const putSettings = (body: unknown) =>
  settingsRoute.PUT(
    request("PUT", "/api/v1/staff/settings/verification", body),
    params(),
  );
const requestEmailCode = (extra: Record<string, unknown> = {}) =>
  requestRoute.POST(
    request("POST", "/api/v1/phone-verifications", {
      phone,
      purpose: "BOOKING",
      channel: "EMAIL",
      email,
      ...extra,
    }),
    params(),
  );
const confirmCode = (id: string, code: string) =>
  confirmRoute.POST(
    request("POST", `/api/v1/phone-verifications/${id}/confirmation`, {
      code,
    }),
    params({ verificationId: id }),
  );
const audits = () =>
  client.auditEvent.findMany({
    where: { action: "verification-settings.updated" },
    orderBy: { occurredAt: "asc" },
  });

beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  session.staff = admin;
  outbox().deliveries.length = 0;
});
afterAll(() => client.$disconnect());

describe("API-A9 email verification switch (Q-99)", () => {
  it("starts off, and only an Admin can read or change it", async () => {
    const read = await readSettings();
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      emailVerificationEnabled: false,
      emailDeliveryConfigured: true,
      whatsAppConfigured: false,
      emailChannelReady: false,
    });
    session.staff = manager;
    expect((await readSettings()).status).toBe(403);
    expect((await putSettings({ emailVerificationEnabled: true })).status).toBe(
      403,
    );
    session.staff = null;
    expect((await readSettings()).status).toBe(401);
    expect(
      (
        await client.verificationSettings.findUniqueOrThrow({
          where: { id: "default" },
        })
      ).emailEnabled,
    ).toBe(false);
  });

  it("turns on and off with one audit event per real change", async () => {
    const on = await putSettings({ emailVerificationEnabled: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({
      emailVerificationEnabled: true,
      emailChannelReady: true,
    });
    expect((await putSettings({ emailVerificationEnabled: true })).status).toBe(
      200,
    );
    expect(
      (await putSettings({ emailVerificationEnabled: false })).status,
    ).toBe(200);
    const rows = await audits();
    expect(rows.map((row) => row.changes)).toEqual([
      { emailVerificationEnabled: { from: false, to: true } },
      { emailVerificationEnabled: { from: true, to: false } },
    ]);
    expect(rows[0]).toMatchObject({
      actorId: admin.id,
      entityType: "VerificationSettings",
      branchId: null,
    });
    const stored = await client.verificationSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(stored).toMatchObject({
      emailEnabled: false,
      updatedById: admin.id,
    });
  });

  it("reads a missing settings row as off and restores it on save", async () => {
    await client.verificationSettings.deleteMany();
    expect(await (await readSettings()).json()).toMatchObject({
      emailVerificationEnabled: false,
      emailChannelReady: false,
      updatedAt: null,
    });
    expect((await requestEmailCode()).status).toBe(503);
    expect((await putSettings({ emailVerificationEnabled: true })).status).toBe(
      200,
    );
    expect(
      await client.verificationSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).toMatchObject({ emailEnabled: true, updatedById: admin.id });
  });

  it("refuses a malformed body", async () => {
    for (const body of [{}, { emailVerificationEnabled: "on" }])
      expect((await putSettings(body)).status).toBe(422);
    expect(await audits()).toHaveLength(0);
  });
});

describe("P9 email channel through production wiring", () => {
  it("refuses email codes while the switch is off and sends them once it is on", async () => {
    const off = await requestEmailCode();
    expect(off.status).toBe(503);
    expect(await off.json()).toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
    expect(off.headers.get("retry-after")).toBeNull();
    expect(await client.phoneVerification.count()).toBe(0);

    await putSettings({ emailVerificationEnabled: true });
    const sent = await requestEmailCode({ email: " Guest@Example.TEST " });
    expect(sent.status).toBe(201);
    const { verificationId } = await sent.json();
    const delivery = outbox().deliveries.at(-1)!;
    expect(delivery).toMatchObject({ id: verificationId, to: email });
    expect(delivery.code).toMatch(/^\d{6}$/);
    const row = await client.phoneVerification.findUniqueOrThrow({
      where: { id: verificationId },
    });
    expect(row).toMatchObject({ channel: "EMAIL", email, phone });
    // The code is never stored in plain text.
    expect(JSON.stringify(row)).not.toContain(delivery.code);

    // Turning the switch off stops new codes but lets this one finish (Q-99).
    await putSettings({ emailVerificationEnabled: false });
    expect((await requestEmailCode()).status).toBe(503);
    const wrong = await confirmCode(
      verificationId,
      delivery.code === "000000" ? "000001" : "000000",
    );
    expect(wrong.status).toBe(422);
    const confirmed = await confirmCode(verificationId, delivery.code);
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("answers the same for an email with and without history", async () => {
    await putSettings({ emailVerificationEnabled: true });
    const fresh = await requestEmailCode({ email: "new@example.test" });
    await client.guest.create({
      data: {
        id: "known",
        phone: "+12025550102",
        name: "Known",
        email: "known@example.test",
        emailVerifiedAt: new Date(),
      },
    });
    const known = await requestEmailCode({ email: "known@example.test" });
    expect([fresh.status, known.status]).toEqual([201, 201]);
    const shape = (body: Record<string, unknown>) => Object.keys(body).sort();
    expect(shape(await fresh.json())).toEqual(shape(await known.json()));
  });

  it("refuses an email code for a blocked phone, and a block cancels open email codes", async () => {
    await putSettings({ emailVerificationEnabled: true });
    await client.guest.create({
      data: { id: "guest", phone, name: "Guest" },
    });
    const sent = await requestEmailCode();
    expect(sent.status).toBe(201);
    const { verificationId } = await sent.json();
    const code = outbox().deliveries.at(-1)!.code;
    const blocked = await staffGuests({ client }).block.execute(
      admin,
      "guest",
      "Abuse",
    );
    expect(blocked.ok).toBe(true);
    const audit = await client.auditEvent.findFirstOrThrow({
      where: { action: "guest.blocked" },
    });
    expect(audit.changes).toMatchObject({ verificationsInvalidated: 1 });
    expect((await confirmCode(verificationId, code)).status).toBe(403);
    const refused = await requestEmailCode();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "PHONE_BLOCKED" });
  });

  it("sends an email guest session code through production wiring, behind the same switch (M9-T12b)", async () => {
    expect((await requestEmailCode({ purpose: "GUEST_SESSION" })).status).toBe(
      503,
    );
    await putSettings({ emailVerificationEnabled: true });
    const response = await requestEmailCode({ purpose: "GUEST_SESSION" });
    expect(response.status).toBe(201);
    const { verificationId } = await response.json();
    expect(outbox().deliveries.at(-1)).toMatchObject({
      id: verificationId,
      to: email,
    });
    expect(
      await client.phoneVerification.findUniqueOrThrow({
        where: { id: verificationId },
      }),
    ).toMatchObject({ purpose: "GUEST_SESSION", channel: "EMAIL", email });
  });
});

describe("branch online booking guard with email (T-VCH-8)", () => {
  it("passes the verification check when email is ready and WhatsApp is not", async () => {
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { checkInTime: "14:00" },
    });
    const patch = () =>
      branchRoute.PATCH(
        request("PATCH", `/api/v1/staff/branches/${TEST_BRANCH_ID}`, {
          onlineBookingEnabled: true,
        }),
        params({ id: TEST_BRANCH_ID }),
      );
    const none = await patch();
    expect((await none.json()).fieldErrors.onlineBookingEnabled).toEqual([
      "Online booking can't be turned on until WhatsApp or email is set up for verification codes.",
    ]);
    await putSettings({ emailVerificationEnabled: true });
    const emailReady = await patch();
    // Only the M10 refusal remains: the verification channel check passed.
    expect((await emailReady.json()).fieldErrors.onlineBookingEnabled).toEqual([
      "Online booking can't be turned on yet. The booking journey arrives in a later release.",
    ]);
  });
});
