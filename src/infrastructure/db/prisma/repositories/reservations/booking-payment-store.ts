import "server-only";

import type {
  BookingPaymentStore,
  PaymentCallbackStore,
} from "@/application/payments";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export class PrismaBookingPaymentStore
  implements BookingPaymentStore, PaymentCallbackStore
{
  constructor(private readonly client: DatabaseClient) {}

  findInitiated(reservationId: string) {
    return this.client.payment.findFirst({
      where: { reservationId, status: "INITIATED" },
      select: {
        id: true,
        reservationId: true,
        provider: true,
        amountMinor: true,
        currency: true,
        expiresAt: true,
        checkoutUrl: true,
      },
    });
  }

  async insert(
    payment: Parameters<BookingPaymentStore["insert"]>[0],
    at: Date,
  ) {
    await this.client.payment.create({
      data: { ...payment, status: "INITIATED", createdAt: at, updatedAt: at },
    });
  }

  async saveCheckout(
    id: string,
    {
      checkoutUrl,
      providerOrderId,
    }: Parameters<BookingPaymentStore["saveCheckout"]>[1],
  ) {
    await this.client.payment.update({
      where: { id },
      data: { checkoutUrl, providerOrderId: providerOrderId ?? null },
    });
  }

  async end(id: string, status: "FAILED" | "EXPIRED", at: Date) {
    await this.client.payment.update({
      where: { id },
      data: {
        status,
        updatedAt: at,
        lastError: status === "FAILED" ? "PROVIDER_REJECTED" : null,
      },
    });
  }

  async findPayment(id: string) {
    const row = await this.client.payment.findUnique({
      where: { id },
      select: {
        id: true,
        reservationId: true,
        provider: true,
        amountMinor: true,
        currency: true,
        expiresAt: true,
        checkoutUrl: true,
        status: true,
        providerTransactionId: true,
        refundAttempt: true,
        reservation: { select: { branchId: true } },
      },
    });
    if (!row) return null;
    const { reservation, ...payment } = row;
    return { ...payment, branchId: reservation.branchId };
  }

  async findEventResult(providerEventId: string) {
    const row = await this.client.paymentEvent.findUnique({
      where: { providerEventId },
      select: { result: true },
    });
    return row?.result ?? null;
  }

  async recordEvent(event: Parameters<PaymentCallbackStore["recordEvent"]>[0]) {
    const data = {
      paymentId: event.paymentId,
      kind: event.kind,
      outcome: event.outcome,
      result: event.result,
      amountMinor: event.amountMinor,
      currency: event.currency,
    };
    // Duplicates serialize on the reservation lock. An unknown payment has no
    // lock, so two parallel copies meet at the unique event id.
    await this.client.paymentEvent.upsert({
      where: { providerEventId: event.providerEventId },
      create: {
        id: event.id,
        providerEventId: event.providerEventId,
        receivedAt: event.at,
        ...data,
      },
      update: data,
    });
  }

  async markSucceeded(
    id: string,
    providerTransactionId: string | undefined,
    at: Date,
  ) {
    await this.client.payment.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        updatedAt: at,
        lastError: null,
        ...(providerTransactionId ? { providerTransactionId } : {}),
      },
    });
  }

  async startRefund(id: string, at: Date) {
    const row = await this.client.payment.update({
      where: { id },
      data: {
        status: "REFUND_PENDING",
        refundAttempt: { increment: 1 },
        refundRequestedAt: null,
        updatedAt: at,
      },
      select: { refundAttempt: true },
    });
    return row.refundAttempt;
  }

  async markRefundRequested(
    id: string,
    at: Date,
    providerRefundId: string | undefined,
  ) {
    await this.client.payment.updateMany({
      where: { id, status: "REFUND_PENDING", refundRequestedAt: null },
      data: {
        refundRequestedAt: at,
        updatedAt: at,
        ...(providerRefundId ? { refundProviderId: providerRefundId } : {}),
      },
    });
  }
}
