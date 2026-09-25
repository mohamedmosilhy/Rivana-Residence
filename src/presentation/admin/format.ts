export const ROLE_LABELS = {
  ADMIN: "Administrator",
  EDITOR: "Editor",
} as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Formats a timestamp in the property's time zone, with the zone named. */
export function formatDateTime(value: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      // `timeZoneName` cannot be combined with dateStyle/timeStyle.
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(value);
}

export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
