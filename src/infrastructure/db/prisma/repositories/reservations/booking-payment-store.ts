import "server-only";

import type { BookingPaymentStore } from "@/application/payments";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export class PrismaBookingPaymentStore implements BookingPaymentStore {
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
}
