import { z } from "zod";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import { PhoneNumber } from "./phone-number";

export const GUEST_FIELD_LIMITS = Object.freeze({
  fullName: 120,
  email: 320,
  country: 2,
  specialRequests: 1000,
  blockReason: 500,
});
const noControls = (value: string) => !/[\p{Cc}\p{Cf}]/u.test(value);
const text = (max: number) =>
  z
    .string()
    .refine(noControls, "Control characters are not allowed.")
    .trim()
    .min(1, "Enter a value.")
    .max(max, `Use ${max} characters or fewer.`);
const optionalText = (max: number) =>
  z
    .string()
    .refine(noControls, "Control characters are not allowed.")
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === "" ? null : value));
const guestSchema = z
  .object({
    fullName: text(GUEST_FIELD_LIMITS.fullName),
    email: text(GUEST_FIELD_LIMITS.email)
      .pipe(z.email())
      .transform((value) => value.toLowerCase())
      .nullable()
      .default(null),
    phone: z.string().nullable().default(null),
    country: z
      .string()
      .regex(/^[a-zA-Z]{2}$/, "Use a two-letter country code.")
      .transform((value) => value.toUpperCase())
      .nullable()
      .default(null),
    specialRequests: optionalText(GUEST_FIELD_LIMITS.specialRequests),
  })
  .strict();
export type GuestContact = Readonly<{
  fullName: string;
  email: string | null;
  phone: PhoneNumber | null;
  country: string | null;
  specialRequests: string | null;
}>;

export function parseGuestContact(input: unknown): GuestContact {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainValidationError(
      "The guest details are invalid.",
      issuesFromZod(
        parsed.error.issues.map((issue) =>
          issue.code === "unrecognized_keys"
            ? { ...issue, message: "Remove unknown fields." }
            : issue,
        ),
      ),
    );
  return Object.freeze({
    ...parsed.data,
    phone:
      parsed.data.phone === null ? null : PhoneNumber.parse(parsed.data.phone),
  });
}
export function parseGuestBlockReason(input: unknown): string {
  const parsed = text(GUEST_FIELD_LIMITS.blockReason).safeParse(input);
  if (!parsed.success)
    throw new DomainValidationError(
      "The block reason is invalid.",
      issuesFromZod(parsed.error.issues),
    );
  return parsed.data;
}
