import "server-only";

import {
  ManageCommercialSettings,
  type CommercialSettingsContext,
} from "@/application/commercial";
import { ManageServices, type ServiceContext } from "@/application/services";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaCommercialSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/commercial-settings-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

import { ManageCoupons, type CouponContext } from "@/application/coupons";
import { PrismaCouponRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/coupon-repository";

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
