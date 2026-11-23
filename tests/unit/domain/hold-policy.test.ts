import { describe, expect, it } from "vitest";
import { HoldPolicy, paymentMethodAvailability } from "@/domain/payments";
import { DomainValidationError } from "@/domain/shared/domain-error";

const at = (value: string) => new Date(value);

describe("T-PAY-3: hold expiry (PY-2, PY-6)", () => {
  const created = at("2026-11-10T09:00:00.000Z");
  const expires = HoldPolicy.holdExpiresAt(created);
  it("holds for 15 minutes and ends the gateway session 2 minutes earlier", () => {
    expect(expires.toISOString()).toBe("2026-11-10T09:15:00.000Z");
    expect(HoldPolicy.sessionExpiresAt(expires).toISOString()).toBe(
      "2026-11-10T09:13:00.000Z",
    );
  });
  it("expires at the expiry instant, not before", () => {
    expect(HoldPolicy.isExpired(expires, at("2026-11-10T09:14:59.999Z"))).toBe(
      false,
    );
    expect(HoldPolicy.isExpired(expires, expires)).toBe(true);
    expect(HoldPolicy.isExpired(expires, at("2026-11-10T09:15:00.001Z"))).toBe(
      true,
    );
  });
  it("allows one open hold per phone (Q-60)", () => {
    expect(HoldPolicy.canOpenHold(0)).toBe(true);
    expect(HoldPolicy.canOpenHold(1)).toBe(false);
    expect(HoldPolicy.canOpenHold(2)).toBe(false);
  });
  it.each([-1, 1.5, Number.NaN])("rejects the hold count %s", (count) => {
    expect(() => HoldPolicy.canOpenHold(count)).toThrow(DomainValidationError);
  });
  it("rejects an invalid instant", () => {
    expect(() => HoldPolicy.holdExpiresAt(new Date("nope"))).toThrow(
      DomainValidationError,
    );
    expect(() => HoldPolicy.isExpired(expires, new Date("nope"))).toThrow(
      DomainValidationError,
    );
  });
});

describe("T-PAY-4: online availability (CP-6)", () => {
  const ready = {
    gatewayReady: true,
    branchOnlinePaymentEnabled: true,
    totalMinor: 5_000,
  };
  it("always offers pay at the hotel, even for a zero total or a dead gateway", () => {
    expect(
      paymentMethodAvailability({
        method: "PAY_AT_HOTEL",
        gatewayReady: false,
        branchOnlinePaymentEnabled: false,
        totalMinor: 0,
      }),
    ).toEqual({ available: true });
  });
  it("offers online only when all three conditions hold", () => {
    expect(paymentMethodAvailability({ method: "ONLINE", ...ready })).toEqual({
      available: true,
    });
    expect(
      paymentMethodAvailability({
        method: "ONLINE",
        ...ready,
        gatewayReady: false,
      }),
    ).toEqual({ available: false, reason: "GATEWAY_NOT_READY" });
    expect(
      paymentMethodAvailability({
        method: "ONLINE",
        ...ready,
        branchOnlinePaymentEnabled: false,
      }),
    ).toEqual({ available: false, reason: "BRANCH_ONLINE_DISABLED" });
  });
  it("refuses online for a zero total", () => {
    expect(
      paymentMethodAvailability({ method: "ONLINE", ...ready, totalMinor: 0 }),
    ).toEqual({ available: false, reason: "ZERO_TOTAL" });
  });
  it("rejects an unknown payment method", () => {
    expect(() =>
      paymentMethodAvailability({ method: "CASH" as never, ...ready }),
    ).toThrow(DomainValidationError);
  });
  it.each([-1, 1.5, Number.NaN])("rejects the total %s", (totalMinor) => {
    expect(() =>
      paymentMethodAvailability({ method: "ONLINE", ...ready, totalMinor }),
    ).toThrow(DomainValidationError);
  });
});
