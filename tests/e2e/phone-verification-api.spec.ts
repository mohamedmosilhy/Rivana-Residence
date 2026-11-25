import { createHash, createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sql } from "./support/session";
import { E2E_PHONE_VERIFICATION_SECRET } from "./support/phone-verification";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run verification E2E.",
);

// covers: AC-7. Real HTTP against the production server, no real provider send.
// P9's successful fake delivery is separately exercised on the development runtime.
const secret = E2E_PHONE_VERIFICATION_SECRET;
test("public verification rejects invalid input and refuses unavailable WhatsApp", async ({
  request,
}) => {
  const invalid = await request.post("/api/v1/phone-verifications", {
    data: { phone: "+12025550101", purpose: "BOOKING", injected: true },
  });
  expect(invalid.status()).toBe(422);
  const missing = await request.post("/api/v1/phone-verifications", {
    data: { phone: "+12025550101", purpose: "BOOKING" },
  });
  expect(missing.status()).toBe(503);
  expect(await missing.json()).toMatchObject({
    code: "WHATSAPP_NOT_CONFIGURED",
  });
  expect(missing.headers()["cache-control"]).toBe("no-store");
});
// ADR 031, Q-99: the email channel on the production server, where no SMTP
// settings exist, so email delivery is not configured.
test("public verification by email refuses bad input and unavailable email delivery", async ({
  playwright,
  baseURL,
}, testInfo) => {
  // Each project gets its own client address: the shared per client limit
  // (10 requests per hour) would otherwise count both projects together.
  const request = await playwright.request.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: {
      "X-Forwarded-For":
        testInfo.project.name === "desktop-chromium"
          ? "198.51.100.80"
          : "198.51.100.81",
    },
  });
  const base = {
    phone: "+12025550101",
    purpose: "BOOKING",
    channel: "EMAIL",
  };
  for (const data of [
    base,
    { ...base, email: "not-an-email" },
    { phone: base.phone, purpose: "BOOKING", email: "guest@example.test" },
  ])
    expect(
      (await request.post("/api/v1/phone-verifications", { data })).status(),
    ).toBe(422);
  const missing = await request.post("/api/v1/phone-verifications", {
    data: { ...base, email: "guest@example.test" },
  });
  expect(missing.status()).toBe(503);
  expect(await missing.json()).toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
  expect(missing.headers()["cache-control"]).toBe("no-store");
  expect(missing.headers()["retry-after"]).toBeUndefined();
  // M9-T12b: a guest session by email is a valid request, refused here only
  // because this server has no email delivery.
  const session = await request.post("/api/v1/phone-verifications", {
    data: { ...base, email: "guest@example.test", purpose: "GUEST_SESSION" },
  });
  expect(session.status()).toBe(503);
  expect(await session.json()).toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
  await request.dispose();
});
test("public confirmation of an email code needs its channel and address binding", async ({
  request,
}, testInfo) => {
  const id = `t12-${testInfo.project.name === "desktop-chromium" ? "desktop" : "mobile"}-email`;
  const phone = "+12025550104",
    email = "guest@example.test",
    code = "000456";
  const now = new Date();
  const insert = (hashInput: unknown[], rowId: string) =>
    sql(
      'INSERT INTO "PhoneVerification" (id,phone,purpose,channel,email,"codeHash","expiresAt","clientKey","createdAt") VALUES ($1,$2,$3::"VerificationPurpose",$4::"VerificationChannel",$5,$6,$7,$8,$9)',
      [
        rowId,
        phone,
        "BOOKING",
        "EMAIL",
        email,
        createHmac("sha256", secret)
          .update(JSON.stringify(hashInput))
          .digest("hex"),
        new Date(now.getTime() + 600000),
        "e2e-hashed-client",
        now,
      ],
    );
  // A WhatsApp style fingerprint on an email row never confirms.
  await insert([`${id}-wa`, phone, "BOOKING", code], `${id}-wa`);
  await insert([id, phone, "BOOKING", "EMAIL", email, code], id);
  try {
    expect(
      (
        await request.post(
          `/api/v1/phone-verifications/${id}-wa/confirmation`,
          {
            data: { code },
          },
        )
      ).status(),
    ).toBe(422);
    const confirmed = await request.post(
      `/api/v1/phone-verifications/${id}/confirmation`,
      { data: { code } },
    );
    expect(confirmed.status()).toBe(200);
    expect((await confirmed.json()).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  } finally {
    await sql('DELETE FROM "PhoneVerification" WHERE id = ANY($1)', [
      [id, `${id}-wa`],
    ]);
  }
});
test("public confirmation persists wrong guesses and issues each purpose once", async ({
  request,
}, testInfo) => {
  for (const purpose of ["BOOKING", "GUEST_SESSION"]) {
    const id = `t5-${testInfo.project.name === "desktop-chromium" ? "desktop" : "mobile"}-${purpose.toLowerCase()}`;
    const phone = "+12025550103",
      code = "000123";
    const hash = createHmac("sha256", secret)
      .update(JSON.stringify([id, phone, purpose, code]))
      .digest("hex");
    const now = new Date();
    await sql(
      'INSERT INTO "PhoneVerification" (id,phone,purpose,"codeHash","expiresAt","clientKey","createdAt") VALUES ($1,$2,$3::"VerificationPurpose",$4,$5,$6,$7)',
      [
        id,
        phone,
        purpose,
        hash,
        new Date(now.getTime() + 600000),
        "e2e-hashed-client",
        now,
      ],
    );
    const path = `/api/v1/phone-verifications/${id}/confirmation`;
    try {
      const wrong = await request.post(path, { data: { code: "999999" } });
      expect(wrong.status()).toBe(422);
      expect(await wrong.json()).toMatchObject({
        code: "VERIFICATION_CODE_INVALID",
        context: { attemptsLeft: 4 },
      });
      expect(
        (
          await sql('SELECT attempts FROM "PhoneVerification" WHERE id=$1', [
            id,
          ])
        ).rows[0].attempts,
      ).toBe(1);
      const result = await request.post(path, { data: { code } });
      expect(result.status()).toBe(200);
      const body = await result.json();
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = (
        await sql(
          'SELECT "tokenHash",attempts,"tokenExpiresAt" FROM "PhoneVerification" WHERE id=$1',
          [id],
        )
      ).rows[0];
      expect(stored.tokenHash).toBe(
        createHash("sha256").update(body.token).digest("hex"),
      );
      expect(stored.attempts).toBe(2);
      expect(new Date(body.expiresAt).getTime()).toBe(
        stored.tokenExpiresAt.getTime(),
      );
      expect((await request.post(path, { data: { code } })).status()).toBe(410);
    } finally {
      await sql('DELETE FROM "PhoneVerification" WHERE id=$1', [id]);
    }
  }
});
