import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import type { ContactDelivery } from "@/application/ports/providers";

type SmtpOptions = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
}>;

/** One line of plain text, safe for a mail header. */
export function headerText(value: string, max: number) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Sends enquiries as plain-text email through the hosting account's SMTP
 * server. Visitor input never reaches a header except the Reply-To address,
 * which was validated as an email address, and a newline-stripped subject.
 */
export class SmtpContactDelivery implements ContactDelivery {
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async deliver(input: {
    enquiryId: string;
    replyTo: string;
    subject: string;
    text: string;
  }) {
    const info = await this.transporter.sendMail({
      from: this.options.from,
      to: this.options.to,
      replyTo: input.replyTo,
      subject: `Website enquiry: ${headerText(input.subject, 150)}`,
      text: `${input.text}\n\n— Enquiry ${input.enquiryId}, sent from the Rivana Residence website.`,
    });
    return { messageId: String(info.messageId ?? input.enquiryId) };
  }
}
