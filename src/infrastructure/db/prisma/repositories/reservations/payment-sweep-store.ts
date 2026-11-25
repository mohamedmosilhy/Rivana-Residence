import "server-only";

import type { PaymentSweepStore, SweepPayment } from "@/application/payments";
import type { Prisma } from "@/generated/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const select = {
  id: true,
  reservationId: true,
  providerOrderId: true,
  providerTransactionId: true,
  amountMinor: true,
  currency: true,
  refundAttempt: true,
  expiresAt: true,
  reservation: { select: { branchId: true, statusChangedAt: true } },
} satisfies Prisma.PaymentSelect;

type Row = Prisma.PaymentGetPayload<{ select: typeof select }>;

const toSweepPayment = ({ reservation, ...payment }: Row): SweepPayment => ({
  ...payment,
  branchId: reservation.branchId,
  statusChangedAt: reservation.statusChangedAt,
});

/** Held rows read to find candidates. Expired bookings are the oldest, so they come first. */
const HELD_WINDOW = 500;

/**
 * Pool reads for the scheduled payment jobs. Candidates only: jobs re-check
 * under the lock. `exclude` lists the ids already seen in this run, so a stuck
 * item does not hold the head of an oldest first read.
 */
export class PrismaPaymentSweepStore implements PaymentSweepStore {
  constructor(private readonly client: DatabaseClient) {}

  async findOverdueHolds(at: Date, limit: number, exclude: readonly string[]) {
    return this.client.reservation.findMany({
      where: {
        status: "AWAITING_PAYMENT",
        holdExpiresAt: { lte: at },
        id: { notIn: [...exclude] },
      },
      orderBy: [{ holdExpiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, branchId: true },
    });
  }

  async findStaleInitiated(
    provider: string,
    at: Date,
    limit: number,
    exclude: readonly string[],
  ) {
    const rows = await this.client.payment.findMany({
      where: {
        provider,
        status: "INITIATED",
        expiresAt: { lte: at },
        id: { notIn: [...exclude] },
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select,
    });
    return rows.map(toSweepPayment);
  }

  async findUnsentRefunds(
    provider: string,
    olderThan: Date,
    limit: number,
    exclude: readonly string[],
  ) {
    const rows = await this.client.payment.findMany({
      where: {
        provider,
        status: "REFUND_PENDING",
        refundRequestedAt: null,
        updatedAt: { lte: olderThan },
        id: { notIn: [...exclude] },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
      select,
    });
    return rows.map(toSweepPayment);
  }

  async findSentRefunds(
    provider: string,
    sentBefore: Date,
    limit: number,
    exclude: readonly string[],
  ) {
    const rows = await this.client.payment.findMany({
      where: {
        provider,
        status: "REFUND_PENDING",
        refundRequestedAt: { not: null, lte: sentBefore },
        id: { notIn: [...exclude] },
      },
      orderBy: [{ refundRequestedAt: "asc" }, { id: "asc" }],
      take: limit,
      select,
    });
    return rows.map(toSweepPayment);
  }

  async findHeldCleanup(
    provider: string,
    at: Date,
    limit: number,
    exclude: readonly string[],
  ) {
    // Start from the few held rows (index on status), not from every payment ever made.
    const held = await this.client.notificationOutbox.findMany({
      where: { status: "HELD", reservationId: { not: null } },
      distinct: ["reservationId"],
      orderBy: { availableAt: "asc" },
      take: HELD_WINDOW,
      select: { reservationId: true },
    });
    const reservationIds = held.flatMap((row) =>
      row.reservationId ? [row.reservationId] : [],
    );
    if (reservationIds.length === 0) return [];
    const rows = await this.client.payment.findMany({
      where: {
        provider,
        status: { in: ["EXPIRED", "FAILED"] },
        expiresAt: { lte: at },
        id: { notIn: [...exclude] },
        reservationId: { in: reservationIds },
        reservation: { status: "PAYMENT_FAILED" },
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select,
    });
    return rows.map(toSweepPayment);
  }
}
