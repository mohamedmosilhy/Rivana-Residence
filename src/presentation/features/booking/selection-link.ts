// The addresses that carry a booking selection between the results page and the
// details page (spec 0007): dates and `u=slug.adults.children,…`, one entry per
// unit. No personal data. Used in the browser too, so it imports no validator.

export type SelectionStay = Readonly<{ checkIn: string; checkOut: string }>;
export type SelectionLine = Readonly<{
  roomSlug: string;
  occupancy: Readonly<{ adults: number; children: number }>;
}>;
/** Why the guest was sent back to the results. */
export type SelectionNotice = "unavailable" | "selection";

export function encodeSelection(lines: readonly SelectionLine[]) {
  return lines
    .map(
      ({ roomSlug, occupancy }) =>
        `${roomSlug}.${occupancy.adults}.${occupancy.children}`,
    )
    .join(",");
}

/**
 * The shape only: null when any entry is malformed. Callers still check the
 * listing, the guest limits, and the number of units.
 */
export function decodeSelection(value: string): SelectionLine[] | null {
  const lines: SelectionLine[] = [];
  for (const entry of value.split(",")) {
    const [roomSlug, adults, children, ...rest] = entry.split(".");
    if (
      !roomSlug ||
      rest.length > 0 ||
      !/^\d{1,2}$/.test(adults ?? "") ||
      !/^\d{1,2}$/.test(children ?? "")
    )
      return null;
    lines.push({
      roomSlug,
      occupancy: { adults: Number(adults), children: Number(children) },
    });
  }
  return lines;
}

export function bookingDetailsHref(
  branchSlug: string,
  { checkIn, checkOut }: SelectionStay,
  lines: readonly SelectionLine[],
) {
  const query = new URLSearchParams({
    checkIn,
    checkOut,
    u: encodeSelection(lines),
  });
  return `/${branchSlug}/book/details?${query}`;
}

/**
 * The results for the same dates with the selection to rebuild. The search is
 * for one unit, so it uses the smallest party in the selection: every selected
 * listing still fits it.
 */
export function bookingResultsHref(
  branchSlug: string,
  stay: SelectionStay | null,
  lines: readonly SelectionLine[],
  notice?: SelectionNotice,
) {
  const query = new URLSearchParams();
  if (stay) {
    const smallest = (field: "adults" | "children", fallback: number) =>
      lines.length > 0
        ? Math.min(...lines.map((line) => line.occupancy[field]))
        : fallback;
    query.set("checkIn", stay.checkIn);
    query.set("checkOut", stay.checkOut);
    query.set("adults", String(smallest("adults", 1)));
    query.set("children", String(smallest("children", 0)));
    if (lines.length > 0) query.set("u", encodeSelection(lines));
  }
  if (notice) query.set("notice", notice);
  return `/${branchSlug}/book?${query}`;
}
