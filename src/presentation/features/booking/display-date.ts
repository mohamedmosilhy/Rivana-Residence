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
