import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import type { ReservationNightSnapshot } from "./reservation";

/** Q-19/PR-11: callers match the old unit line first, then load current rates only for changed nights. */
export function planNightlyRepricing(
  previous: Readonly<{
    roomTypeId: string;
    nights: readonly ReservationNightSnapshot[];
  }> | null,
  requested: Readonly<{ roomTypeId: string; stay: StayRange }>,
): Readonly<{
  retained: readonly ReservationNightSnapshot[];
  needsCurrentPrice: readonly LocalDate[];
}> {
  const fail = () => {
    throw new DomainValidationError("The stay modification is invalid.", [
      {
        path: "nights",
        message: "Supply unique dated snapshots and a valid requested stay.",
      },
    ]);
  };
  if (!requested.roomTypeId || !(requested.stay instanceof StayRange)) fail();
  const oldNights = new Map<string, ReservationNightSnapshot>();
  if (previous !== null) {
    if (!previous.roomTypeId) fail();
    for (const entry of previous.nights) {
      if (
        !(entry.night instanceof LocalDate) ||
        oldNights.has(entry.night.value)
      )
        fail();
      oldNights.set(entry.night.value, entry);
    }
  }
  const retained: ReservationNightSnapshot[] = [],
    needsCurrentPrice: LocalDate[] = [];
  for (const night of requested.stay.nights()) {
    const existing =
      previous?.roomTypeId === requested.roomTypeId
        ? oldNights.get(night.value)
        : undefined;
    if (existing) retained.push(existing);
    else needsCurrentPrice.push(night);
  }
  return Object.freeze({
    retained: Object.freeze(retained),
    needsCurrentPrice: Object.freeze(needsCurrentPrice),
  });
}
