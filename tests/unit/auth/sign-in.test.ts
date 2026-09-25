import { describe, expect, it, vi } from "vitest";

import type { LoginThrottleStore } from "@/application/auth/ports";
import { SignIn } from "@/application/auth/sign-in";

function setup(authenticates: boolean, lockedUntil: Date | null = null) {
  const authenticator = { signIn: vi.fn().mockResolvedValue(authenticates) };
  const throttle: LoginThrottleStore = {
    get: vi
      .fn()
      .mockResolvedValue(
        lockedUntil
          ? { failures: 5, windowStartedAt: new Date(0), lockedUntil }
          : null,
      ),
    recordFailure: vi.fn().mockResolvedValue({
      failures: 1,
      windowStartedAt: new Date(0),
      lockedUntil: null,
    }),
    clear: vi.fn().mockResolvedValue(undefined),
  };
  const keys = {
    account: (email: string) => `account:${email}`,
    client: (address: string) => `client:${address}`,
  };
  const now = new Date("2026-10-01T09:00:00Z");
  const useCase = new SignIn(authenticator, throttle, keys, { now: () => now });
  return { useCase, authenticator, throttle, now };
}

describe("SignIn", () => {
  it("normalises the email before authenticating", async () => {
    const { useCase, authenticator, throttle } = setup(true);

    await useCase.execute({
      email: " Editor@Example.test ",
      password: "secret-password",
      clientAddress: null,
    });

    expect(authenticator.signIn).toHaveBeenCalledWith(
      "editor@example.test",
      "secret-password",
    );
    expect(throttle.clear).toHaveBeenCalledWith("account:editor@example.test");
  });

  it.each([
    [{ email: null, password: "x" }],
    [{ email: "a@example.test", password: 42 }],
    [{ email: "a@example.test", password: "x".repeat(129) }],
  ])(
    "rejects malformed input without calling the provider: %j",
    async (input) => {
      const { useCase, authenticator } = setup(true);

      expect(
        await useCase.execute({ ...input, clientAddress: null }),
      ).toMatchObject({ ok: false, error: { code: "INVALID_CREDENTIALS" } });
      expect(authenticator.signIn).not.toHaveBeenCalled();
    },
  );

  it("refuses locked keys before checking the password", async () => {
    const { useCase, authenticator } = setup(
      true,
      new Date(Date.UTC(2026, 9, 1, 10)),
    );

    const result = await useCase.execute({
      email: "a@example.test",
      password: "secret-password",
      clientAddress: "203.0.113.9",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(authenticator.signIn).not.toHaveBeenCalled();
  });

  it("records a failure on every bucket for bad credentials", async () => {
    const { useCase, throttle } = setup(false);

    await useCase.execute({
      email: "a@example.test",
      password: "wrong",
      clientAddress: "203.0.113.9",
    });

    expect(throttle.recordFailure).toHaveBeenCalledTimes(2);
    expect(throttle.clear).not.toHaveBeenCalled();
  });
});
