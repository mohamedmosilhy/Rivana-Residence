import type { BranchScope } from "@/application/auth/authorize-branch";
import type { Result } from "@/application/shared/result";
import type { DateRatePeriod } from "@/domain/pricing";
import type { Money } from "@/domain/shared/money";
import type { StayRange } from "@/domain/shared/stay-range";

export type RoomTypeRateScope = Readonly<{ id: string; branchId: string }>;

export type BaseRateRecord = Readonly<{
  roomTypeId: string;
  amount: Money;
  updatedAt: Date;
}>;

export type RatePeriodRecord = DateRatePeriod &
  Readonly<{
    roomTypeId: string;
    /** Internal ownership for authorization and audit, not part of the DTO. */
    branchId: string;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type RateReadModel = Readonly<{
  baseRate: BaseRateRecord | null;
  periods: readonly RatePeriodRecord[];
}>;

export type BaseRateWrite = Readonly<{
  roomTypeId: string;
  amount: Money;
  updatedById: string;
  at: Date;
}>;

export type BaseRateWriteOutcome = Readonly<{
  before: BaseRateRecord | null;
  after: BaseRateRecord;
  changed: boolean;
}>;

export type RatePeriodCreate = Readonly<{
  id: string;
  roomTypeId: string;
  range: StayRange;
  amount: Money;
  label: string | null;
  updatedById: string;
  at: Date;
}>;

export type RatePeriodChange = Readonly<{
  range?: StayRange;
  amount?: Money;
  label?: string | null;
  active?: boolean;
  updatedById: string;
  at: Date;
}>;

export interface RateRepository {
  findRoomTypeVisible(
    roomTypeId: string,
    visible: BranchScope,
  ): Promise<RoomTypeRateScope | null>;
  read(roomTypeId: string, window: StayRange): Promise<RateReadModel>;
  findPeriodVisible(
    id: string,
    visible: BranchScope,
  ): Promise<RatePeriodRecord | null>;
  lockPeriodVisible(
    id: string,
    visible: BranchScope,
  ): Promise<Result<RatePeriodRecord | null>>;
  setBaseRate(
    input: BaseRateWrite,
    visible: BranchScope,
  ): Promise<Result<BaseRateWriteOutcome>>;
  createPeriod(input: RatePeriodCreate): Promise<Result<RatePeriodRecord>>;
  updatePeriod(
    id: string,
    change: RatePeriodChange,
  ): Promise<Result<RatePeriodRecord>>;
}
