import type { AvailabilityQueryDto } from "@/contracts/api/v1/availability";

/** URLSearchParams retains duplicates that the shared wrapper flattens. */
export function duplicateAvailabilityFields(request: Request) {
  const params = new URL(request.url).searchParams;
  const errors: Record<string, string[]> = {};
  for (const key of new Set(params.keys())) {
    if (params.getAll(key).length > 1)
      errors[key] = ["Supply this parameter once."];
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

const number = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value);

/** Transport conversion only; invalid numeric values stay invalid for 422. */
export function availabilityInput(query: AvailabilityQueryDto) {
  return {
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    adults: number(query.adults),
    children: number(query.children),
    ...(query.unitsRequested === undefined
      ? {}
      : { unitsRequested: number(query.unitsRequested) }),
  };
}
