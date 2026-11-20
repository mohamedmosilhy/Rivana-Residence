import "server-only";
import {
  DispatchOutbox,
  QueueReservationMessages,
  type ReservationEmailSender,
} from "@/application/notifications";
import type { TransactionContextFactory } from "@/infrastructure/db/prisma/unit-of-work";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import {
  PrismaOutboxWorkerStore,
  PrismaReservationMessageStore,
  expireReservationTokens,
} from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { SmtpReservationEmail } from "@/infrastructure/email/reservation-email";
import { createSmtpTransport } from "@/infrastructure/email/smtp-contact-delivery";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { getServerEnv } from "@/lib/env/server";
import { whatsAppSender } from "./whatsapp-sender";

const clock = { now: () => new Date() };
export const reservationMessageWriter: TransactionContextFactory<
  QueueReservationMessages
> = (tx) => {
  return new QueueReservationMessages(
    new PrismaReservationMessageStore(tx),
    new Cuid2IdGenerator(),
    clock,
    getServerEnv().APP_URL,
  );
};
function emailSender(): ReservationEmailSender {
  const env = getServerEnv();
  if (
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASSWORD ||
    !env.CONTACT_FROM
  )
    return { send: async () => ({ ok: false, code: "NOT_CONFIGURED" }) };
  return new SmtpReservationEmail(
    createSmtpTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    }),
    env.CONTACT_FROM,
  );
}
export async function runReservationJob(command: "outbox" | "expire-tokens") {
  const client = getPrisma();
  try {
    if (command === "expire-tokens")
      return await expireReservationTokens(client, clock.now());
    return await new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      emailSender(),
      whatsAppSender(),
      clock,
    ).run();
  } finally {
    await client.$disconnect();
  }
}
