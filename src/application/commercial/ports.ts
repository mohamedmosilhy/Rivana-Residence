import type { Result } from "@/application/shared/result";

export type CommercialSettingsRecord = Readonly<{
  vatRateBasisPoints: number;
  updatedAt: Date;
}>;

export type CommercialSettingsWrite = Readonly<{
  vatRateBasisPoints: number;
  updatedById: string;
  /** Read after the row lock is held, so audit order matches lock order. */
  now: () => Date;
}>;

export type CommercialSettingsWriteOutcome = Readonly<{
  before: CommercialSettingsRecord;
  after: CommercialSettingsRecord;
  changed: boolean;
}>;

export interface CommercialSettingsRepository {
  /** The singleton row. It always exists: the migration seeds it at 15%. */
  read(): Promise<CommercialSettingsRecord>;
  /**
   * Locks the singleton row, applies the rate, and reports the committed
   * before and after. Only meaningful in a transaction. TRY_AGAIN when the
   * row stays locked past the lock timeout.
   */
  update(
    write: CommercialSettingsWrite,
  ): Promise<Result<CommercialSettingsWriteOutcome>>;
}
