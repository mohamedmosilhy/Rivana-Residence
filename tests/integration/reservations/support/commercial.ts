import type { AuditLog } from "@/application/audit";
import {
  ManageCommercialSettings,
  type CommercialSettingsContext,
} from "@/application/commercial";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { ManageServices, type ServiceContext } from "@/application/services";
import type { Result } from "@/application/shared/result";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaCommercialSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/commercial-settings-repository";
import { PrismaServiceOfferingRepository } from "@/infrastructure/db/prisma/repositories/reservations/commercial/service-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

type Options = Readonly<{
  audit?: (inner: AuditLog) => AuditLog;
  /** Receives the PostgreSQL backend pid once the transaction has started. */
  onBackend?: (pid: number) => void;
}>;

type Transaction = ConstructorParameters<
  typeof PrismaReservationUnitOfWork<unknown>
>[1] extends (transaction: infer T) => unknown
  ? T
  : never;

/** Wraps a unit of work so the test can observe its backend lock waits. */
function withBackendProbe<Context>(
  client: PrismaClient,
  options: Options,
  build: (transaction: Transaction, audit: AuditLog) => Context,
): ReservationUnitOfWork<Context> {
  let current: Transaction | null = null;
  const inner = new PrismaReservationUnitOfWork<Context>(
    client,
    (transaction) => {
      current = transaction;
      const audit = new PrismaAuditLog(transaction);
      return build(transaction, options.audit ? options.audit(audit) : audit);
    },
  );
  if (!options.onBackend) return inner;
  return {
    run: <T>(
      operation: (context: Context) => Promise<Result<T>>,
    ): Promise<Result<T>> =>
      inner.run(async (context) => {
        const [backend] = await current!.$queryRaw<
          Readonly<{ pid: number }>[]
        >`SELECT pg_backend_pid()::int AS pid`;
        options.onBackend!(backend!.pid);
        return operation(context);
      }),
  };
}

/** Production M7-T4 wiring on an arbitrary (independent) client. */
export function commercialUseCases(
  client: PrismaClient,
  options: Options = {},
) {
  const clock = { now: () => new Date() };
  return {
    services: new ManageServices({
      unitOfWork: withBackendProbe<ServiceContext>(
        client,
        options,
        (transaction, audit) => ({
          services: new PrismaServiceOfferingRepository(transaction),
          audit,
        }),
      ),
      services: new PrismaServiceOfferingRepository(client),
      clock,
      ids: new Cuid2IdGenerator(),
    }),
    settings: new ManageCommercialSettings({
      unitOfWork: withBackendProbe<CommercialSettingsContext>(
        client,
        options,
        (transaction, audit) => ({
          settings: new PrismaCommercialSettingsRepository(transaction),
          audit,
        }),
      ),
      settings: new PrismaCommercialSettingsRepository(client),
      clock,
    }),
  };
}
