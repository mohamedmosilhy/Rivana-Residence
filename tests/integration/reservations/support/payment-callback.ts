import { randomUUID } from "node:crypto";
import { vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import { QueueReservationMessages } from "@/application/notifications";
import type {
  PaymentGatewayEvent,
  RefundInput,
  RefundResult,
  TransactionLookup,
} from "@/application/payments";
import {
  ExpirePaymentHolds,
  ProcessPaymentCallback,
  ReconcilePayments,
  type ExpirePaymentHoldsContext,
  type ProcessPaymentCallbackContext,
  type ReconcilePaymentsContext,
} from "@/application/reservations";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import { PrismaPaymentSweepStore } from "@/infrastructure/db/prisma/repositories/reservations/payment-sweep-store";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBookingPaymentStore } from "@/infrastructure/db/prisma/repositories/reservations/booking-payment-store";
import { PrismaCouponRedemptionStore } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaReservationMessageStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { signedCallback } from "@/infrastructure/payments/fake/callback";
import { FakePaymentGateway } from "@/infrastructure/payments/fake/fake-payment-gateway";

import { NOW } from "./website-booking";

export const CALLBACK_SECRET = "callback-test-secret";
export const CALLBACK_URL = new URL(
  "https://hotel.example/api/v1/payments/callback",
);
export const PROVIDER = "test-gateway";

type Options = Readonly<{
  now?: () => Date;
  audit?: (inner: AuditLog) => AuditLog;
  /** Rewrites the unlocked reservation read, to model a state change after it. */
  staleStatus?: "AWAITING_PAYMENT";
  refund?: (input: RefundInput) => Promise<RefundResult>;
}>;

/** Production wiring (src/composition/reservations.ts) on an independent client. */
export function paymentCallback(client: PrismaClient, options: Options = {}) {
  const clock = { now: options.now ?? (() => NOW) };
  const ids = new Cuid2IdGenerator();
  const fake = new FakePaymentGateway({
    origin: CALLBACK_URL.origin,
    secret: CALLBACK_SECRET,
    clock,
  });
  const refund = vi.fn(
    options.refund ??
      (async (): Promise<RefundResult> => ({
        status: "PENDING",
        providerRefundId: "refund-1",
      })),
  );
  const useCase = new ProcessPaymentCallback({
    unitOfWork: new PrismaReservationUnitOfWork<ProcessPaymentCallbackContext>(
      client,
      (transaction) => {
        const consumption = new PrismaReservationConsumptionReader(transaction);
        return {
          reservations: new PrismaReservationRepository(transaction),
          guests: new PrismaGuestRepository(transaction),
          consumption,
          inventoryLock: new PrismaInventoryLock(transaction),
          inventoryReader: new PrismaInventoryReader(transaction, consumption),
          audit: options.audit
            ? options.audit(new PrismaAuditLog(transaction))
            : new PrismaAuditLog(transaction),
          payments: new PrismaBookingPaymentStore(transaction),
          redemptions: new PrismaCouponRedemptionStore(transaction),
          messages: new QueueReservationMessages(
            new PrismaReservationMessageStore(transaction),
            ids,
            clock,
            "https://hotel.example",
          ),
          crypto: new NodeBookingCrypto(),
        };
      },
    ),
    reads: {
      payments: new PrismaBookingPaymentStore(client),
      reservations: options.staleStatus
        ? {
            findById: async (branchId, id) => {
              const found = await new PrismaReservationRepository(
                client,
              ).findById(branchId, id);
              return found && { ...found, status: options.staleStatus! };
            },
          }
        : new PrismaReservationRepository(client),
    },
    gateway: { verifyCallback: (input) => fake.verifyCallback(input), refund },
    provider: PROVIDER,
    clock,
    ids,
  });
  return { useCase, refund };
}

type Payment = Readonly<{ id: string; amountMinor: number }>;

export function callbackEvent(
  payment: Payment,
  overrides: Partial<PaymentGatewayEvent> = {},
): PaymentGatewayEvent {
  return {
    providerEventId: randomUUID(),
    paymentId: payment.id,
    providerTransactionId: randomUUID(),
    amountMinor: payment.amountMinor,
    currency: "USD",
    kind: "TRANSACTION",
    outcome: "SUCCEEDED",
    ...overrides,
  } as PaymentGatewayEvent;
}

export const signed = (event: PaymentGatewayEvent) =>
  signedCallback(CALLBACK_SECRET, CALLBACK_URL, event);

type JobOptions = Readonly<{
  now?: () => Date;
  audit?: (inner: AuditLog) => AuditLog;
  getTransaction?: (
    input: TransactionLookup,
  ) => Promise<PaymentGatewayEvent | "NOT_FOUND">;
  refund?: (input: RefundInput) => Promise<RefundResult>;
  /** Models a deployment with no gateway. */
  noGateway?: boolean;
}>;

/** The scheduled jobs (src/composition/reservations.ts) on an independent client. */
export function paymentJobs(client: PrismaClient, options: JobOptions = {}) {
  const clock = { now: options.now ?? (() => NOW) };
  const ids = new Cuid2IdGenerator();
  const getTransaction = vi.fn(
    options.getTransaction ?? (async () => "NOT_FOUND" as const),
  );
  const { useCase, refund } = paymentCallback(client, {
    now: clock.now,
    ...(options.refund ? { refund: options.refund } : {}),
  });
  const storage = (transaction: DatabaseClient) =>
    storageOf(transaction, options.audit);
  const messages = (transaction: DatabaseClient) =>
    new QueueReservationMessages(
      new PrismaReservationMessageStore(transaction),
      ids,
      clock,
      "https://hotel.example",
    );
  const sweep = new PrismaPaymentSweepStore(client);
  const expire = new ExpirePaymentHolds({
    unitOfWork: new PrismaReservationUnitOfWork<ExpirePaymentHoldsContext>(
      client,
      (transaction) => ({
        ...storage(transaction),
        payments: new PrismaBookingPaymentStore(transaction),
        redemptions: new PrismaCouponRedemptionStore(transaction),
        messages: messages(transaction),
      }),
    ),
    sweep,
    clock,
  });
  const reconcile = new ReconcilePayments({
    unitOfWork: new PrismaReservationUnitOfWork<ReconcilePaymentsContext>(
      client,
      (transaction) => ({
        ...storage(transaction),
        payments: new PrismaBookingPaymentStore(transaction),
        messages: messages(transaction),
      }),
    ),
    sweep,
    callback: useCase,
    ...(options.noGateway
      ? {}
      : { gateway: { getTransaction, refund }, provider: PROVIDER }),
    clock,
  });
  return { expire, reconcile, getTransaction, refund };
}

function storageOf(
  transaction: DatabaseClient,
  audit?: (inner: AuditLog) => AuditLog,
) {
  const consumption = new PrismaReservationConsumptionReader(transaction);
  const log = new PrismaAuditLog(transaction);
  return {
    reservations: new PrismaReservationRepository(transaction),
    guests: new PrismaGuestRepository(transaction),
    consumption,
    inventoryLock: new PrismaInventoryLock(transaction),
    inventoryReader: new PrismaInventoryReader(transaction, consumption),
    audit: audit ? audit(log) : log,
  };
}
