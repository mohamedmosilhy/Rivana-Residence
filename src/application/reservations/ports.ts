import type { Result } from "@/application/shared/result";

/**
 * Transaction boundary shared by reservation era workflows. The context is
 * assembled from ports bound to one database transaction.
 */
export interface ReservationUnitOfWork<Context> {
  run<T>(
    operation: (context: Context) => Promise<Result<T>>,
  ): Promise<Result<T>>;
}
