import { z } from "zod";
import { PhoneNumber } from "@/domain/guests";
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
  try {
    return success({
      phone: PhoneNumber.parse(parsed.data.phone),
      purpose: parsed.data.purpose,
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
