import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RequestPhoneVerification,
  ConfirmPhoneVerification,
  type VerificationContext,
  type VerificationRecord,
  type PhoneVerificationRepository,
  type GuestRepository,
} from "@/application/guests";
import { failure, success } from "@/application/shared/result";
import { NodePhoneVerificationCrypto } from "@/infrastructure/crypto/phone-verification-crypto";
import {
  PhoneVerificationRequest,
  PhoneVerificationConfirmation,
} from "@/contracts/api/v1/phone-verifications";
import { parseServerEnv } from "@/lib/env/schema";

// covers: AC-7, AC-10, T-GST verification and T-VAL.
const phone = "+12025550101";
const secret = "unit-phone-secret-0123456789abcdef";
const crypto = new NodePhoneVerificationCrypto(secret);
let rows: Map<string, VerificationRecord>;
let now: Date;
let sequence: number;
let blocked: boolean;
const sender = {
  send: vi.fn(async () => ({ ok: true as const, providerMessageId: "fake" })),
};
const setup = { isConfigured: vi.fn(async () => true) };
const repository: PhoneVerificationRepository = {
  lockPhone: async () => success(undefined),
  findById: async (id) => rows.get(id) ?? null,
  findByTokenHash: async (hash) =>
    [...rows.values()].find((row) => row.tokenHash === hash) ?? null,
  consume: async (id, at) => {
    rows.set(id, { ...rows.get(id)!, consumedAt: at });
  },
  lock: async (id) => success(rows.get(id) ?? null),
  requestHistory: async (number, since) =>
    [...rows.values()]
      .filter((row) => row.phone === number.value && row.createdAt > since)
      .map((row) => row.createdAt),
  insert: async (row) => {
    rows.set(row.id, row);
  },
  saveConfirmation: async (id, values) => {
    rows.set(id, { ...rows.get(id)!, ...values });
  },
  invalidate: async (id) => {
    rows.set(id, { ...rows.get(id)!, attempts: 5 });
  },
};
const guests: GuestRepository = {
  findByPhone: async () => null,
  ensureExists: async () => {
    throw new Error("Not used");
  },
  recordWebsiteBooking: async () => {
    throw new Error("Not used");
  },
  lockByPhone: async () =>
    success(
      blocked
        ? {
            id: "g",
            phone,
            name: "Guest",
            email: null,
            phoneVerifiedAt: null,
            marketingOptInAt: null,
            marketingConsentVersion: null,
            marketingOptOutAt: null,
            blockedAt: now,
            blockedById: null,
            blockReason: null,
            createdAt: now,
            updatedAt: now,
          }
        : null,
    ),
  updateContact: async () => {
    throw new Error("Not used");
  },
};
function deps() {
  return {
    unitOfWork: {
      run: async <T>(operation: (context: VerificationContext) => Promise<T>) =>
        operation({ guests, verifications: repository }),
    },
    verifications: repository,
    crypto: {
      ...crypto,
      generateCode: () => "000123",
      codeHash: crypto.codeHash.bind(crypto),
      codeMatches: crypto.codeMatches.bind(crypto),
      generateToken: crypto.generateToken.bind(crypto),
      tokenHash: crypto.tokenHash.bind(crypto),
    },
    clock: { now: () => now },
    ids: { next: () => `verification-${++sequence}` },
  };
}
const request = (input: unknown = { phone, purpose: "BOOKING" }) =>
  new RequestPhoneVerification({ ...deps(), setup, sender }).execute(
    input,
    "hashed-client",
  );
const confirm = (id = "verification-1", code = "000123") =>
  new ConfirmPhoneVerification(deps()).execute(id, { code });
beforeEach(() => {
  rows = new Map();
  now = new Date("2026-11-18T10:00:00Z");
  sequence = 0;
  blocked = false;
  vi.clearAllMocks();
  setup.isConfigured.mockResolvedValue(true);
  sender.send.mockResolvedValue({ ok: true, providerMessageId: "fake" });
});

describe("phone verification use cases", () => {
  it.each(["BOOKING", "GUEST_SESSION"])(
    "issues a hashed thirty minute token for %s",
    async (purpose) => {
      const result = await request({ phone, purpose });
      expect(result).toMatchObject({
        ok: true,
        value: {
          expiresAt: new Date(now.getTime() + 600000),
          resendAvailableAt: now,
        },
      });
      const row = rows.get("verification-1")!;
      expect(row.codeHash).toHaveLength(64);
      expect(row.codeHash).not.toContain("000123");
      const confirmed = await confirm();
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;
      expect(confirmed.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(confirmed.value.expiresAt).toEqual(
        new Date(now.getTime() + 1800000),
      );
      expect(rows.get(row.id)?.tokenHash).toBe(
        crypto.tokenHash(confirmed.value.token),
      );
      expect(rows.get(row.id)?.purpose).toBe(purpose);
      expect(await confirm()).toMatchObject({
        error: { code: "VERIFICATION_EXPIRED" },
      });
    },
  );
  it("uses the verification timeout detail for a busy guest on both public operations", async () => {
    await request();
    const busy = vi
      .spyOn(guests, "lockByPhone")
      .mockResolvedValue(
        failure("TRY_AGAIN", "Guest record is busy. Please try again shortly."),
      );
    try {
      for (const outcome of [await request(), await confirm()]) {
        expect(outcome).toMatchObject({
          error: {
            code: "TRY_AGAIN",
            message: "Verification is busy. Please try again shortly.",
          },
        });
        expect(JSON.stringify(outcome)).not.toContain("Guest");
      }
    } finally {
      busy.mockRestore();
    }
  });
  it("rejects blocked phones without creating or sending a code", async () => {
    blocked = true;
    expect(await request()).toMatchObject({ error: { code: "PHONE_BLOCKED" } });
    expect(rows.size).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
  it("checks blocking again on confirmation", async () => {
    await request();
    blocked = true;
    expect(await confirm()).toMatchObject({ error: { code: "PHONE_BLOCKED" } });
    expect(rows.get("verification-1")?.tokenHash).toBeNull();
  });
  it("fails closed without a verification secret and still checks input and setup first", async () => {
    const service = new RequestPhoneVerification({
      ...deps(),
      crypto: null,
      setup,
      sender,
    });
    expect(
      await service.execute(
        { phone, purpose: "BOOKING", website: "spam" },
        "hash",
      ),
    ).toMatchObject({ error: { code: "VALIDATION" } });
    setup.isConfigured.mockResolvedValue(false);
    expect(
      await service.execute({ phone, purpose: "BOOKING" }, "hash"),
    ).toMatchObject({ error: { code: "WHATSAPP_NOT_CONFIGURED" } });
    setup.isConfigured.mockResolvedValue(true);
    expect(
      await service.execute({ phone, purpose: "BOOKING" }, "hash"),
    ).toMatchObject({ error: { code: "VERIFICATION_UNAVAILABLE" } });
    expect(
      await new ConfirmPhoneVerification({ ...deps(), crypto: null }).execute(
        "unknown",
        { code: "000123" },
      ),
    ).toMatchObject({ error: { code: "VERIFICATION_UNAVAILABLE" } });
    expect(rows.size).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
  it("refuses missing setup without a verification write", async () => {
    setup.isConfigured.mockResolvedValue(false);
    expect(await request()).toMatchObject({
      error: { code: "WHATSAPP_NOT_CONFIGURED" },
    });
    expect(rows.size).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
  it("invalidates a code after a provider exception without exposing its text", async () => {
    sender.send.mockRejectedValueOnce(new Error("secret 000123"));
    expect(await request()).toMatchObject({
      error: { code: "VERIFICATION_UNAVAILABLE", retryAfterSeconds: 60 },
    });
    expect(await confirm()).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
    expect(rows.size).toBe(1);
  });
  it("allows five guesses including the final correct guess", async () => {
    await request();
    for (let n = 4; n >= 1; n--)
      expect(await confirm(undefined, "999999")).toMatchObject({
        error: {
          code: "VERIFICATION_CODE_INVALID",
          context: { attemptsLeft: n },
        },
      });
    expect((await confirm()).ok).toBe(true);
    expect(rows.get("verification-1")?.attempts).toBe(5);
  });
  it("exhausts the code after five wrong guesses", async () => {
    await request();
    for (let n = 4; n >= 0; n--)
      expect(await confirm(undefined, "999999")).toMatchObject({
        error: { context: { attemptsLeft: n } },
      });
    expect(await confirm()).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
  });
  it("expires exactly ten minutes after creation", async () => {
    await request();
    now = new Date(now.getTime() + 600000);
    expect(await confirm()).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
  });
  it("hides unknown verification ids as expired", async () => {
    expect(await confirm("unknown")).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
  });
  it("shares rolling limits across purposes and retains earlier codes", async () => {
    await request();
    await request({ phone, purpose: "GUEST_SESSION" });
    const third = await request();
    expect(third).toMatchObject({
      value: { resendAvailableAt: new Date(now.getTime() + 900000) },
    });
    expect(await request()).toMatchObject({
      error: { code: "RATE_LIMITED", retryAfterSeconds: 900 },
    });
    expect((await confirm()).ok).toBe(true);
    now = new Date(now.getTime() + 900000);
    expect((await request()).ok).toBe(true);
  });
  it.each([
    { phone, purpose: "OTHER" },
    { phone: "2025550101", purpose: "BOOKING" },
    { phone, purpose: "BOOKING", website: "spam" },
    { phone, purpose: "BOOKING", token: "injected" },
    { phone: "+123", purpose: "BOOKING" },
  ])("refuses invalid request %j before sending", async (input) => {
    expect(await request(input)).toMatchObject({
      error: { code: "VALIDATION" },
    });
    expect(rows.size).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
  it.each(["12345", "1234567", "abcdef", "１２３４５６"])(
    "refuses malformed code %s without spending attempts",
    async (code) => {
      await request();
      expect(await confirm(undefined, code)).toMatchObject({
        error: { code: "VALIDATION" },
      });
      expect(rows.get("verification-1")?.attempts).toBe(0);
    },
  );
});
describe("verification cryptography and contracts", () => {
  it("binds a code to the secret, identity, phone and purpose", () => {
    const hash = crypto.codeHash("id", phone, "BOOKING", "000123");
    expect(crypto.codeMatches("id", phone, "BOOKING", "000123", hash)).toBe(
      true,
    );
    for (const [id, p, purpose, code] of [
      ["other", phone, "BOOKING", "000123"],
      ["id", "+12025550102", "BOOKING", "000123"],
      ["id", phone, "GUEST_SESSION", "000123"],
      ["id", phone, "BOOKING", "000124"],
    ])
      expect(crypto.codeMatches(id!, p!, purpose!, code!, hash)).toBe(false);
    expect(
      new NodePhoneVerificationCrypto(secret + "x").codeMatches(
        "id",
        phone,
        "BOOKING",
        "000123",
        hash,
      ),
    ).toBe(false);
    expect(crypto.codeMatches("id", phone, "BOOKING", "000123", "bad")).toBe(
      false,
    );
  });
  it("generates bounded codes and distinct full entropy tokens", () => {
    const tokens = new Set<string>();
    for (let n = 0; n < 50; n++) {
      expect(crypto.generateCode()).toMatch(/^\d{6}$/);
      const token = crypto.generateToken();
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      tokens.add(token);
    }
    expect(tokens.size).toBe(50);
  });
  it("rejects short secrets in the environment and crypto adapter", () => {
    expect(() => new NodePhoneVerificationCrypto("short")).toThrow();
    expect(() =>
      parseServerEnv({ PHONE_VERIFICATION_SECRET: "short" }),
    ).toThrow("PHONE_VERIFICATION_SECRET");
  });
  it("rejects unknown HTTP fields and nonstring codes", () => {
    expect(
      PhoneVerificationRequest.safeParse({
        phone,
        purpose: "BOOKING",
        price: 10,
      }).success,
    ).toBe(false);
    expect(
      PhoneVerificationConfirmation.safeParse({ code: 123456 }).success,
    ).toBe(false);
    expect(
      PhoneVerificationConfirmation.safeParse({ code: "000123", phone })
        .success,
    ).toBe(false);
  });
});
