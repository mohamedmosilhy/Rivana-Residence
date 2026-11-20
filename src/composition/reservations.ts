import "server-only";

import {
  CreateWebsiteReservation,
  type CreateWebsiteReservationContext,
  type ReservationStorageContext,
  type ReservationUnitOfWork,
} from "@/application/reservations";
import { QuoteBooking } from "@/application/quotes";
import { whatsAppSetupReader } from "@/composition/whatsapp-sender";
import { reservationMessageWriter } from "@/composition/reservation-jobs";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import type { Clock } from "@/application/shared/providers";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaPublicListingReader } from "@/infrastructure/db/prisma/repositories/public-listing-reader";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
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
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

/** Storage foundation for later authorized reservation use cases. */
export function reservationUnitOfWork(): ReservationUnitOfWork<ReservationStorageContext> {
  return new PrismaReservationUnitOfWork(getPrisma(), (transaction) => {
    const consumption = new PrismaReservationConsumptionReader(transaction);
    return {
      reservations: new PrismaReservationRepository(transaction),
      guests: new PrismaGuestRepository(transaction),
      consumption,
      inventoryLock: new PrismaInventoryLock(transaction),
      inventoryReader: new PrismaInventoryReader(transaction, consumption),
      audit: new PrismaAuditLog(transaction),
    };
  });
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
            quote: new QuoteBooking({
              branches: new PrismaBranchRepository(transaction),
              rooms: new PrismaPublicListingReader(transaction),
              inventory: inventoryReader,
              rates: new PrismaRateRepository(transaction),
              services: new PrismaServiceOfferingRepository(transaction),
              coupons: new PrismaCouponRepository(transaction),
              redemptions: new PrismaCouponRedemptionReader(transaction, {
                phoneAware: true,
              }),
              settings: new PrismaCommercialSettingsRepository(transaction),
              clock,
            }),
            messages: reservationMessageWriter(transaction),
          };
        },
      ),
    branches: new PrismaBranchRepository(client),
    listings: new PrismaPublicListingReader(client),
    replays: new PrismaReservationRepository(client),
    tokens: new PrismaPhoneVerificationRepository(client),
    setup: whatsAppSetupReader(),
    crypto: new NodeBookingCrypto(),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}
