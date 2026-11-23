import "server-only";
import {
  DispatchOutbox,
  QueueReservationMessages,
} from "@/application/notifications";
import type { TransactionContextFactory } from "@/infrastructure/db/prisma/unit-of-work";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import {
  PrismaOutboxWorkerStore,
  PrismaReservationMessageStore,
  expireReservationTokens,
} from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { getServerEnv } from "@/lib/env/server";
import { reservationEmailSender } from "./reservation-email";
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
export async function runReservationJob(command: "outbox" | "expire-tokens") {
  const client = getPrisma();
  try {
    if (command === "expire-tokens")
      return await expireReservationTokens(client, clock.now());
    return await new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      reservationEmailSender(),
      whatsAppSender(),
      clock,
    ).run();
  } finally {
    await client.$disconnect();
  }
}
