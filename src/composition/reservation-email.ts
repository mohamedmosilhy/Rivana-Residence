import "server-only";

import type { ReservationEmailSender } from "@/application/notifications";
import { FakeReservationEmail } from "@/infrastructure/email/fake-reservation-email";
import { SmtpReservationEmail } from "@/infrastructure/email/reservation-email";
import { createSmtpTransport } from "@/infrastructure/email/smtp-contact-delivery";
import { getServerEnv } from "@/lib/env/server";

function reservationEmailConfig() {
  const env = getServerEnv();
  if (env.EMAIL_PROVIDER === "fake") return { mode: "fake" } as const;
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, CONTACT_FROM } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !CONTACT_FROM)
    return { mode: "unconfigured" } as const;
  return {
    mode: "real",
    from: CONTACT_FROM,
    smtp: {
      host: SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: SMTP_USER,
      password: SMTP_PASSWORD,
    },
  } as const;
}

export function reservationEmailReadiness() {
  return reservationEmailConfig().mode;
}

let sender: ReservationEmailSender | undefined;

export function reservationEmailSender(): ReservationEmailSender {
  if (sender) return sender;
  const config = reservationEmailConfig();
  switch (config.mode) {
    case "fake":
      sender = new FakeReservationEmail();
      break;
    case "real":
      sender = new SmtpReservationEmail(
        createSmtpTransport(config.smtp),
        config.from,
      );
      break;
    case "unconfigured":
      sender = { send: async () => ({ ok: false, code: "NOT_CONFIGURED" }) };
      break;
  }
  return sender;
}
