import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";

/** A positive, half-open date range. Public booking limits are separate. */
export class StayRange {
  private constructor(
    readonly checkIn: LocalDate,
    readonly checkOut: LocalDate,
  ) {
    Object.freeze(this);
  }

  static create(checkIn: LocalDate, checkOut: LocalDate): StayRange {
    if (checkOut.compare(checkIn) <= 0) {
      throw new DomainValidationError(
        "The stay must contain at least one night.",
        [{ path: "checkOut", message: "Check-out must be after check-in." }],
      );
    }
    return new StayRange(checkIn, checkOut);
  }

  get nightCount(): number {
    return this.checkIn.daysUntil(this.checkOut);
  }

  *nights(): IterableIterator<LocalDate> {
    for (
      let night = this.checkIn;
      night.compare(this.checkOut) < 0;
      night = night.addDays(1)
    ) {
      yield night;
    }
  }

  overlaps(other: StayRange): boolean {
    return (
      this.checkIn.compare(other.checkOut) < 0 &&
      other.checkIn.compare(this.checkOut) < 0
    );
  }
}
