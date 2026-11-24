import "server-only";

import {
  ManageCommercialSettings,
  type CommercialSettingsContext,
} from "@/application/commercial";
import { ManageServices, type ServiceContext } from "@/application/services";
import { QuoteBooking } from "@/application/quotes";
import { isPaymentGatewayReady } from "@/composition/provider-readiness";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaPublicListingReader } from "@/infrastructure/db/prisma/repositories/public-listing-reader";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";
import { PrismaCouponRedemptionReader } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-redemption-repository";
import { PrismaCouponRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-repository";
import { PrismaCommercialSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/commercial-settings-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

import { ManageCoupons, type CouponContext } from "@/application/coupons";

const clock = { now: () => new Date() };

export function manageServices() {
  const client = getPrisma();
  return new ManageServices({
    unitOfWork: new PrismaReservationUnitOfWork<ServiceContext>(
      client,
      (transaction) => ({
        services: new PrismaServiceOfferingRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    services: new PrismaServiceOfferingRepository(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

export function manageCommercialSettings() {
  const client = getPrisma();
  return new ManageCommercialSettings({
    unitOfWork: new PrismaReservationUnitOfWork<CommercialSettingsContext>(
      client,
      (transaction) => ({
        settings: new PrismaCommercialSettingsRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    settings: new PrismaCommercialSettingsRepository(client),
    clock,
  });
}

export function manageCoupons() {
  const client = getPrisma();
  return new ManageCoupons({
    unitOfWork: new PrismaReservationUnitOfWork<CouponContext>(
      client,
      (transaction) => ({
        coupons: new PrismaCouponRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    coupons: new PrismaCouponRepository(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

/** P6 reads branch, listings, inventory, prices, services, coupon and VAT afresh. */
export function quoteBooking() {
  const client = getPrisma();
  return new QuoteBooking({
    branches: new PrismaBranchRepository(client),
    rooms: new PrismaPublicListingReader(client),
    inventory: new PrismaInventoryReader(
      client,
      new PrismaReservationConsumptionReader(client),
    ),
    rates: new PrismaRateRepository(client),
    services: new PrismaServiceOfferingRepository(client),
    coupons: new PrismaCouponRepository(client),
    // Phone blind by design: public P6 never evaluates the per phone limit
    // (M8-T7b); the verified phone is checked inside the booking transaction.
    redemptions: new PrismaCouponRedemptionReader(client, {
      phoneAware: false,
    }),
    settings: new PrismaCommercialSettingsRepository(client),
    paymentReady: isPaymentGatewayReady(),
    clock,
  });
}
