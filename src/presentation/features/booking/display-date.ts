import type { LocalDate } from "@/domain/shared/local-date";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A branch calendar date, such as "Thu, 3 Dec 2026". */
export function displayDate(day: Pick<LocalDate, "value">) {
  return dateFormat.format(new Date(`${day.value}T00:00:00Z`));
}

/** One night under a stay whose dates and year are already shown. */
export const displayNight = (day: Pick<LocalDate, "value">) =>
  displayDate(day).replace(/ \d{4}$/, "");

/** A branch wall-clock time, "14:00", in 12-hour form: "2:00 PM". */
export function displayTime(time: string) {
  const hours = Number(time.slice(0, 2));
  return `${hours % 12 || 12}${time.slice(2)} ${hours < 12 ? "AM" : "PM"}`;
}

/** A moment on the branch's clock, such as the cancellation deadline. */
export function displayInstant(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
}
