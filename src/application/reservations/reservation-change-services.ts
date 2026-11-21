import type { ServiceOfferingRecord } from "@/application/services";
import {
  invalid,
  serviceUnavailable,
  success,
  type Result,
} from "@/application/shared/result";
import type { QuoteServiceInput } from "@/domain/pricing";
import type { ReservationChangePlan } from "@/domain/reservations";
import { selectService, validateRequestedVehicles } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import type { StayRange } from "@/domain/shared/stay-range";
import type { StoredReservationSnapshot } from "./ports";

type PricedService = Readonly<{
  pricing: QuoteServiceInput;
  details: string | null;
  occupancyEffectiveFrom: LocalDate | null;
}>;

/** PR-11. Only a newly added service takes its price from a current offering. */
export function priceChangedServices(
  stay: StayRange,
  previous: StoredReservationSnapshot["serviceLines"],
  plan: ReservationChangePlan,
  offerings: readonly ServiceOfferingRecord[],
  today: LocalDate,
  guests: Readonly<{ adults: number; children: number }>,
): Result<readonly PricedService[]> {
  const started = stay.checkIn.compare(today) < 0;
  const remainingOldNights = Math.max(0, today.daysUntil(stay.checkOut));
  const consumedNights = stay.nightCount - remainingOldNights;
  const services: PricedService[] = [];
  for (const service of plan.services) {
    if (service.added) {
      const selected = selectService(
        service.request,
        service.index,
        offerings.map((offering) => ({
          ...offering,
          unit: offering.priceUnit,
        })),
      );
      if (!selected.ok)
        return "kind" in selected
          ? serviceUnavailable(selected.kind)
          : invalid("Check the services.", selected.issues);
      services.push({
        pricing: selected.service,
        details: selected.service.details,
        occupancyEffectiveFrom: null,
      });
      continue;
    }
    const line = previous.find((line) => line.kind === service.kind);
    // The plan and pricing both use this locked snapshot.
    if (!line)
      throw new Error("The retained service is missing from the snapshot.");
    if (service.changedVehiclesAt !== null) {
      // Disabling the offering blocks new selections. An existing transfer
      // still uses the branch limit when staff change its number of cars.
      const maximum = offerings.find(
        (offering) => offering.kind === service.kind,
      )?.maxVehicles;
      if (maximum == null) return serviceUnavailable(service.kind);
      const checked = validateRequestedVehicles(
        service.vehicles!,
        maximum,
        service.changedVehiclesAt,
      );
      if (!checked.ok) return invalid("Check the services.", checked.issues);
    }
    const common = {
      kind: line.kind,
      vehicles: service.vehicles,
      unit: line.unit,
      price: Money.create({ amountMinor: line.priceMinor, currency: "USD" }),
      childPrice:
        line.childPriceMinor === null
          ? null
          : Money.create({
              amountMinor: line.childPriceMinor,
              currency: "USD",
            }),
    };
    const effectiveFrom = line.occupancyEffectiveFrom ?? null;
    if (effectiveFrom && today.compare(effectiveFrom) < 0)
      throw new DomainValidationError("Check the branch date.", [
        {
          path: "stay",
          message:
            "The branch date is before the latest service occupancy change.",
        },
      ]);
    if (!started || line.unit !== "PER_PERSON_PER_NIGHT") {
      services.push({
        pricing: common,
        occupancyEffectiveFrom: null,
        details: service.details,
      });
      continue;
    }

    // The stored total consists of already charged nights plus the last
    // headcount on all remaining old nights. Subtract only that latter part.
    const preservedPersonNights = {
      nights: consumedNights,
      adults: line.adultQuantity - line.adults * remainingOldNights,
      children:
        line.childPriceMinor === null
          ? 0
          : line.childQuantity - line.children * remainingOldNights,
    };
    const occupancyChanged =
      line.adults !== guests.adults || line.children !== guests.children;
    services.push({
      pricing: { ...common, preservedPersonNights },
      occupancyEffectiveFrom: occupancyChanged ? today : effectiveFrom,
      details: service.details,
    });
  }
  return success(services);
}
