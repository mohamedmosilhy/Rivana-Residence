import "server-only";

import {
  CreateWebsiteReservation,
  ProcessPaymentCallback,
  type ProcessPaymentCallbackContext,
  ExpirePaymentHolds,
  type ExpirePaymentHoldsContext,
  ReconcilePayments,
  type ReconcilePaymentsContext,
  CreateStaffReservation,
  RecordExternalReservation,
  ModifyReservation,
  CancelReservation,
  MarkChangeEnteredInHotelSystem,
  AssignPhysicalRoom,
  RecordFrontDeskTransition,
  UpdateReservationGuest,
  MarkEnteredInHotelSystem,
  ResendManageLink,
  type ResendManageLinkContext,
  type ModifyReservationContext,
  type CancelReservationContext,
  ListReservations,
  GetReservation,
  GetReservationHistory,
  type StaffBookingContext,
  type CreateWebsiteReservationContext,
  type ReservationStorageContext,
  type ReservationUnitOfWork,
} from "@/application/reservations";
import { QuoteBooking } from "@/application/quotes";
import { whatsAppSetupReader } from "@/composition/whatsapp-sender";
import { reservationMessageWriter } from "@/composition/reservation-jobs";
import {
  paymentGateway,
  websiteCheckoutConnection,
} from "@/composition/payment-gateway";
import { isPaymentGatewayReady } from "@/composition/provider-readiness";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import type { Clock } from "@/application/shared/providers";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaPublicListingReader } from "@/infrastructure/db/prisma/repositories/public-listing-reader";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaBookingPaymentStore } from "@/infrastructure/db/prisma/repositories/reservations/booking-payment-store";
import { PrismaPaymentSweepStore } from "@/infrastructure/db/prisma/repositories/reservations/payment-sweep-store";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaAvailabilityCatalog } from "@/infrastructure/db/prisma/repositories/reservations/inventory/availability-catalog";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";
import {
  PrismaCouponRedemptionReader,
  PrismaCouponRedemptionStore,
} from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";
import { PrismaCouponRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-repository";
import { PrismaCommercialSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/commercial-settings-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";
import { PrismaStaffReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/staff-reservation-reader";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import {
  PrismaAuditLog,
  PrismaReservationHistoryReader,
} from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

function storageContext(
  transaction: DatabaseClient,
): ReservationStorageContext {
  const consumption = new PrismaReservationConsumptionReader(transaction);
  return {
    reservations: new PrismaReservationRepository(transaction),
    guests: new PrismaGuestRepository(transaction),
    consumption,
    inventoryLock: new PrismaInventoryLock(transaction),
    inventoryReader: new PrismaInventoryReader(transaction, consumption),
    audit: new PrismaAuditLog(transaction),
  };
}

/** The transaction-bound ports of S6 (also used by tests to wrap one adapter). */
export function modifyReservationContext(
  transaction: DatabaseClient,
): ModifyReservationContext {
  return {
    ...storageContext(transaction),
    catalog: new PrismaAvailabilityCatalog(transaction),
    rates: new PrismaRateRepository(transaction),
    services: new PrismaServiceOfferingRepository(transaction),
    messages: reservationMessageWriter(transaction),
  };
}

/** The transaction-bound ports of S9. */
export function cancelReservationContext(
  transaction: DatabaseClient,
): CancelReservationContext {
  return {
    ...storageContext(transaction),
    redemptions: new PrismaCouponRedemptionStore(transaction),
    messages: reservationMessageWriter(transaction),
  };
}

/** Storage foundation for later authorized reservation use cases. */
export function reservationUnitOfWork(): ReservationUnitOfWork<ReservationStorageContext> {
  return new PrismaReservationUnitOfWork(getPrisma(), storageContext);
}

/**
 * M8-T7. Everything the booking reads after its locks is bound to the one
 * transaction, including the quote, so prices and counts are never stale.
 */
export function createWebsiteReservation(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const clock = options.clock ?? { now: () => new Date() };
  const checkout = websiteCheckoutConnection();
  const paymentReady = isPaymentGatewayReady();
  return new CreateWebsiteReservation({
    unitOfWork:
      new PrismaReservationUnitOfWork<CreateWebsiteReservationContext>(
        client,
        (transaction) => {
          const consumption = new PrismaReservationConsumptionReader(
            transaction,
          );
          const inventoryReader = new PrismaInventoryReader(
            transaction,
            consumption,
          );
          return {
            reservations: new PrismaReservationRepository(transaction),
            guests: new PrismaGuestRepository(transaction),
            consumption,
            inventoryLock: new PrismaInventoryLock(transaction),
            inventoryReader,
            audit: new PrismaAuditLog(transaction),
            verifications: new PrismaPhoneVerificationRepository(transaction),
            redemptions: new PrismaCouponRedemptionStore(transaction),
            quote: transactionalQuote(
              transaction,
              inventoryReader,
              clock,
              paymentReady,
            ),
            messages: reservationMessageWriter(transaction),
            payments: new PrismaBookingPaymentStore(transaction),
          };
        },
      ),
    branches: new PrismaBranchRepository(client),
    listings: new PrismaPublicListingReader(client),
    replays: new PrismaReservationRepository(client),
    payments: new PrismaBookingPaymentStore(client),
    ...(checkout ? { checkout } : {}),
    tokens: new PrismaPhoneVerificationRepository(client),
    setup: whatsAppSetupReader(),
    crypto: new NodeBookingCrypto(),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

/** P8. The gateway is whichever adapter the deployment selected; none refuses every callback. */
export function processPaymentCallback(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
    gateway?: ReturnType<typeof paymentGateway>;
    provider?: string;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const clock = options.clock ?? { now: () => new Date() };
  const checkout = websiteCheckoutConnection();
  const gateway = options.gateway ?? checkout?.gateway;
  const provider = options.provider ?? checkout?.provider;
  return new ProcessPaymentCallback({
    unitOfWork: new PrismaReservationUnitOfWork<ProcessPaymentCallbackContext>(
      client,
      (transaction) => ({
        ...storageContext(transaction),
        payments: new PrismaBookingPaymentStore(transaction),
        redemptions: new PrismaCouponRedemptionStore(transaction),
        messages: reservationMessageWriter(transaction),
        crypto: new NodeBookingCrypto(),
      }),
    ),
    reads: {
      payments: new PrismaBookingPaymentStore(client),
      reservations: new PrismaReservationRepository(client),
    },
    ...(gateway ? { gateway } : {}),
    ...(provider ? { provider } : {}),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

/** Scheduled hold expiry (`npm run reservations -- expire-holds`). */
export function expirePaymentHolds(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  return new ExpirePaymentHolds({
    unitOfWork: new PrismaReservationUnitOfWork<ExpirePaymentHoldsContext>(
      client,
      (transaction) => ({
        ...storageContext(transaction),
        payments: new PrismaBookingPaymentStore(transaction),
        redemptions: new PrismaCouponRedemptionStore(transaction),
        messages: reservationMessageWriter(transaction),
      }),
    ),
    sweep: new PrismaPaymentSweepStore(client),
    clock: options.clock ?? { now: () => new Date() },
  });
}

/** Scheduled reconciliation (`npm run reservations -- reconcile-payments`). */
export function reconcilePayments(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
    gateway?: ReturnType<typeof paymentGateway>;
    provider?: string;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const clock = options.clock ?? { now: () => new Date() };
  const checkout = websiteCheckoutConnection();
  const gateway = options.gateway ?? checkout?.gateway;
  const provider = options.provider ?? checkout?.provider;
  return new ReconcilePayments({
    unitOfWork: new PrismaReservationUnitOfWork<ReconcilePaymentsContext>(
      client,
      (transaction) => ({
        ...storageContext(transaction),
        payments: new PrismaBookingPaymentStore(transaction),
        messages: reservationMessageWriter(transaction),
      }),
    ),
    sweep: new PrismaPaymentSweepStore(client),
    callback: processPaymentCallback({
      client,
      clock,
      ...(gateway ? { gateway } : {}),
      ...(provider ? { provider } : {}),
    }),
    ...(gateway ? { gateway } : {}),
    ...(provider ? { provider } : {}),
    clock,
  });
}

function transactionalQuote(
  transaction: DatabaseClient,
  inventory: PrismaInventoryReader,
  clock: Clock,
  paymentReady = false,
) {
  return new QuoteBooking({
    branches: new PrismaBranchRepository(transaction),
    rooms: new PrismaPublicListingReader(transaction),
    inventory,
    rates: new PrismaRateRepository(transaction),
    services: new PrismaServiceOfferingRepository(transaction),
    coupons: new PrismaCouponRepository(transaction),
    redemptions: new PrismaCouponRedemptionReader(transaction, {
      phoneAware: true,
    }),
    settings: new PrismaCommercialSettingsRepository(transaction),
    clock,
    paymentReady,
  });
}

export function staffReservationCommands(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const clock = options.clock ?? { now: () => new Date() };
  const repository = new PrismaReservationRepository(client);
  const deps = {
    unitOfWork: new PrismaReservationUnitOfWork<StaffBookingContext>(
      client,
      (transaction) => {
        const consumption = new PrismaReservationConsumptionReader(transaction);
        const inventoryReader = new PrismaInventoryReader(
          transaction,
          consumption,
        );
        const reservations = new PrismaReservationRepository(transaction);
        return {
          reservations,
          externalReferences: reservations,
          catalog: new PrismaAvailabilityCatalog(transaction),
          guests: new PrismaGuestRepository(transaction),
          consumption,
          inventoryLock: new PrismaInventoryLock(transaction),
          inventoryReader,
          audit: new PrismaAuditLog(transaction),
          rates: new PrismaRateRepository(transaction),
          redemptions: new PrismaCouponRedemptionStore(transaction),
          quote: transactionalQuote(transaction, inventoryReader, clock),
          messages: reservationMessageWriter(transaction),
          payments: new PrismaBookingPaymentStore(transaction),
        };
      },
    ),
    replays: repository,
    externalReferences: repository,
    crypto: new NodeBookingCrypto(),
    ids: new Cuid2IdGenerator(),
    clock,
  };
  const reads = new PrismaStaffReservationReader(client);
  const operations = {
    unitOfWork: new PrismaReservationUnitOfWork(client, storageContext),
    reads,
    clock,
  };
  return {
    create: new CreateStaffReservation(deps),
    recordExternal: new RecordExternalReservation(deps),
    modify: new ModifyReservation({
      unitOfWork: new PrismaReservationUnitOfWork<ModifyReservationContext>(
        client,
        modifyReservationContext,
      ),
      reads,
      ids: deps.ids,
      clock,
    }),
    cancel: new CancelReservation({
      unitOfWork: new PrismaReservationUnitOfWork<CancelReservationContext>(
        client,
        cancelReservationContext,
      ),
      reads,
      ids: deps.ids,
      clock,
    }),
    markChangeEntered: new MarkChangeEnteredInHotelSystem(operations),
    updateGuest: new UpdateReservationGuest({ ...operations, ids: deps.ids }),
    assignRoom: new AssignPhysicalRoom(operations),
    checkIn: new RecordFrontDeskTransition(operations, "CHECK_IN"),
    checkOut: new RecordFrontDeskTransition(operations, "CHECK_OUT"),
    markNoShow: new RecordFrontDeskTransition(operations, "MARK_NO_SHOW"),
    markEntered: new MarkEnteredInHotelSystem(operations),
    resendManageLink: new ResendManageLink({
      reads,
      clock,
      crypto: deps.crypto,
      unitOfWork: new PrismaReservationUnitOfWork<ResendManageLinkContext>(
        client,
        (transaction) => ({
          ...storageContext(transaction),
          messages: reservationMessageWriter(transaction),
        }),
      ),
    }),
  };
}

export function staffReservationQueries(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const reader = new PrismaStaffReservationReader(client);
  return {
    list: new ListReservations(reader),
    get: new GetReservation(reader, options.clock),
    history: new GetReservationHistory(
      reader,
      new PrismaReservationHistoryReader(client),
    ),
  };
}
