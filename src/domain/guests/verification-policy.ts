import {
  VERIFICATION_CHANNELS,
  VERIFICATION_PURPOSES,
  type VerificationChannel,
  type VerificationPurpose,
} from "@/domain/shared/types";
import type { PhoneNumber } from "./phone-number";
import { instant, count, policyInputError } from "./policy-values";

export const VERIFICATION_POLICY = Object.freeze({
  codeLifetimeMs: 600_000,
  maxAttempts: 5,
  tokenLifetimeMs: 1_800_000,
  shortWindowMs: 900_000,
  shortWindowLimit: 3,
  dailyWindowMs: 86_400_000,
  dailyWindowLimit: 10,
});
export type VerificationCodeState = Readonly<{
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  verifiedAt: Date | null;
  consumedAt: Date | null;
}>;
export type PhoneVerificationToken = Readonly<{
  purpose: VerificationPurpose;
  phone: PhoneNumber;
  /** WHATSAPP proves the phone. EMAIL proves only `email`; the phone is claimed (ADR 031). */
  channel: VerificationChannel;
  /** Normalized; present exactly when the channel is EMAIL. */
  email: string | null;
  verifiedAt: Date | null;
  tokenExpiresAt: Date | null;
  consumedAt: Date | null;
}>;

function expiresAfter(now: Date, lifetime: number): Date {
  const result = new Date(instant(now) + lifetime);
  instant(result, "expiresAt");
  return result;
}
export function verificationCodeExpiresAt(now: Date): Date {
  return expiresAfter(now, VERIFICATION_POLICY.codeLifetimeMs);
}

/** The caller loads the complete rolling request history from PostgreSQL; there is no in-memory limiter. */
export function checkVerificationRequest(
  requests: readonly Date[],
  now: Date,
  blocked: boolean,
):
  | Readonly<{ allowed: true }>
  | Readonly<{
      allowed: false;
      code: "PHONE_BLOCKED" | "RATE_LIMITED";
      retryAfterSeconds?: number;
    }> {
  const timestamp = instant(now);
  if (typeof blocked !== "boolean") policyInputError("blocked");
  const history = requests
    .map((value) => instant(value, "requests"))
    .sort((a, b) => a - b);
  if (history.some((value) => value > timestamp)) policyInputError("requests");
  if (blocked) return { allowed: false, code: "PHONE_BLOCKED" };
  let wait = 0;
  for (const [window, limit] of [
    [VERIFICATION_POLICY.shortWindowMs, VERIFICATION_POLICY.shortWindowLimit],
    [VERIFICATION_POLICY.dailyWindowMs, VERIFICATION_POLICY.dailyWindowLimit],
  ] as const) {
    const recent = history.filter((value) => value > timestamp - window);
    if (recent.length >= limit)
      wait = Math.max(
        wait,
        recent[recent.length - limit]! + window - timestamp,
      );
  }
  return wait > 0
    ? {
        allowed: false,
        code: "RATE_LIMITED",
        retryAfterSeconds: Math.ceil(wait / 1000),
      }
    : { allowed: true };
}

/** codeMatches is a trusted result of the application's constant-time keyed-hash comparison. */
export function confirmVerificationCode(
  state: VerificationCodeState,
  codeMatches: boolean,
  now: Date,
  blocked: boolean,
):
  | Readonly<{
      valid: true;
      attempts: number;
      verifiedAt: Date;
      tokenExpiresAt: Date;
    }>
  | Readonly<{
      valid: false;
      code: "PHONE_BLOCKED" | "VERIFICATION_EXPIRED";
      attempts: number;
    }>
  | Readonly<{
      valid: false;
      code: "VERIFICATION_CODE_INVALID";
      attempts: number;
      attemptsLeft: number;
    }> {
  const timestamp = instant(now),
    created = instant(state.createdAt, "createdAt"),
    expires = instant(state.expiresAt, "expiresAt");
  count(state.attempts, "attempts");
  if (
    state.attempts > VERIFICATION_POLICY.maxAttempts ||
    expires <= created ||
    created > timestamp ||
    typeof codeMatches !== "boolean" ||
    typeof blocked !== "boolean"
  )
    policyInputError("verification");
  if (state.verifiedAt !== null) instant(state.verifiedAt, "verifiedAt");
  if (state.consumedAt !== null) instant(state.consumedAt, "consumedAt");
  if (blocked)
    return { valid: false, code: "PHONE_BLOCKED", attempts: state.attempts };
  if (
    timestamp >=
      Math.min(expires, created + VERIFICATION_POLICY.codeLifetimeMs) ||
    state.attempts >= VERIFICATION_POLICY.maxAttempts ||
    state.verifiedAt !== null ||
    state.consumedAt !== null
  )
    return {
      valid: false,
      code: "VERIFICATION_EXPIRED",
      attempts: state.attempts,
    };
  const attempts = state.attempts + 1;
  return codeMatches
    ? {
        valid: true,
        attempts,
        verifiedAt: new Date(timestamp),
        tokenExpiresAt: expiresAfter(now, VERIFICATION_POLICY.tokenLifetimeMs),
      }
    : {
        valid: false,
        code: "VERIFICATION_CODE_INVALID",
        attempts,
        attemptsLeft: VERIFICATION_POLICY.maxAttempts - attempts,
      };
}

/**
 * A record is supplied only after hashed-token lookup. This function does not authenticate a bearer string.
 *
 * An email token is accepted only when the caller names the normalized email it
 * must prove (`expectedEmail`). A caller that passes none, such as a phone
 * session, refuses every email token: the phone in it was never proven.
 */
export function checkPhoneVerificationToken(
  token: PhoneVerificationToken | null,
  expectedPurpose: VerificationPurpose,
  expectedPhone: PhoneNumber,
  now: Date,
  blocked: boolean,
  expectedEmail?: string | null,
):
  | Readonly<{ valid: true; channel: VerificationChannel }>
  | Readonly<{ valid: false; code: "PHONE_BLOCKED" | "PHONE_NOT_VERIFIED" }> {
  const timestamp = instant(now);
  if (
    !VERIFICATION_PURPOSES.includes(expectedPurpose) ||
    typeof blocked !== "boolean"
  )
    policyInputError("token");
  if (blocked) return { valid: false, code: "PHONE_BLOCKED" };
  if (!token) return { valid: false, code: "PHONE_NOT_VERIFIED" };
  if (!VERIFICATION_PURPOSES.includes(token.purpose))
    policyInputError("purpose");
  if (
    !VERIFICATION_CHANNELS.includes(token.channel) ||
    (token.channel === "EMAIL") !== (typeof token.email === "string")
  )
    policyInputError("channel");
  if (token.verifiedAt !== null) instant(token.verifiedAt, "verifiedAt");
  if (token.tokenExpiresAt !== null)
    instant(token.tokenExpiresAt, "tokenExpiresAt");
  if (token.consumedAt !== null) instant(token.consumedAt, "consumedAt");
  if (
    token.purpose !== expectedPurpose ||
    !token.phone.equals(expectedPhone) ||
    token.verifiedAt === null ||
    token.verifiedAt.getTime() > timestamp ||
    token.tokenExpiresAt === null ||
    Math.min(
      token.tokenExpiresAt.getTime(),
      token.verifiedAt.getTime() + VERIFICATION_POLICY.tokenLifetimeMs,
    ) <= timestamp ||
    token.consumedAt !== null
  )
    return { valid: false, code: "PHONE_NOT_VERIFIED" };
  if (
    token.channel === "EMAIL" &&
    (typeof expectedEmail !== "string" || token.email !== expectedEmail)
  )
    return { valid: false, code: "PHONE_NOT_VERIFIED" };
  return { valid: true, channel: token.channel };
}
