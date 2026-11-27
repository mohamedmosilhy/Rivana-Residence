import { factTerm, factValue } from "@/presentation/site/classes";

import { displayDate, displayTime } from "./display-date";

/** The branch's check-in and check-out times (Q-102), as "HH:MM". */
export type StayTimes = Readonly<{
  checkInTime: string | null;
  checkInUntilTime: string | null;
  checkOutTime: string | null;
  checkOutFromTime: string | null;
}>;

const range = (from: string, until: string) =>
  `${displayTime(from)} – ${displayTime(until)}`;

/** When the guest may arrive; null when the branch has set no time. */
function arrival({ checkInTime, checkInUntilTime }: StayTimes) {
  if (!checkInTime) return null;
  return checkInUntilTime
    ? range(checkInTime, checkInUntilTime)
    : `From ${displayTime(checkInTime)}`;
}

/** When the guest must leave; null when the branch has set no time. */
function departure({ checkOutFromTime, checkOutTime }: StayTimes) {
  if (!checkOutTime) return null;
  return checkOutFromTime
    ? range(checkOutFromTime, checkOutTime)
    : `Until ${displayTime(checkOutTime)}`;
}

/**
 * Check-in and check-out, each as its date and the hotel's hours. Place it
 * inside a `dl`. The times are the branch's own, so nothing is converted.
 */
export function StayDates({
  stay,
  times,
}: Readonly<{
  stay: Readonly<{ checkIn: string; checkOut: string }>;
  times: StayTimes;
}>) {
  const ends = [
    ["Check-in", stay.checkIn, arrival(times)],
    ["Check-out", stay.checkOut, departure(times)],
  ] as const;
  return ends.map(([term, day, hours]) => (
    <div key={term} className="grid min-w-0 content-start gap-0.5">
      <dt className={factTerm}>{term}</dt>
      <dd className={`${factValue} font-medium`}>
        <time dateTime={day}>{displayDate({ value: day })}</time>
      </dd>
      {hours && <dd className="m-0 text-small text-neutral-600">{hours}</dd>}
    </div>
  ));
}
