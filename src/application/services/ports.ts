import type { Result } from "@/application/shared/result";
import type {
  ServiceKind,
  ServiceOfferingInput,
  ServicePriceUnit,
} from "@/domain/services";
import type { Money } from "@/domain/shared/money";

/** A stored offering for one branch and kind. */
export type ServiceOfferingRecord = Readonly<{
  id: string;
  kind: ServiceKind;
  priceUnit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
  active: boolean;
  description: string | null;
  updatedAt: Date;
}>;

/** One row of the S35 list; `offering` is null when the branch has none yet. */
export type ServiceCatalogEntry = Readonly<{
  kind: ServiceKind;
  offering: ServiceOfferingRecord | null;
}>;

export type ServiceOfferingWrite = Readonly<{
  /** Used only when the offering does not exist yet. */
  id: string;
  branchId: string;
  kind: ServiceKind;
  input: ServiceOfferingInput;
  updatedById: string;
  /**
   * Called once the lock (or, for a first insert, the unique key wait) is
   * settled, so audit order follows commit order. A first insert reads it
   * just before the insert.
   */
  now: () => Date;
}>;

export type ServiceOfferingWriteOutcome = Readonly<{
  before: ServiceOfferingRecord | null;
  after: ServiceOfferingRecord;
  changed: boolean;
}>;

export interface ServiceOfferingRepository {
  branchExists(branchId: string): Promise<boolean>;
  listByBranch(branchId: string): Promise<readonly ServiceOfferingRecord[]>;
  /**
   * Creates or replaces the offering under a row (or, when absent, key) lock
   * and reports the committed before and after. Only meaningful in a
   * transaction. TRY_AGAIN when the lock stays busy past the lock timeout.
   */
  upsert(
    write: ServiceOfferingWrite,
  ): Promise<Result<ServiceOfferingWriteOutcome>>;
}
