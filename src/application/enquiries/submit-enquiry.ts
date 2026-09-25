import type { LoginThrottleStore } from "@/application/auth/ports";
import type { Clock, ContactDelivery } from "@/application/ports/providers";
import type { EnquiryRepository } from "@/application/ports/repositories";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { retryAfterMs } from "@/domain/auth/login-throttle";
import {
  ENQUIRY_GLOBAL_THROTTLE_RULE,
  ENQUIRY_THROTTLE_RULE,
  MAX_FORM_AGE_MS,
  MIN_FORM_FILL_MS,
  contactEnquirySchema,
} from "@/domain/enquiries/contact-enquiry";
import { issuesFromZod } from "@/domain/shared/domain-error";

/** Issues and verifies signed "form rendered at" tokens. */
export interface FormTokens {
  issue(now: Date): string;
  /** The issue time for a genuine token, or null. */
  verify(token: string): Date | null;
  /** A keyed, non-reversible rate-limit key for a client address. */
  clientKey(address: string): string;
}

export type EnquiryDeliveryMode = "none" | "delivered" | "failed";

export type SubmitEnquiryCommand = Readonly<{
  values: Readonly<Record<string, unknown>>;
  clientAddress: string | null;
}>;

const THANK_YOU = "accepted" as const;

/**
 * Accepts a public contact enquiry. Bots that fill the hidden field or
 * submit implausibly fast get the same thank-you as people, so they learn
 * nothing, but nothing is stored or sent. The enquiry is saved before
 * delivery, so a mail failure never loses a message: staff see it in the
 * admin inbox marked "Delivery failed".
 */
export class SubmitEnquiry {
  constructor(
    private readonly deps: Readonly<{
      enquiries: EnquiryRepository;
      throttle: LoginThrottleStore;
      tokens: FormTokens;
      delivery: ContactDelivery | null;
      clock: Clock;
    }>,
  ) {}

  async execute(
    command: SubmitEnquiryCommand,
  ): Promise<Result<typeof THANK_YOU>> {
    const { values } = command;
    const now = this.deps.clock.now();

    const issuedAt =
      typeof values.formToken === "string"
        ? this.deps.tokens.verify(values.formToken)
        : null;
    if (!issuedAt || now.getTime() - issuedAt.getTime() > MAX_FORM_AGE_MS) {
      return failure(
        "VALIDATION",
        "This form has expired. Reload the page and try again.",
      );
    }
    const honeypot =
      typeof values.website === "string" && values.website.trim() !== "";
    if (honeypot || now.getTime() - issuedAt.getTime() < MIN_FORM_FILL_MS) {
      return success(THANK_YOU);
    }

    const [key, rule] = command.clientAddress
      ? [
          `e:${this.deps.tokens.clientKey(command.clientAddress)}`,
          ENQUIRY_THROTTLE_RULE,
        ]
      : ["e:all", ENQUIRY_GLOBAL_THROTTLE_RULE];
    if (retryAfterMs(await this.deps.throttle.get(key), now) > 0) {
      return failure(
        "RATE_LIMITED",
        "Too many messages have been sent from here. Please wait a few minutes, or call or email us.",
      );
    }

    const text = (name: string) =>
      typeof values[name] === "string" ? (values[name] as string) : "";
    const optional = (name: string) => text(name).trim() || null;
    const parsed = contactEnquirySchema.safeParse({
      name: text("name"),
      email: text("email"),
      phone: optional("phone"),
      subject: optional("subject"),
      message: text("message"),
    });
    if (!parsed.success) {
      return invalid(
        "Please check the highlighted fields.",
        issuesFromZod(parsed.error.issues),
      );
    }

    // Count accepted messages, not attempts, toward the limit.
    await this.deps.throttle.recordFailure(key, rule, now);
    const saved = await this.deps.enquiries.create(parsed.data);
    if (!saved.ok) return saved;

    if (this.deps.delivery) {
      const enquiry = saved.value;
      try {
        const { messageId } = await this.deps.delivery.deliver({
          enquiryId: enquiry.id,
          replyTo: enquiry.email,
          subject: enquiry.subject ?? "Website enquiry",
          text: [
            `Name: ${enquiry.name}`,
            `Email: ${enquiry.email}`,
            `Phone: ${enquiry.phone ?? "—"}`,
            `Subject: ${enquiry.subject ?? "—"}`,
            "",
            enquiry.message,
          ].join("\n"),
        });
        await this.deps.enquiries.markDelivered(enquiry.id, messageId);
      } catch {
        await this.deps.enquiries.markDeliveryFailed(enquiry.id);
      }
    }
    return success(THANK_YOU);
  }
}
