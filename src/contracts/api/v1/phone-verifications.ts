import { z } from "zod";

export const PhoneVerificationRequest = z
  .object({
    phone: z
      .string()
      .max(16)
      .regex(/^\+[1-9]\d{1,14}$/)
      .describe("Valid international E.164 phone."),
    purpose: z.enum(["BOOKING", "GUEST_SESSION"]),
    channel: z
      .enum(["WHATSAPP", "EMAIL"])
      .optional()
      .describe(
        "How to send the code. Defaults to WHATSAPP. EMAIL proves the email only; the phone stays unverified (ADR 031). EMAIL with GUEST_SESSION is refused until M9-T12b.",
      ),
    email: z
      .string()
      .max(400)
      .optional()
      .describe(
        "Required with channel EMAIL and refused otherwise. Normalized to lowercase.",
      ),
    website: z
      .string()
      .max(32_768)
      .optional()
      .describe("Honeypot. Leave empty."),
  })
  .strict();
export const PhoneVerificationConfirmation = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const PhoneVerificationRequested = z.object({
  verificationId: z.string().min(1).max(32),
  expiresAt: z.iso.datetime(),
  resendAvailableAt: z.iso.datetime(),
});
export const PhoneVerificationConfirmed = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
});
