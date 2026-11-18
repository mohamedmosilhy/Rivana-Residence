import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RequestPhoneVerification,
  ConfirmPhoneVerification,
  type VerificationContext,
} from "@/application/guests";
import type { WhatsAppSender } from "@/application/notifications";
import { PhoneNumber } from "@/domain/guests";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodePhoneVerificationCrypto } from "@/infrastructure/crypto/phone-verification-crypto";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";
import { createTestClient, resetDatabase } from "../support/database";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";

// covers: AC-7, AC-8, AC-10, T-GST verification, T-HTTP. No real sends.
vi.stubEnv(
  "PHONE_VERIFICATION_SECRET",
  "integration-phone-secret-0123456789abcdef",
);
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => ({
    namespaced: (namespace: string, value: string) =>
      `rl:${namespace}:${value}`,
  }),
}));
const requestRoute = await import("@/app/api/v1/phone-verifications/route");
const confirmRoute = await import(
  "@/app/api/v1/phone-verifications/[verificationId]/confirmation/route"
);
const { whatsAppTransport } = await import("@/composition/notifications");
const client = createTestClient();
const phone = "+12025550101";
const code = "000123";
const crypto = new NodePhoneVerificationCrypto(
  "integration-phone-secret-0123456789abcdef",
);
let now: Date;
let sequence = 0;
let sent: number;
const sender: WhatsAppSender = {
  send: async () => {
    sent++;
    return { ok: true, providerMessageId: "fake" };
  },
};
function dependencies(connection: PrismaClient = client) {
  return {
    unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
      connection,
      (transaction) => ({
        guests: new PrismaGuestRepository(transaction),
        verifications: new PrismaPhoneVerificationRepository(transaction),
      }),
    ),
    verifications: new PrismaPhoneVerificationRepository(connection),
    crypto: {
      generateCode: () => code,
      codeHash: crypto.codeHash.bind(crypto),
      codeMatches: crypto.codeMatches.bind(crypto),
      generateToken: crypto.generateToken.bind(crypto),
      tokenHash: crypto.tokenHash.bind(crypto),
    },
    clock: { now: () => now },
    ids: { next: () => `verification-${++sequence}` },
  };
}
function requester(connection = client, provider = sender) {
  return new RequestPhoneVerification({
    ...dependencies(connection),
    setup: { isConfigured: async () => true },
    sender: provider,
  });
}
const request = (purpose: "BOOKING" | "GUEST_SESSION" = "BOOKING") =>
  requester().execute({ phone, purpose }, "hashed-client");
const confirm = (id: string, guess = code, connection = client) =>
  new ConfirmPhoneVerification(dependencies(connection)).execute(id, {
    code: guess,
  });
async function id() {
  const result = await request();
  if (!result.ok) throw new Error(result.error.code);
  return result.value.verificationId;
}
function httpRequest(body: unknown, path = "/api/v1/phone-verifications") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function configured() {
  await client.whatsAppSettings.update({
    where: { id: "default" },
    data: {
      businessPhoneNumber: phone,
      providerPhoneNumberId: "test-provider-id",
    },
  });
  await client.whatsAppTemplate.createMany({
    data: [
      {
        id: "verify-template",
        purpose: "VERIFICATION_CODE",
        category: "AUTHENTICATION",
        language: "en",
        providerName: "test_verify",
        previewText: "Code {{code}}",
        variables: ["code"],
        active: true,
      },
      {
        id: "confirmed-template",
        purpose: "BOOKING_CONFIRMED",
        category: "UTILITY",
        language: "en",
        providerName: "test_confirmed",
        previewText: "Confirmed",
        variables: [],
        active: true,
      },
    ],
  });
}
beforeEach(async () => {
  await resetDatabase(client);
  now = new Date("2026-11-18T10:00:00Z");
  sent = 0;
  const fake = whatsAppTransport();
  if (fake instanceof FakeWhatsAppTransport) fake.deliveries.length = 0;
});
afterAll(async () => {
  await client.$disconnect();
});

describe("verification transactions on PostgreSQL", () => {
  it.each(["BOOKING", "GUEST_SESSION"] as const)(
    "persists only hashes and confirms %s once",
    async (purpose) => {
      const result = await request(purpose);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await client.phoneVerification.findUniqueOrThrow({
        where: { id: result.value.verificationId },
      });
      expect(row.codeHash).toBe(crypto.codeHash(row.id, phone, purpose, code));
      expect(row.tokenHash).toBeNull();
      expect(row.clientKey).toBe("hashed-client");
      const confirmed = await confirm(row.id);
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;
      const stored = await client.phoneVerification.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(stored.tokenHash).toBe(crypto.tokenHash(confirmed.value.token));
      expect(stored.tokenExpiresAt).toEqual(new Date(now.getTime() + 1800000));
      expect(stored.consumedAt).toBeNull();
      expect(await confirm(row.id)).toMatchObject({
        error: { code: "VERIFICATION_EXPIRED" },
      });
      expect(await client.guest.count()).toBe(0);
      expect(await client.notificationOutbox.count()).toBe(0);
    },
  );
  it("commits failed attempts and refuses the sixth guess even when correct", async () => {
    const verificationId = await id();
    for (let left = 4; left >= 0; left--) {
      expect(await confirm(verificationId, "999999")).toMatchObject({
        error: {
          code: "VERIFICATION_CODE_INVALID",
          context: { attemptsLeft: left },
        },
      });
      expect(
        (
          await client.phoneVerification.findUniqueOrThrow({
            where: { id: verificationId },
          })
        ).attempts,
      ).toBe(5 - left);
    }
    expect(await confirm(verificationId)).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
  });
  it("expires at the exact boundary", async () => {
    const verificationId = await id();
    now = new Date(now.getTime() + 600000);
    expect(await confirm(verificationId)).toMatchObject({
      error: { code: "VERIFICATION_EXPIRED" },
    });
  });
  it("enforces rolling phone windows across purposes without resetting at midnight", async () => {
    now = new Date("2026-11-18T23:58:00Z");
    await request();
    await request("GUEST_SESSION");
    await request();
    now = new Date("2026-11-19T00:01:00Z");
    expect(await request()).toMatchObject({
      error: { code: "RATE_LIMITED", retryAfterSeconds: 720 },
    });
    now = new Date("2026-11-19T00:13:00Z");
    expect((await request()).ok).toBe(true);
  });
  it("keeps failed deliveries in the rolling history and invalidates their codes", async () => {
    const failing: WhatsAppSender = {
      send: async () => ({
        ok: false,
        code: "UNAVAILABLE",
        detail: "not returned",
      }),
    };
    for (let n = 0; n < 3; n++)
      expect(
        await requester(client, failing).execute(
          { phone, purpose: "BOOKING" },
          "hashed-client",
        ),
      ).toMatchObject({ error: { code: "VERIFICATION_UNAVAILABLE" } });
    const records = await client.phoneVerification.findMany();
    expect(records).toHaveLength(3);
    for (const row of records) {
      expect(row.attempts).toBe(5);
      expect(await confirm(row.id)).toMatchObject({
        error: { code: "VERIFICATION_EXPIRED" },
      });
    }
    expect(await request()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
  it("enforces ten requests per rolling day after the short windows reopen", async () => {
    const start = now.getTime();
    for (let n = 0; n < 10; n++) {
      now = new Date(start + n * 900000);
      expect((await request()).ok).toBe(true);
    }
    now = new Date(start + 10 * 900000);
    expect(await request()).toMatchObject({
      error: { code: "RATE_LIMITED", retryAfterSeconds: 77400 },
    });
    now = new Date(start + 86400000);
    expect((await request()).ok).toBe(true);
  });
  it("sends only after commit with no transaction open during delivery", async () => {
    const provider: WhatsAppSender = {
      send: async () => {
        const row = await client.phoneVerification.findFirstOrThrow();
        expect(row.codeHash).toHaveLength(64);
        return { ok: true, providerMessageId: "after-commit" };
      },
    };
    expect(
      (
        await requester(client, provider).execute(
          { phone, purpose: "BOOKING" },
          "hashed-client",
        )
      ).ok,
    ).toBe(true);
  });
  it("sends nothing and writes nothing when the verification transaction rolls back", async () => {
    const base = dependencies();
    const failing = new RequestPhoneVerification({
      ...base,
      unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
        client,
        (t) => ({
          guests: new PrismaGuestRepository(t),
          verifications: new (class extends PrismaPhoneVerificationRepository {
            override async insert(
              row: Parameters<PrismaPhoneVerificationRepository["insert"]>[0],
            ) {
              await super.insert(row);
              throw new Error("rollback");
            }
          })(t),
        }),
      ),
      setup: { isConfigured: async () => true },
      sender,
    });
    await expect(
      failing.execute({ phone, purpose: "BOOKING" }, "hashed-client"),
    ).rejects.toThrow("rollback");
    expect(await client.phoneVerification.count()).toBe(0);
    expect(sent).toBe(0);
  });
  it("refuses blocked phones at request and confirmation", async () => {
    const verificationId = await id();
    await client.guest.create({
      data: { id: "blocked", phone, name: "Test Guest", blockedAt: now },
    });
    expect(await request()).toMatchObject({ error: { code: "PHONE_BLOCKED" } });
    expect(await confirm(verificationId)).toMatchObject({
      error: { code: "PHONE_BLOCKED" },
    });
    expect(await client.phoneVerification.count()).toBe(1);
    expect(sent).toBe(1);
  });
  it("has the same response shape for a new phone and an existing profile", async () => {
    const first = await request();
    await client.guest.create({
      data: { id: "existing", phone, name: "Test Guest" },
    });
    const second = await request();
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(Object.keys(first.value)).toEqual(Object.keys(second.value));
      expect(first.value.expiresAt).toEqual(second.value.expiresAt);
      expect(first.value.resendAvailableAt).toEqual(
        second.value.resendAvailableAt,
      );
    }
  });
});

describe("P9 and P10 HTTP contract", () => {
  it("returns setup failure without a verification row", async () => {
    const response = await requestRoute.POST(
      httpRequest({ phone, purpose: "BOOKING" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "WHATSAPP_NOT_CONFIGURED",
    });
    expect(await client.phoneVerification.count()).toBe(0);
  });
  it("requests and confirms through the real handlers with no sensitive logs", async () => {
    await configured();
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await requestRoute.POST(
        httpRequest({ phone, purpose: "GUEST_SESSION" }),
      );
      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual([
        "expiresAt",
        "resendAvailableAt",
        "verificationId",
      ]);
      const fake = whatsAppTransport();
      expect(fake).toBeInstanceOf(FakeWhatsAppTransport);
      if (!(fake instanceof FakeWhatsAppTransport))
        throw new Error("fake required");
      const delivered = fake.deliveries[0]!.parameters[0]!;
      const response2 = await confirmRoute.POST(
        httpRequest({ code: delivered }),
        { params: Promise.resolve({ verificationId: body.verificationId }) },
      );
      expect(response2.status).toBe(200);
      const token = await response2.json();
      expect(token.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const text = JSON.stringify([...logs.mock.calls, ...errors.mock.calls]);
      for (const sensitive of [phone, delivered, token.token, "Test Guest"])
        expect(text).not.toContain(sensitive);
      expect(text).toContain(
        "/api/v1/phone-verifications/[verificationId]/confirmation",
      );
    } finally {
      logs.mockRestore();
      errors.mockRestore();
    }
  });
  it.each([
    { phone, purpose: "BOOKING", extra: "x" },
    { phone, purpose: "BOOKING", website: "spam" },
    { phone: "+123", purpose: "BOOKING" },
  ])("rejects invalid bodies before writing %j", async (body) => {
    await configured();
    const response = await requestRoute.POST(httpRequest(body));
    expect(response.status).toBe(422);
    expect(await client.phoneVerification.count()).toBe(0);
  });
  it.each(["spam", "x".repeat(201), "x".repeat(32_000)])(
    "gives the same generic refusal for any filled honeypot within the body cap (%#)",
    async (website) => {
      const response = await requestRoute.POST(
        httpRequest({ phone, purpose: "BOOKING", website }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "VALIDATION",
        detail: "Check the verification details.",
        fieldErrors: {},
      });
      expect(await client.phoneVerification.count()).toBe(0);
      const fake = whatsAppTransport();
      if (fake instanceof FakeWhatsAppTransport)
        expect(fake.deliveries).toHaveLength(0);
    },
  );
  it("maps invalid codes to attemptsLeft and unknown ids to 410", async () => {
    now = new Date();
    const verificationId = await id();
    const response = await confirmRoute.POST(httpRequest({ code: "999999" }), {
      params: Promise.resolve({ verificationId }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "VERIFICATION_CODE_INVALID",
      context: { attemptsLeft: 4 },
    });
    const missing = await confirmRoute.POST(httpRequest({ code }), {
      params: Promise.resolve({ verificationId: "unknown" }),
    });
    expect(missing.status).toBe(410);
  });
  it("enforces P9's shared anonymous client bucket", async () => {
    await configured();
    for (let n = 0; n < 10; n++) {
      const response = await requestRoute.POST(
        httpRequest({ phone, purpose: "BOOKING" }),
      );
      expect([201, 429]).toContain(response.status);
    }
    const response = await requestRoute.POST(
      httpRequest({ phone: "+12025550102", purpose: "BOOKING" }),
    );
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await client.phoneVerification.count()).toBe(3);
  });
  it("enforces P10's independent client bucket", async () => {
    for (let n = 0; n < 20; n++) {
      const response = await confirmRoute.POST(httpRequest({ code }), {
        params: Promise.resolve({ verificationId: "unknown" }),
      });
      expect(response.status).toBe(410);
    }
    const response = await confirmRoute.POST(httpRequest({ code }), {
      params: Promise.resolve({ verificationId: "unknown" }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});

// Twenty observed lock waits per race, separate clients, no sleeps as overlap evidence.
describe("verification concurrency", () => {
  it("serializes first requests for a phone with no guest row (20 rounds)", async () => {
    await withIndependentClients(2, async ([holder, contender]) => {
      for (let round = 0; round < 20; round++) {
        await client.phoneVerification.deleteMany();
        const ready = deferred(),
          release = deferred(),
          pid = deferred<number>();
        const first = requester(holder);
        const original = dependencies(holder);
        const holding = new RequestPhoneVerification({
          ...original,
          unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
            holder!,
            (t) => ({
              guests: new PrismaGuestRepository(t),
              verifications:
                new (class extends PrismaPhoneVerificationRepository {
                  override async lockPhone(number: PhoneNumber) {
                    const result = await super.lockPhone(number);
                    ready.resolve();
                    await release.promise;
                    return result;
                  }
                })(t),
            }),
          ),
          setup: { isConfigured: async () => true },
          sender,
        });
        const held = holding.execute({ phone, purpose: "BOOKING" }, "hash");
        await ready.promise;
        const waiting = new RequestPhoneVerification({
          ...dependencies(contender),
          unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
            contender!,
            (t) => ({
              guests: new PrismaGuestRepository(t),
              verifications:
                new (class extends PrismaPhoneVerificationRepository {
                  override async lockPhone(number: PhoneNumber) {
                    const [backend] = await t.$queryRaw<
                      { pid: number }[]
                    >`SELECT pg_backend_pid() AS pid`;
                    pid.resolve(backend!.pid);
                    return super.lockPhone(number);
                  }
                })(t),
            }),
          ),
          setup: { isConfigured: async () => true },
          sender,
        });
        const queued = waiting.execute(
          { phone, purpose: "GUEST_SESSION" },
          "hash",
        );
        try {
          await waitForDatabaseLock(client, await pid.promise);
        } finally {
          release.resolve();
        }
        expect((await held).ok).toBe(true);
        expect((await queued).ok).toBe(true);
        const final = await Promise.all([
          first.execute({ phone, purpose: "BOOKING" }, "hash"),
          requester(contender).execute({ phone, purpose: "BOOKING" }, "hash"),
        ]);
        expect(final.filter((result) => result.ok)).toHaveLength(1);
        expect(await client.phoneVerification.count()).toBe(3);
        expect(await client.guest.count()).toBe(0);
      }
    });
  });
  it("serializes concurrent wrong guesses and successful confirmation (20 rounds)", async () => {
    await withIndependentClients(2, async ([holder, contender]) => {
      for (let round = 0; round < 20; round++) {
        await client.phoneVerification.deleteMany();
        const verificationId = await id();
        const ready = deferred();
        const release = deferred();
        const pid = deferred<number>();
        const held = holder!.$transaction(
          async (t) => {
            await t.$queryRaw`SELECT id FROM "PhoneVerification" WHERE id=${verificationId} FOR UPDATE`;
            ready.resolve();
            await release.promise;
            await t.phoneVerification.update({
              where: { id: verificationId },
              data: { attempts: 4 },
            });
          },
          { timeout: 10000 },
        );
        await ready.promise;
        const base = dependencies(contender);
        const waiting = new ConfirmPhoneVerification({
          ...base,
          unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
            contender!,
            (t) => {
              return {
                guests: new PrismaGuestRepository(t),
                verifications:
                  new (class extends PrismaPhoneVerificationRepository {
                    override async lock(target: string) {
                      const [backend] = await t.$queryRaw<
                        { pid: number }[]
                      >`SELECT pg_backend_pid() AS pid`;
                      pid.resolve(backend!.pid);
                      return super.lock(target);
                    }
                  })(t),
              };
            },
          ),
        });
        const guessed = waiting.execute(verificationId, { code: "999999" });
        try {
          await waitForDatabaseLock(client, await pid.promise);
        } finally {
          release.resolve();
        }
        await held;
        expect(await guessed).toMatchObject({
          error: { context: { attemptsLeft: 0 } },
        });
        expect(await confirm(verificationId)).toMatchObject({
          error: { code: "VERIFICATION_EXPIRED" },
        });
        expect(
          (
            await client.phoneVerification.findUniqueOrThrow({
              where: { id: verificationId },
            })
          ).attempts,
        ).toBe(5);
        const second = await id();
        const successes = await Promise.all([
          confirm(second, code, holder),
          confirm(second, code, contender),
        ]);
        expect(successes.filter((x) => x.ok)).toHaveLength(1);
      }
    });
  });
});
