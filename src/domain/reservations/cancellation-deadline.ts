import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { isValidTimeZone, zonedLocalToUtc } from "@/domain/shared/zoned-time";

const DAY = 24 * 60 * 60_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DeadlineBranch = Readonly<{
  timeZone: string;
  checkInTime: string | null;
}>;

/** CX-1: guests may request until 24 hours before the branch check-in time on the arrival date. */
export const CancellationDeadline = Object.freeze({
  /**
   * The deadline instant, or null when the branch has no check-in time (no
   * online requests). It is an absolute 24 hours, so a daylight-saving change
   * between the two instants moves the local wall-clock time, not the length.
   */
  for(branch: DeadlineBranch, checkIn: LocalDate): Date | null {
    if (!(checkIn instanceof LocalDate) || !isValidTimeZone(branch.timeZone))
      throw new DomainValidationError("The deadline input is invalid.", [
        {
          path: "branch",
          message: "Supply a check-in date and a valid branch time zone.",
        },
      ]);
    if (branch.checkInTime === null) return null;
    if (!TIME_PATTERN.test(branch.checkInTime))
      throw new DomainValidationError("The check-in time is invalid.", [
        { path: "checkInTime", message: "Supply a time as HH:mm." },
      ]);
    const arrival = zonedLocalToUtc(
      `${checkIn.toString()}T${branch.checkInTime}`,
      branch.timeZone,
    );
    if (!arrival)
      throw new DomainValidationError("The check-in time is invalid.", [
        { path: "checkIn", message: "Supply a real check-in date and time." },
      ]);
    return new Date(arrival.getTime() - DAY);
  },

  /**
   * Requests are allowed strictly before the deadline. A booking made inside
   * the window therefore never qualifies (Q-64), and no check-in time never does.
   */
  isOpen(deadline: Date | null, now: Date): boolean {
    if (!Number.isFinite(now.getTime()))
      throw new DomainValidationError("The instant is invalid.", [
        { path: "now", message: "Supply a valid UTC instant." },
      ]);
    return deadline !== null && now.getTime() < deadline.getTime();
  },
});
