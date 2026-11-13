import { DomainValidationError } from "@/domain/shared/domain-error";

/**
 * How a service price is multiplied (ADR 027 as amended 2026-11-11, SV-3).
 * Staff choose the unit per branch and service; nothing here is a price.
 */
export const SERVICE_PRICE_UNITS = [
  "PER_BOOKING",
  "PER_NIGHT",
  "PER_PERSON",
  "PER_PERSON_PER_NIGHT",
] as const;
export type ServicePriceUnit = (typeof SERVICE_PRICE_UNITS)[number];

export type ServiceQuantity = Readonly<{ adults: number; children: number }>;

export function isPersonUnit(unit: ServicePriceUnit) {
  return unit === "PER_PERSON" || unit === "PER_PERSON_PER_NIGHT";
}

const invalid = (path: string, message: string) =>
  new DomainValidationError("The service quantity input is invalid.", [
    { path, message },
  ]);

/**
 * Adult and child quantities that multiply the adult and child price.
 * Non person units charge the adult price once (per booking) or once per
 * night, and carry no child quantity.
 */
export function serviceQuantity(
  unit: ServicePriceUnit,
  guests: Readonly<{ adults: number; children: number }>,
  nights: number,
): ServiceQuantity {
  if (!Number.isSafeInteger(guests.adults) || guests.adults < 1)
    throw invalid("guests.adults", "Use at least one adult.");
  if (!Number.isSafeInteger(guests.children) || guests.children < 0)
    throw invalid("guests.children", "Use a nonnegative safe integer.");
  if (!Number.isSafeInteger(nights) || nights < 1)
    throw invalid("nights", "Use at least one night.");
  switch (unit) {
    case "PER_BOOKING":
      return { adults: 1, children: 0 };
    case "PER_NIGHT":
      return { adults: nights, children: 0 };
    case "PER_PERSON":
      return { adults: guests.adults, children: guests.children };
    case "PER_PERSON_PER_NIGHT":
      return {
        adults: guests.adults * nights,
        children: guests.children * nights,
      };
    default:
      throw invalid("unit", "Use a supported price unit.");
  }
}
