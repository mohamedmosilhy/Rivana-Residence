import { describe, expect, it } from "vitest";

import {
  bookingFingerprintSource,
  parseWebsiteBooking,
} from "@/application/reservations/create-website-reservation-input";

const body = (overrides: Record<string, unknown> = {}) => ({
  branchSlug: "new-cairo",
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
  lines: [
    { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
    { roomSlug: "nile", occupancy: { adults: 1, children: 1 } },
  ],
  services: [{ kind: "BREAKFAST" }],
  guest: {
    fullName: "Amina Hassan",
    email: "amina@example.test",
    phone: "+12025551001",
  },
  phoneVerificationToken: "token-0123456789abcdef",
  paymentMethod: "PAY_AT_HOTEL",
  expectedTotal: { amountMinor: 1000, currency: "USD" },
  consent: { privacyNoticeVersion: "privacy-placeholder-v1" },
  ...overrides,
});
const key = "idempotency-key-1";
const parse = (input: unknown, idempotencyKey: unknown = key) =>
  parseWebsiteBooking(input, idempotencyKey);
const issues = (result: ReturnType<typeof parse>) =>
  result.ok ? {} : (result.error.fieldErrors ?? {});

describe("parseWebsiteBooking", () => {
  it("accepts a complete booking and keeps the verified phone for quoting", () => {
    const result = parse(body());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quoteBody.phone).toBe("+12025551001");
    expect(result.value.expectedTotalMinor).toBe(1000);
  });

  it.each([
    ["a client price", { totalMinor: 1 }, "_root"],
    ["a status", { status: "CONFIRMED" }, "_root"],
    ["an unknown payment method", { paymentMethod: "CASH" }, "paymentMethod"],
    [
      "a missing phone",
      { guest: { fullName: "A", email: "a@example.test" } },
      "guest.phone",
    ],
    [
      "a missing email",
      { guest: { fullName: "A", phone: "+12025551001" } },
      "guest.email",
    ],
    [
      "a stale privacy version",
      { consent: { privacyNoticeVersion: "x" } },
      "consent.privacyNoticeVersion",
    ],
    [
      "a stale marketing version",
      { marketingOptIn: { consentVersion: "x" } },
      "consent.marketingConsentVersion",
    ],
    ["no units", { lines: [] }, "lines"],
  ])("refuses %s", (_label, overrides, path) => {
    const result = parse(body(overrides));
    expect(result.ok).toBe(false);
    expect(Object.keys(issues(result)).join(" ")).toContain(path);
  });

  it("passes the online method through to the booking use case (AC-14)", () => {
    const result = parse(body({ paymentMethod: "ONLINE" }));
    expect(result).toMatchObject({
      ok: true,
      value: { paymentMethod: "ONLINE" },
    });
  });

  it("refuses an invalid ONLINE body as validation, not as payment", () => {
    const result = parse(body({ paymentMethod: "ONLINE", lines: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("refuses a filled honeypot generically and accepts an empty one", () => {
    const filled = parse(body({ website: "http://spam.test" }));
    expect(filled.ok).toBe(false);
    if (!filled.ok) {
      expect(filled.error.code).toBe("VALIDATION");
      expect(filled.error.fieldErrors ?? {}).toEqual({});
    }
    expect(parse(body({ website: "" })).ok).toBe(true);
  });

  it("refuses a missing or odd idempotency key", () => {
    for (const bad of [
      undefined,
      "",
      "short",
      "has space in it key",
      "x".repeat(129),
    ])
      expect(Object.keys(issues(parseWebsiteBooking(body(), bad)))).toContain(
        "idempotencyKey",
      );
  });
});

describe("bookingFingerprintSource", () => {
  const fingerprint = (input: unknown, token = "hash-a") => {
    const parsed = parse(input);
    if (!parsed.ok) throw new Error("fixture invalid");
    return bookingFingerprintSource(parsed.value, token);
  };

  it("ignores key order and the order of units and services", () => {
    const reordered = body({
      lines: [...body().lines].reverse(),
      services: [{ kind: "BREAKFAST" }],
      couponCode: undefined,
    });
    expect(fingerprint(reordered)).toBe(fingerprint(body()));
  });

  it("normalizes the coupon code", () => {
    expect(fingerprint(body({ couponCode: " welcome " }))).toBe(
      fingerprint(body({ couponCode: "WELCOME" })),
    );
  });

  it("changes with the stay, the guest, the total, the phone token and the coupon", () => {
    const base = fingerprint(body());
    expect(
      fingerprint(
        body({ stay: { checkIn: "2031-04-10", checkOut: "2031-04-12" } }),
      ),
    ).not.toBe(base);
    expect(
      fingerprint(
        body({ expectedTotal: { amountMinor: 1001, currency: "USD" } }),
      ),
    ).not.toBe(base);
    expect(fingerprint(body({ couponCode: "WELCOME" }))).not.toBe(base);
    expect(fingerprint(body(), "hash-b")).not.toBe(base);
  });
});
