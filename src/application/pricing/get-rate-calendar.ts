import { authorize } from "@/application/auth/authorize";
import { branchScope } from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import {
  NightlyPriceResolver,
  parseRateReadWindow,
  type ResolvedNightPrice,
} from "@/domain/pricing";

import type { BaseRateRecord, RatePeriodRecord, RateRepository } from "./ports";

export type RateCalendar = Readonly<{
  baseRate: BaseRateRecord | null;
  periods: readonly RatePeriodRecord[];
  calendar: readonly ResolvedNightPrice[];
}>;

const NOT_FOUND = "This listing was not found.";

export class GetRateCalendar {
  constructor(private readonly rates: RateRepository) {}

  async execute(
    staff: StaffPrincipal | null,
    roomTypeId: string,
    query: unknown,
  ): Promise<Result<RateCalendar>> {
    const access = authorize(staff, "pricing:read");
    if (!access.ok) return access;
    const window = parseRateReadWindow(query);
    if (!window.ok) {
      return invalid("Choose a valid rate window.", window.issues);
    }
    const visible = branchScope(access.value);
    if (!(await this.rates.findRoomTypeVisible(roomTypeId, visible))) {
      return failure("NOT_FOUND", NOT_FOUND);
    }
    const read = await this.rates.read(roomTypeId, window.value);
    const resolved = NightlyPriceResolver.resolve({
      stay: window.value,
      baseRate: read.baseRate?.amount ?? null,
      periods: read.periods.map(({ id, range, amount, active, label }) => ({
        id,
        range,
        amount,
        active,
        label,
      })),
    });
    return success({ ...read, calendar: resolved.nights });
  }
}
