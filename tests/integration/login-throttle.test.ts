import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  SignIn,
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_MESSAGE,
} from "@/application/auth/sign-in";
import { LOGIN_THROTTLE_RULES } from "@/domain/auth/login-throttle";
import { BetterAuthCredentialAuthenticator } from "@/infrastructure/auth/credential-authenticator";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { PrismaLoginThrottleStore } from "@/infrastructure/db/prisma/repositories/login-throttle-store";

import {
  STAFF_PASSWORD,
  TEST_AUTH_SECRET,
  createTestAuth,
  provision,
} from "./support/auth";
import { createTestClient, resetDatabase } from "./support/database";

const client = createTestClient();
const { auth } = createTestAuth(client);
const store = new PrismaLoginThrottleStore(client);
let now = new Date("2026-10-01T09:00:00Z");
const signIn = new SignIn(
  new BetterAuthCredentialAuthenticator(auth, async () => new Headers()),
  store,
  new HmacThrottleKeys(TEST_AUTH_SECRET),
  { now: () => now },
);

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  now = new Date("2026-10-01T09:00:00Z");
  await provision(client, "editor@example.test");
});

const attempt = (
  email: string,
  password: string,
  clientAddress: string | null = null,
) => signIn.execute({ email, password, clientAddress });

describe("sign-in use case", () => {
  it("signs in with normalised email and clears prior failures", async () => {
    await attempt("editor@example.test", "wrong-password-value");
    expect(await client.loginThrottle.count()).toBe(1);

    expect(await attempt("  Editor@Example.TEST ", STAFF_PASSWORD)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await client.loginThrottle.count()).toBe(0);
  });

  it("returns the same generic error for unknown accounts and wrong passwords", async () => {
    const unknown = await attempt("nobody@example.test", STAFF_PASSWORD);
    const wrong = await attempt("editor@example.test", "wrong-password-value");
    const malformed = await attempt("", "");

    for (const result of [unknown, wrong, malformed]) {
      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: INVALID_CREDENTIALS_MESSAGE,
        },
      });
    }
  });

  it("locks an account after repeated failures, even for the right password", async () => {
    for (
      let index = 0;
      index < LOGIN_THROTTLE_RULES.account.maxFailures;
      index += 1
    ) {
      await attempt("editor@example.test", "wrong-password-value");
    }

    expect(await attempt("editor@example.test", STAFF_PASSWORD)).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE },
    });
    expect(await client.session.count()).toBe(0);

    now = new Date(now.getTime() + LOGIN_THROTTLE_RULES.account.lockMs);
    expect((await attempt("editor@example.test", STAFF_PASSWORD)).ok).toBe(
      true,
    );
  });

  it("locks unknown accounts too, so lockout does not reveal existence", async () => {
    for (
      let index = 0;
      index < LOGIN_THROTTLE_RULES.account.maxFailures;
      index += 1
    ) {
      await attempt("nobody@example.test", "wrong-password-value");
    }
    expect((await attempt("nobody@example.test", "x")).ok).toBe(false);
    expect(await attempt("nobody@example.test", "x")).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });

  it("limits password spraying from one client across accounts", async () => {
    for (
      let index = 0;
      index < LOGIN_THROTTLE_RULES.client.maxFailures;
      index += 1
    ) {
      await attempt(
        `user${index}@example.test`,
        "wrong-password-value",
        "203.0.113.9",
      );
    }

    expect(
      await attempt("editor@example.test", STAFF_PASSWORD, "203.0.113.9"),
    ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(
      (await attempt("editor@example.test", STAFF_PASSWORD, "198.51.100.4")).ok,
    ).toBe(true);
  });

  it("stores only keyed hashes, never raw emails or addresses", async () => {
    await attempt("editor@example.test", "wrong-password-value", "203.0.113.9");

    const keys = (await client.loginThrottle.findMany()).map((row) => row.key);
    expect(keys).toHaveLength(2);
    expect(keys.join(" ")).not.toMatch(/editor|example|203\.0/);
  });
});

describe("throttle store", () => {
  it("counts concurrent failures exactly", async () => {
    const rule = { maxFailures: 100, windowMs: 60_000, lockMs: 60_000 };

    await Promise.all(
      Array.from({ length: 12 }, () => store.recordFailure("k", rule, now)),
    );

    expect((await store.get("k"))?.failures).toBe(12);
  });
});
