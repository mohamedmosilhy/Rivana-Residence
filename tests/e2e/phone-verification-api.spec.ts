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
