import "server-only";
import {
  MAX_ATTEMPTS,
  type ClaimedMessage,
  type Completion,
  type OutboxWorkerStore,
  type OutgoingMessage,
  type ReservationMessageStore,
} from "@/application/notifications";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export class PrismaReservationMessageStore implements ReservationMessageStore {
  constructor(private readonly tx: Prisma.TransactionClient) {}
  async snapshot(branchId: string, id: string) {
    const { branch, checkIn, checkOut, ...booking } =
      await this.tx.reservation.findFirstOrThrow({
        where: { branchId, id },
        select: {
          id: true,
          reference: true,
          source: true,
          status: true,
          guestName: true,
          guestEmail: true,
          guestPhone: true,
          checkIn: true,
          checkOut: true,
          totalMinor: true,
          branch: { select: { name: true, email: true } },
        },
      });
    return {
      ...booking,
      checkIn: checkIn.toISOString().slice(0, 10),
      checkOut: checkOut.toISOString().slice(0, 10),
      branchName: branch.name,
      branchEmail: branch.email,
    };
  }
  async append(messages: OutgoingMessage[]) {
    await this.tx.notificationOutbox.createMany({ data: messages });
  }
  async discardHeld(reservationId: string) {
    await this.tx.notificationOutbox.deleteMany({
      where: { reservationId, status: "HELD" },
    });
  }
}

export class PrismaOutboxWorkerStore implements OutboxWorkerStore {
  constructor(private readonly client: PrismaClient) {}
  async claim(now: Date) {
    return this.client.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<ClaimedMessage[]>`
        SELECT id, channel, recipient, kind, payload, attempts FROM "NotificationOutbox"
        WHERE status = 'PENDING' AND "availableAt" <= ${now}
        ORDER BY "availableAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!row) return null;
      if (row.attempts >= MAX_ATTEMPTS) {
        // The last lease expired without an acknowledgement. Sending again
        // would exceed the attempt budget. The remote outcome is unknown.
        await tx.notificationOutbox.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            lastError: "DELIVERY_UNCONFIRMED",
            payload: {},
          },
        });
        return "exhausted" as const;
      }
      // Claim one at a time so time spent sending earlier messages never
      // consumes a later message's lease. Late completions are fenced below.
      await tx.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          availableAt: new Date(now.getTime() + 120_000),
        },
      });
      return { ...row, attempts: row.attempts + 1 };
    });
  }
  async complete(row: ClaimedMessage, outcome: Completion) {
    const updated = await this.client.notificationOutbox.updateMany({
      where: { id: row.id, attempts: row.attempts, status: "PENDING" },
      data:
        outcome.status === "PENDING"
          ? outcome
          : {
              ...outcome,
              payload: {},
              ...(outcome.status === "SENT" ? { lastError: null } : {}),
            },
    });
    return updated.count === 1;
  }
}

export async function expireReservationTokens(client: PrismaClient, now: Date) {
  const [verification, manage] = await client.$transaction([
    client.phoneVerification.updateMany({
      where: {
        tokenHash: { not: null },
        OR: [{ consumedAt: { not: null } }, { tokenExpiresAt: { lte: now } }],
      },
      data: { tokenHash: null },
    }),
    // Clear only the secret. Housekeeping must preserve the booking's
    // updatedAt, version, expiry, and operational history.
    client.$executeRaw`UPDATE "Reservation" SET "manageTokenHash" = NULL
      WHERE "manageTokenHash" IS NOT NULL AND "manageTokenExpiresAt" <= ${now}`,
  ]);
  return { verification: verification.count, manage };
}
