import "server-only";

import type { Transporter } from "nodemailer";

import type {
  DeliveryResult,
  VerificationCodeEmail,
  VerificationCodeEmailMessage,
} from "@/application/notifications";
import { FAKE_EMAIL_REJECTED_ADDRESS } from "./fake-reservation-email";
import { VERIFICATION_POLICY } from "@/domain/guests";

import { messageIdFor, smtpDeliveryFailure } from "./reservation-email";

/**
 * The email code text (ADR 031, spec 0006 Decision 9). Plain, with no link and
 * no booking or branch details. Placeholder wording until the client approves
 * it (Q-30).
 */
export function renderVerificationCodeEmail(code: string) {
  if (!/^\d{6}$/.test(code))
    throw new Error("A verification code is six digits.");
  const lines = [
    `Your Rivana Residence code is ${code}.`,
    `It expires in ${VERIFICATION_POLICY.codeLifetimeMs / 60_000} minutes.`,
    "If you did not ask for it, ignore this email.",
  ];
  return {
    subject: "Your verification code",
    text: lines.join("\n"),
    html: lines.map((line) => `<p>${line}</p>`).join(""),
  };
}

export class SmtpVerificationCodeEmail implements VerificationCodeEmail {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}
  async send(message: VerificationCodeEmailMessage): Promise<DeliveryResult> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: { name: "", address: message.to },
        messageId: messageIdFor(message.id, this.from),
        ...renderVerificationCodeEmail(message.code),
      });
      return { ok: true };
    } catch (error) {
      // Never keep the provider message: it may echo the address or the code.
      return smtpDeliveryFailure(error);
    }
  }
}

type CodeDelivery = Readonly<{ id: string; to: string; code: string }>;

/** Records a bounded history in this process for development and tests only. */
export class FakeVerificationCodeEmail implements VerificationCodeEmail {
  readonly deliveries: CodeDelivery[] = [];

  async send(message: VerificationCodeEmailMessage): Promise<DeliveryResult> {
    if (message.to === FAKE_EMAIL_REJECTED_ADDRESS)
      return { ok: false, code: "PROVIDER_REJECTED" };
    renderVerificationCodeEmail(message.code);
    this.deliveries.push({ ...message });
    if (this.deliveries.length > 100) this.deliveries.shift();
    return { ok: true };
  }
}
