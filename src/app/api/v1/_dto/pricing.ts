import type {
  RateCalendar as RateCalendarModel,
  RatePeriodRecord,
} from "@/application/pricing";
import type { NightPriceDto, RatePeriodDto } from "@/contracts/api/v1/pricing";
import type { ResolvedNightPrice } from "@/domain/pricing";
import type { Money } from "@/domain/shared/money";

export const money = (value: Money) => ({
  amountMinor: value.amountMinor,
  currency: "USD" as const,
});

export function ratePeriod(record: RatePeriodRecord): RatePeriodDto {
  return {
    id: record.id,
    roomTypeId: record.roomTypeId,
    startDate: record.range.checkIn.value,
    endDate: record.range.checkOut.value,
    amount: money(record.amount),
    label: record.label,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function nightPrice(record: ResolvedNightPrice): NightPriceDto {
  return {
    night: record.night.value,
    amount: record.amount ? money(record.amount) : null,
    source: record.source,
    periodId: record.periodId,
    label: record.label,
  };
}

export function rateCalendar(model: RateCalendarModel) {
  return {
    baseRate: model.baseRate ? money(model.baseRate.amount) : null,
    periods: model.periods.map(ratePeriod),
    calendar: model.calendar.map(nightPrice),
  };
}
