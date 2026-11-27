import type { ApiProblem } from "@/presentation/api-client/result";

// The verification the journey holds. It lives in component state only: no
// code, verification id, or token is ever written to storage or an address.

export type VerificationChannel = "WHATSAPP" | "EMAIL";

/** The contact a code was sent for. */
type Bound = Readonly<{
  channel: VerificationChannel;
  phone: string;
  /** Present for the email channel. */
  email: string | null;
}>;

export type Verification = Readonly<{
  sent:
    | (Bound &
        Readonly<{
          verificationId: string;
          /** Both are on this device's clock. */
          expiresAtMs: number;
          resendAtMs: number;
        }>)
    | null;
  verified: (Bound & Readonly<{ token: string; expiresAtMs: number }>) | null;
}>;

export const noVerification: Verification = Object.freeze({
  sent: null,
  verified: null,
});

/** Lifetimes from the server's verification policy. */
export type VerificationLifetimes = Readonly<{
  codeLifetimeMs: number;
  tokenLifetimeMs: number;
}>;

/**
 * Drops whatever no longer matches the contact details: any change of phone,
 * and a change of email for an email code (P7 requires both to match).
 */
export function verificationFor(
  { sent, verified }: Verification,
  phone: string,
  email: string,
): Verification {
  const matches = (bound: Bound) =>
    bound.phone === phone &&
    (bound.email === null || bound.email === email.toLowerCase());
  return {
    sent: sent && matches(sent) ? sent : null,
    verified: verified && matches(verified) ? verified : null,
  };
}

/**
 * The server issued its times at `expiresAt` less the code lifetime, so the
 * waits do not depend on the device clock being right. Expiry counts from when
 * the code was asked for (never later than the server's), the resend wait from
 * when the answer arrived (never earlier).
 */
export function codeDeadlines(
  response: Readonly<{ expiresAt: string; resendAvailableAt: string }>,
  { codeLifetimeMs }: VerificationLifetimes,
  askedAtMs: number,
  receivedAtMs: number = Date.now(),
) {
  const issuedAt = Date.parse(response.expiresAt) - codeLifetimeMs;
  const resendIn = Date.parse(response.resendAvailableAt) - issuedAt;
  return {
    expiresAtMs: askedAtMs + codeLifetimeMs,
    resendAtMs: receivedAtMs + (resendIn > 0 ? resendIn : 0),
  };
}

export function waitText(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 120)
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 120) return `${minutes} minutes`;
  return `${Math.ceil(minutes / 60)} hours`;
}

export const channelName: Record<VerificationChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "email",
};

/** Plain words for a refused or unanswered request to send a code. */
export function sendProblemMessage(
  problem: ApiProblem,
  channel: VerificationChannel,
) {
  switch (problem.code) {
    case "RATE_LIMITED":
      return `Too many codes were requested. Try again in ${waitText((problem.retryAfter ?? 60) * 1000)}.`;
    case "WHATSAPP_NOT_CONFIGURED":
    case "EMAIL_NOT_CONFIGURED":
      return `Codes by ${channelName[channel]} are not available right now.`;
    case "VERIFICATION_UNAVAILABLE":
      return `We couldn’t send the code by ${channelName[channel]}. Try again shortly.`;
    case "TRY_AGAIN":
      return "Verification is busy. Try again in a moment.";
    case "NETWORK":
    case "UNEXPECTED_RESPONSE":
      return "We couldn’t confirm that the code was sent. Check your connection, then send a new code.";
    default:
      return "We couldn’t send the code. Try again, or contact the hotel.";
  }
}

/** Plain words for a code that could not be checked. */
export function checkProblemMessage(problem: ApiProblem) {
  switch (problem.code) {
    case "VALIDATION":
      return "Enter the 6 digit code.";
    case "RATE_LIMITED":
      return `Too many attempts. Try again in ${waitText((problem.retryAfter ?? 60) * 1000)}.`;
    case "TRY_AGAIN":
      return "Verification is busy. Try again in a moment.";
    case "NETWORK":
    case "UNEXPECTED_RESPONSE":
      return "We couldn’t check the code. Check your connection and try again.";
    default:
      return "We couldn’t check the code. Try again, or contact the hotel.";
  }
}
