import { describe, expect, it } from "vitest";

import {
  LOGIN_THROTTLE_RULES,
  recordFailure,
  retryAfterMs,
} from "@/domain/auth/login-throttle";
import { passwordPolicyIssues } from "@/domain/auth/password-policy";

describe("password policy", () => {
  it("accepts a long, uncommon passphrase", () => {
    expect(passwordPolicyIssues("Nile-evening-lantern-42")).toEqual([]);
  });

  it.each([
    ["too short", "short-pass1", /at least 12/],
    ["too long", "x".repeat(129) + "Y1", /at most 128/],
    ["one repeated character", "aaaaaaaaaaaaaa", /single character/],
    ["a common password", "Password1234", /less common/],
    ["the site name", "rivanaresidence!", /less common/],
  ])("rejects %s", (_label, password, message) => {
    expect(passwordPolicyIssues(password).join(" ")).toMatch(message);
  });

  it("rejects passwords containing the user's name or email", () => {
    expect(
      passwordPolicyIssues("amira-loves-the-nile", {
        email: "amira@example.test",
      }),
    ).toContain("Do not include your name or email address.");
    expect(
      passwordPolicyIssues("Hassan-river-view-2026", { name: "Omar Hassan" }),
    ).toContain("Do not include your name or email address.");
  });
});

describe("login throttle policy", () => {
  const rule = LOGIN_THROTTLE_RULES.account;
  const start = new Date("2026-10-01T09:00:00Z");
  const later = (ms: number) => new Date(start.getTime() + ms);

  it("locks after the maximum failures inside the window", () => {
    let state = null as ReturnType<typeof recordFailure> | null;
    for (let index = 0; index < rule.maxFailures - 1; index += 1) {
      state = recordFailure(state, rule, later(index * 1000));
    }
    expect(retryAfterMs(state, later(10_000))).toBe(0);

    state = recordFailure(state, rule, later(10_000));
    expect(state.failures).toBe(rule.maxFailures);
    expect(retryAfterMs(state, later(10_000))).toBe(rule.lockMs);
    expect(retryAfterMs(state, later(10_000 + rule.lockMs))).toBe(0);
  });

  it("starts a new window once the old one expires", () => {
    const first = recordFailure(null, rule, start);
    const second = recordFailure(first, rule, later(rule.windowMs));

    expect(second).toEqual({
      failures: 1,
      windowStartedAt: later(rule.windowMs),
      lockedUntil: null,
    });
  });

  it("uses a higher limit for client addresses than for accounts", () => {
    expect(LOGIN_THROTTLE_RULES.client.maxFailures).toBeGreaterThan(
      LOGIN_THROTTLE_RULES.account.maxFailures,
    );
  });
});
