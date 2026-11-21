import type { LocalDate } from "@/domain/shared/local-date";

/** ADR 019. Keep the reservation link valid until 30 days after check-out. */
export function manageTokenExpiry(checkOut: LocalDate): Date {
  return new Date(Date.parse(`${checkOut.value}T00:00:00Z`) + 30 * 86_400_000);
}
