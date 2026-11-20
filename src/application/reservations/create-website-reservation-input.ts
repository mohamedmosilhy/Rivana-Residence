import { z } from "zod";

import { failure, invalid, type Result } from "@/application/shared/result";
import { normalizeCouponCode } from "@/domain/coupons";
import {
  parseGuestContact,
  validateGuestConsent,
  type GuestContact,
  type GuestConsent,
} from "@/domain/guests";
import { parseQuoteRequest, type QuoteRequest } from "@/domain/pricing";
import {
  DomainValidationError,
  issuesFromZod,
  type DomainIssue,
} from "@/domain/shared/domain-error";

const IDEMPOTENCY_KEY = /^[\x21-\x7E]{8,128}$/;

// Strict on purpose: a client can never send a price, a discount or a status.
// The stay, units, services and coupon are validated by `parseQuoteRequest`,
// the same parser P6 uses, so a booking is priced exactly as it was quoted.
const bodySchema = z.strictObject({
  branchSlug: z.unknown(),
  stay: z.unknown(),
  lines: z.unknown(),
  services: z.unknown(),
  couponCode: z.unknown().optional(),
  guest: z.unknown(),
  phoneVerificationToken: z
    .string()
    .min(16, "Send the verification token.")
    .max(128, "Send the verification token."),
  // PAYMOB is a documented value that M8 refuses with 409 (Q-74), after the
  // body is otherwise valid.
  paymentMethod: z.enum(["PAY_AT_HOTEL", "PAYMOB"], "Choose pay at hotel."),
  /** Honeypot (Q-74): a filled value is refused generically, nothing written. */
  website: z.string().max(32_768).optional(),
  expectedTotal: z.strictObject({
    amountMinor: z.number().int().min(0),
    currency: z.literal("USD"),
  }),
  consent: z.strictObject({ privacyNoticeVersion: z.unknown() }),
  marketingOptIn: z.strictObject({ consentVersion: z.unknown() }).optional(),
});

export type WebsiteBookingInput = Readonly<{
  quote: QuoteRequest;
  /** The raw quote fields, handed to `QuoteBooking` with the verified phone. */
  quoteBody: Readonly<Record<string, unknown>>;
  contact: GuestContact;
  token: string;
  expectedTotalMinor: number;
  consent: GuestConsent;
  idempotencyKey: string;
}>;

const prefix = (path: string, issues: readonly DomainIssue[]) =>
  issues.map((issue) => ({
    ...issue,
    path: issue.path ? `${path}.${issue.path}` : path,
  }));

export function parseWebsiteBooking(
  input: unknown,
  idempotencyKey: unknown,
): Result<WebsiteBookingInput> {
  const issues: DomainIssue[] = [];
  if (
    typeof idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(idempotencyKey)
  )
    issues.push({
      path: "idempotencyKey",
      message: "Send a key of 8 to 128 printable characters.",
    });
  const body = bodySchema.safeParse(input);
  if (!body.success) {
    issues.push(
      ...issuesFromZod(body.error.issues).map((issue) =>
        issue.path === "" ? { ...issue, path: "_root" } : issue,
      ),
    );
    return invalid("Check the booking details.", issues);
  }
  if (body.data.website) return invalid("Check the booking details.", []);
  const { guest: guestInput, ...data } = body.data;

  let guest: GuestContact | undefined;
  try {
    guest = parseGuestContact(guestInput);
    if (guest.phone === null)
      issues.push({ path: "guest.phone", message: "Enter a phone number." });
    if (guest.email === null)
      issues.push({ path: "guest.email", message: "Enter an email address." });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    issues.push(...prefix("guest", error.issues));
  }

  let consent: GuestConsent | undefined;
  try {
    consent = validateGuestConsent({
      privacyNoticeVersion: data.consent.privacyNoticeVersion,
      marketingConsentVersion: data.marketingOptIn?.consentVersion ?? null,
    });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    issues.push(...prefix("consent", error.issues));
  }

  const quoteBody = {
    branchSlug: data.branchSlug,
    stay: data.stay,
    lines: data.lines,
    services: data.services,
    ...(data.couponCode === undefined ? {} : { couponCode: data.couponCode }),
    phone: guest?.phone?.value,
  };
  const quote = parseQuoteRequest(quoteBody);
  if (!quote.ok) issues.push(...quote.issues);

  if (issues.length > 0 || !guest || !consent || !quote.ok)
    return invalid("Check the booking details.", issues);
  if (data.paymentMethod === "PAYMOB")
    return failure(
      "PAYMENT_METHOD_UNAVAILABLE",
      "Online payment is not available. Choose pay at hotel.",
    );
  return {
    ok: true,
    value: {
      quote: quote.value,
      quoteBody,
      contact: guest,
      token: data.phoneVerificationToken,
      expectedTotalMinor: data.expectedTotal.amountMinor,
      consent,
      idempotencyKey: idempotencyKey as string,
    },
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/**
 * What the request means, independent of key order and of the order of units
 * and services (Decision 1b). The caller adds the verified phone and the token
 * hash, so a different client cannot replay another guest's key and body.
 */
export function bookingFingerprintSource(
  input: WebsiteBookingInput,
  tokenHash: string,
): string {
  const { quote, contact, consent } = input;
  const coupon =
    quote.couponCode === undefined
      ? null
      : (() => {
          const normalized = normalizeCouponCode(quote.couponCode);
          return normalized.ok ? normalized.code : quote.couponCode;
        })();
  const sortedCanonical = (items: readonly unknown[]) =>
    items.map(canonical).sort();
  return canonical({
    branchSlug: quote.branchSlug,
    stay: {
      checkIn: quote.stay.checkIn.value,
      checkOut: quote.stay.checkOut.value,
    },
    lines: sortedCanonical(
      quote.lines.map((line) => ({
        roomSlug: line.roomSlug,
        adults: line.occupancy.adults,
        children: line.occupancy.children,
      })),
    ),
    // A bare kind and `{ kind }` mean the same service.
    services: sortedCanonical(
      quote.services.map((service) =>
        typeof service === "string" ? { kind: service } : service,
      ),
    ),
    coupon,
    guest: { ...contact, phone: contact.phone?.value ?? null },
    consent,
    expectedTotalMinor: input.expectedTotalMinor,
    paymentMethod: "PAY_AT_HOTEL",
    tokenHash,
  });
}
