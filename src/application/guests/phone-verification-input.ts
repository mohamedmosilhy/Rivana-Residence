import { z } from "zod";
import { PhoneNumber, parseGuestEmail } from "@/domain/guests";
import type { VerificationChannel } from "@/domain/shared/types";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import { invalid, success, type Result } from "@/application/shared/result";

const requestInput = z
  .object({
    phone: z
      .string()
      .max(40)
      .regex(/^\+[1-9]\d{1,14}$/),
    purpose: z.enum(["BOOKING", "GUEST_SESSION"]),
    channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
    email: z.string().max(400).optional(),
    website: z.string().max(32_768).optional(),
  })
  .strict();
export function parseVerificationRequest(input: unknown) {
  const parsed = requestInput.safeParse(input);
  if (!parsed.success)
    return invalid(
      "Check the verification details.",
      issuesFromZod(parsed.error.issues),
    );
  if (parsed.data.website)
    return invalid("Check the verification details.", []);
  const channel: VerificationChannel = parsed.data.channel ?? "WHATSAPP";
  if (channel === "WHATSAPP" && parsed.data.email !== undefined)
    return invalid("Check the verification details.", [
      { path: "email", message: "Send an email only with the EMAIL channel." },
    ]);
  if (channel === "EMAIL" && parsed.data.email === undefined)
    return invalid("Check the verification details.", [
      { path: "email", message: "Enter the email address for the code." },
    ]);
  let email: string | null = null;
  if (channel === "EMAIL")
    try {
      email = parseGuestEmail(parsed.data.email);
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return invalid("Check the verification details.", [
        { path: "email", message: "Enter a valid email address." },
      ]);
    }
  try {
    return success({
      phone: PhoneNumber.parse(parsed.data.phone),
      purpose: parsed.data.purpose,
      channel,
      email,
    });
  } catch (error) {
    if (error instanceof DomainValidationError)
      return invalid(error.message, error.issues);
    throw error;
  }
}
export function parseVerificationConfirmation(
  id: unknown,
  input: unknown,
): Result<{ id: string; code: string }> {
  const parsed = z
    .object({
      id: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-zA-Z0-9_-]+$/),
      body: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
    })
    .safeParse({ id, body: input });
  if (!parsed.success)
    return invalid(
      "Check the verification details.",
      issuesFromZod(parsed.error.issues),
    );
  return success({ id: parsed.data.id, code: parsed.data.body.code });
}
