import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysBeforeYear(year: number) {
  const previous = year - 1;
  return (
    365 * previous +
    Math.floor(previous / 4) -
    Math.floor(previous / 100) +
    Math.floor(previous / 400)
  );
}

function isCalendarDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return (
    value.length === 10 &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine(isCalendarDate, "Use a real calendar date between 0001 and 9999.");

const LAST_DAY = daysBeforeYear(10000) - 1;

/** Calendar date only. Arithmetic uses Gregorian day numbers, never instants. */
export class LocalDate {
  private constructor(
    readonly value: string,
    private readonly dayNumber: number,
  ) {
    Object.freeze(this);
  }

  static parse(input: unknown): LocalDate {
    const parsed = localDateSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainValidationError(
        "Enter a valid calendar date.",
        issuesFromZod(parsed.error.issues),
      );
    }
    const year = Number(parsed.data.slice(0, 4));
    const month = Number(parsed.data.slice(5, 7));
    let dayNumber = daysBeforeYear(year) + Number(parsed.data.slice(8, 10)) - 1;
    for (let previous = 1; previous < month; previous += 1) {
      dayNumber += daysInMonth(year, previous);
    }
    return new LocalDate(parsed.data, dayNumber);
  }

  compare(other: LocalDate): -1 | 0 | 1 {
    return this.dayNumber < other.dayNumber
      ? -1
      : this.dayNumber > other.dayNumber
        ? 1
        : 0;
  }

  daysUntil(other: LocalDate): number {
    return other.dayNumber - this.dayNumber;
  }

  addDays(days: number): LocalDate {
    const target = this.dayNumber + days;
    if (!Number.isSafeInteger(days) || target < 0 || target > LAST_DAY) {
      throw new DomainValidationError("The calendar day offset is invalid.", [
        { path: "days", message: "Use whole days within years 0001 to 9999." },
      ]);
    }

    // Find the year without walking every date in a potentially long range.
    let first = 1;
    let last = 9999;
    while (first < last) {
      const middle = Math.floor((first + last + 1) / 2);
      if (daysBeforeYear(middle) <= target) first = middle;
      else last = middle - 1;
    }
    const year = first;
    let remaining = target - daysBeforeYear(year);
    let month = 1;
    while (remaining >= daysInMonth(year, month)) {
      remaining -= daysInMonth(year, month);
      month += 1;
    }
    const value = [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(remaining + 1).padStart(2, "0"),
    ].join("-");
    return new LocalDate(value, target);
  }

  toString(): string {
    return this.value;
  }
}
