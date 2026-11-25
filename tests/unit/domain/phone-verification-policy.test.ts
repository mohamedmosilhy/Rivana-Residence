import { describe, expect, it } from "vitest";
import {
  PhoneNumber,
  checkVerificationRequest,
  confirmVerificationCode,
  checkPhoneVerificationToken,
  verificationCodeExpiresAt,
  type VerificationCodeState,
  type PhoneVerificationToken,
} from "@/domain/guests";
import { DomainValidationError } from "@/domain/shared/domain-error";
const start = new Date("2026-11-15T00:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);
const phone = PhoneNumber.parse("+12025550101");
const code = (
  patch: Partial<VerificationCodeState> = {},
): VerificationCodeState => ({
  createdAt: start,
  expiresAt: at(600_000),
  attempts: 0,
  verifiedAt: null,
  consumedAt: null,
  ...patch,
});
const token = (
  patch: Partial<PhoneVerificationToken> = {},
): PhoneVerificationToken => ({
  purpose: "BOOKING",
  phone,
  channel: "WHATSAPP",
  email: null,
  verifiedAt: start,
  tokenExpiresAt: at(1_800_000),
  consumedAt: null,
  ...patch,
});

describe("GV-1/2/3 pure verification policy", () => {
  it("computes expiry from supplied time without changing it", () => {
    expect(verificationCodeExpiresAt(start)).toEqual(at(600_000));
    expect(start.getTime()).toBe(at(0).getTime());
  });
  it.each([0, 1, 2, 3, 4])(
    "accepts a correct code with %s prior attempts",
    (attempts) => {
      expect(
        confirmVerificationCode(code({ attempts }), true, at(599_999), false),
      ).toEqual({
        valid: true,
        attempts: attempts + 1,
        verifiedAt: at(599_999),
        tokenExpiresAt: at(2_399_999),
      });
    },
  );
  it("refuses at the expiry instant, even if a persisted expiry is accidentally too long", () => {
    for (const expiresAt of [at(600_000), at(1_200_000)])
      expect(
        confirmVerificationCode(code({ expiresAt }), true, at(600_000), false),
      ).toMatchObject({
        valid: false,
        code: "VERIFICATION_EXPIRED",
        attempts: 0,
      });
  });
  it("counts the fifth wrong code once, then refuses further guesses without increment", () => {
    const fifth = confirmVerificationCode(
      code({ attempts: 4 }),
      false,
      at(1),
      false,
    );
    expect(fifth).toEqual({
      valid: false,
      code: "VERIFICATION_CODE_INVALID",
      attempts: 5,
      attemptsLeft: 0,
    });
    expect(
      confirmVerificationCode(code({ attempts: 5 }), true, at(1), false),
    ).toEqual({ valid: false, code: "VERIFICATION_EXPIRED", attempts: 5 });
  });
  it("refuses already verified, consumed or blocked codes without changing the row", () => {
    for (const state of [
      code({ verifiedAt: at(1) }),
      code({ consumedAt: at(1) }),
    ])
      expect(confirmVerificationCode(state, true, at(2), false)).toMatchObject({
        valid: false,
        code: "VERIFICATION_EXPIRED",
      });
    const original = Object.freeze(code());
    expect(confirmVerificationCode(original, true, at(1), true)).toMatchObject({
      valid: false,
      code: "PHONE_BLOCKED",
      attempts: 0,
    });
    expect(original.attempts).toBe(0);
  });
  it.each([-1, 6, 0.5, Number.NaN])(
    "rejects corrupt attempt count %s",
    (attempts) => {
      expect(() =>
        confirmVerificationCode(code({ attempts }), true, at(1), false),
      ).toThrow(DomainValidationError);
    },
  );
  it("rejects invalid time, reversed windows and future creation rather than accepting a code", () => {
    expect(() => verificationCodeExpiresAt(new Date("bad"))).toThrow(
      DomainValidationError,
    );
    expect(() => verificationCodeExpiresAt(new Date(8.64e15))).toThrow(
      DomainValidationError,
    );
    expect(() =>
      confirmVerificationCode(code({ expiresAt: start }), true, at(1), false),
    ).toThrow(DomainValidationError);
    expect(() => confirmVerificationCode(code(), true, at(-1), false)).toThrow(
      DomainValidationError,
    );
  });
  it("applies the rolling 15-minute window with an exclusive lower boundary", () => {
    const requests = [at(0), at(1), at(2)];
    expect(checkVerificationRequest(requests, at(899_999), false)).toEqual({
      allowed: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 1,
    });
    expect(checkVerificationRequest(requests, at(900_000), false)).toEqual({
      allowed: true,
    });
    expect(checkVerificationRequest([], at(1), true)).toEqual({
      allowed: false,
      code: "PHONE_BLOCKED",
    });
  });
  it("Q-80 counts 24 hours across midnight and waits until enough requests expire", () => {
    const requests = Array.from({ length: 10 }, (_, index) =>
      at(index * 1_000_000),
    );
    expect(checkVerificationRequest(requests, at(86_399_999), false)).toEqual({
      allowed: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 1,
    });
    expect(checkVerificationRequest(requests, at(86_400_000), false)).toEqual({
      allowed: true,
    });
    expect(
      checkVerificationRequest(
        [at(0), at(1), at(2), at(3)],
        at(899_999),
        false,
      ),
    ).toEqual({ allowed: false, code: "RATE_LIMITED", retryAfterSeconds: 1 });
    expect(
      checkVerificationRequest([at(0), at(1), at(2), at(3)], at(900_000), false)
        .allowed,
    ).toBe(false);
  });
  it("does not mutate history and rejects future or invalid request instants", () => {
    const requests = Object.freeze([at(2), at(1), at(0)]);
    const original = requests.map((date) => date.getTime());
    checkVerificationRequest(requests, at(3), false);
    expect(requests.map((date) => date.getTime())).toEqual(original);
    for (const date of [at(4), new Date("bad")])
      expect(() => checkVerificationRequest([date], at(3), false)).toThrow(
        DomainValidationError,
      );
  });
  it("requires matching phone, purpose, proof, unused state and strictly future token expiry", () => {
    expect(
      checkPhoneVerificationToken(
        token(),
        "BOOKING",
        phone,
        at(1_799_999),
        false,
      ),
    ).toEqual({ valid: true, channel: "WHATSAPP" });
    for (const row of [
      null,
      token({ verifiedAt: null }),
      token({ verifiedAt: at(5) }),
      token({ tokenExpiresAt: null }),
      token({ consumedAt: at(1) }),
      token({ phone: PhoneNumber.parse("+12025550102") }),
      token({ purpose: "GUEST_SESSION" }),
    ])
      expect(
        checkPhoneVerificationToken(row, "BOOKING", phone, at(2), false),
      ).toEqual({ valid: false, code: "PHONE_NOT_VERIFIED" });
    expect(
      checkPhoneVerificationToken(
        token(),
        "BOOKING",
        phone,
        at(1_800_000),
        false,
      ),
    ).toEqual({ valid: false, code: "PHONE_NOT_VERIFIED" });
    expect(
      checkPhoneVerificationToken(
        token({ tokenExpiresAt: at(3_600_000) }),
        "BOOKING",
        phone,
        at(1_800_000),
        false,
      ).valid,
    ).toBe(false);
  });
  it("supports guest sessions and invalidates blocked sessions without consuming anything", () => {
    const row = Object.freeze(token({ purpose: "GUEST_SESSION" }));
    expect(
      checkPhoneVerificationToken(row, "GUEST_SESSION", phone, at(1), false),
    ).toEqual({ valid: true, channel: "WHATSAPP" });
    expect(
      checkPhoneVerificationToken(row, "GUEST_SESSION", phone, at(1), true),
    ).toEqual({ valid: false, code: "PHONE_BLOCKED" });
    expect(row.consumedAt).toBeNull();
  });
  // T-VCH-3: an email token proves only its email (ADR 031).
  it("accepts an email token only for the email it proved", () => {
    const email = "guest@example.test";
    const row = token({ channel: "EMAIL", email });
    expect(
      checkPhoneVerificationToken(row, "BOOKING", phone, at(1), false, email),
    ).toEqual({ valid: true, channel: "EMAIL" });
    for (const expected of [
      undefined,
      null,
      "other@example.test",
      "Guest@example.test",
    ])
      expect(
        checkPhoneVerificationToken(
          row,
          "BOOKING",
          phone,
          at(1),
          false,
          expected,
        ),
      ).toEqual({ valid: false, code: "PHONE_NOT_VERIFIED" });
    // A phone session passes no email, so an email session token is refused.
    expect(
      checkPhoneVerificationToken(
        token({ purpose: "GUEST_SESSION", channel: "EMAIL", email }),
        "GUEST_SESSION",
        phone,
        at(1),
        false,
      ),
    ).toEqual({ valid: false, code: "PHONE_NOT_VERIFIED" });
    // A blocked phone is refused before the channel is considered.
    expect(
      checkPhoneVerificationToken(row, "BOOKING", phone, at(1), true, email),
    ).toEqual({ valid: false, code: "PHONE_BLOCKED" });
    // A WhatsApp token ignores the expected email.
    expect(
      checkPhoneVerificationToken(
        token(),
        "BOOKING",
        phone,
        at(1),
        false,
        email,
      ),
    ).toEqual({ valid: true, channel: "WHATSAPP" });
    for (const broken of [
      token({ channel: "EMAIL", email: null }),
      token({ channel: "WHATSAPP", email }),
      token({ channel: "SMS" as never }),
    ])
      expect(() =>
        checkPhoneVerificationToken(
          broken,
          "BOOKING",
          phone,
          at(1),
          false,
          email,
        ),
      ).toThrow(DomainValidationError);
  });
});
