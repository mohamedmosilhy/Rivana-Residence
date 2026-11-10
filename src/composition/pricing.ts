import "server-only";

import {
  GetRateCalendar,
  ManageRates,
  type RateContext,
} from "@/application/pricing";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

const clock = { now: () => new Date() };

export function getRateCalendar() {
  return new GetRateCalendar(new PrismaRateRepository(getPrisma()));
}

export function manageRates() {
  const client = getPrisma();
  return new ManageRates({
    unitOfWork: new PrismaReservationUnitOfWork<RateContext>(
      client,
      (transaction) => ({
        rates: new PrismaRateRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    rates: new PrismaRateRepository(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}
