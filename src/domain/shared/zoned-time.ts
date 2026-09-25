// Converts between UTC instants and wall-clock times in a named time zone,
// using only Intl. Promotion schedules are entered in the property's zone
// (e.g. Africa/Cairo, which observes daylight saving time) and stored in UTC.

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(timeZone: string, instant: number) {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
  }
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >;
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
function offsetAt(timeZone: string, instant: number) {
  const p = partsIn(timeZone, instant);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses `YYYY-MM-DDTHH:mm` (an `<input type="datetime-local">` value) as a
 * wall-clock time in `timeZone`. Returns null for malformed or impossible
 * dates. A time skipped by a daylight-saving jump resolves to the instant
 * just after the jump.
 */
export function zonedLocalToUtc(value: string, timeZone: string): Date | null {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallClock);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  // Two passes settle the offset on either side of a DST transition.
  let instant = wallClock - offsetAt(timeZone, wallClock);
  instant = wallClock - offsetAt(timeZone, instant);
  return new Date(instant);
}

/** Formats an instant as `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone`. */
export function utcToZonedLocal(value: Date, timeZone: string) {
  const p = partsIn(timeZone, value.getTime());
  const pad = (number: number, length = 2) =>
    String(number).padStart(length, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
