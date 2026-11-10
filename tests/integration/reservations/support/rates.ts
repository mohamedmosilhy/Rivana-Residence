import type { AuditLog } from "@/application/audit";
import {
  GetRateCalendar,
  ManageRates,
  type RateContext,
} from "@/application/pricing";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaRateRepository } from "@/infrastructure/db/prisma/repositories/reservations/pricing/rate-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

type Options = Readonly<{
  audit?: (inner: AuditLog) => AuditLog;
  clock?: () => Date;
  /** Receives the PostgreSQL backend pid once the transaction has started. */
  onBackend?: (pid: number) => void;
}>;

/** Production M6-T7 wiring on an arbitrary client, with audit failure hooks. */
export function rateUseCases(client: PrismaClient, options: Options = {}) {
  let current:
    | Parameters<
        ConstructorParameters<
          typeof PrismaReservationUnitOfWork<RateContext>
        >[1]
      >[0]
    | null = null;
  const inner = new PrismaReservationUnitOfWork<RateContext>(
    client,
    (transaction) => {
      current = transaction;
      const audit = new PrismaAuditLog(transaction);
      return {
        rates: new PrismaRateRepository(transaction),
        audit: options.audit ? options.audit(audit) : audit,
      };
    },
  );
  const unitOfWork = options.onBackend
    ? {
        run: <T>(
          operation: Parameters<typeof inner.run<T>>[0],
        ): ReturnType<typeof inner.run<T>> =>
          inner.run(async (context) => {
            const [backend] = await current!.$queryRaw<
              Readonly<{ pid: number }>[]
            >`SELECT pg_backend_pid()::int AS pid`;
            options.onBackend!(backend!.pid);
            return operation(context);
          }),
      }
    : inner;
  return {
    calendar: new GetRateCalendar(new PrismaRateRepository(client)),
    manage: new ManageRates({
      unitOfWork,
      rates: new PrismaRateRepository(client),
      clock: { now: options.clock ?? (() => new Date()) },
      ids: new Cuid2IdGenerator(),
    }),
  };
}
