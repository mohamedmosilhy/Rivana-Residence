import "server-only";

import type { ReservationUnitOfWork } from "@/application/reservations";
import type { ApplicationError, Result } from "@/application/shared/result";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export const RESERVATION_TRANSACTION_TIMEOUT_MS = 10_000;

class ResultAbort extends Error {
  constructor(readonly applicationError: ApplicationError) {
    super("Rollback requested by a failed application result.");
    this.name = "ResultAbort";
  }
}

export type TransactionContextFactory<Context> = (
  transaction: Prisma.TransactionClient,
) => Context;

/** Prisma interactive transaction adapter for reservation era workflows. */
export class PrismaReservationUnitOfWork<Context>
  implements ReservationUnitOfWork<Context>
{
  constructor(
    private readonly client: PrismaClient,
    private readonly contextFactory: TransactionContextFactory<Context>,
  ) {}

  async run<T>(
    operation: (context: Context) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    try {
      return await this.client.$transaction(
        async (transaction) => {
          const result = await operation(this.contextFactory(transaction));
          if (!result.ok) throw new ResultAbort(result.error);
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: RESERVATION_TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (error instanceof ResultAbort) {
        return { ok: false, error: error.applicationError };
      }
      throw error;
    }
  }
}
