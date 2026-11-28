import { formatMoney } from "@/presentation/format/money";
import {
  choiceCard,
  choiceInput,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
  selectArrow,
} from "@/presentation/site/classes";

import { serviceName } from "./extras-answer";
import type { OfferedService, ServiceKind } from "./extras-state";

export const FLIGHT_DETAILS_LIMIT = 300;

/** How many people one car takes, on every branch (Q-101). A hint only. */
const PEOPLE_PER_CAR = 2;

function carCapacity(cars: number) {
  const subject = cars === 1 ? "1 car takes" : `${cars} cars take`;
  return `${subject} up to ${cars * PEOPLE_PER_CAR} people.`;
}

/** The price in words, by the unit staff chose (SV-3). Before VAT. */
export function servicePrice({ unit, price, childPrice }: OfferedService) {
  const amount = formatMoney(price);
  const child = (suffix: string) =>
    childPrice
      ? `${formatMoney(childPrice)} per child${suffix}`
      : "children are not charged";
  switch (unit) {
    case "PER_BOOKING":
      return `${amount} per booking`;
    case "PER_NIGHT":
      return `${amount} per night`;
    case "PER_VEHICLE":
      return `${amount} per car`;
    case "PER_PERSON":
      return `${amount} per adult, ${child("")}`;
    case "PER_PERSON_PER_NIGHT":
      return `${amount} per adult per night, ${child(" per night")}`;
  }
}

/**
 * The branch's extras, none chosen in advance (SV-2). The airport transfer asks
 * for the cars whatever its price unit, because the driver needs them (Q-82).
 */
export function ServicesPicker({
  services,
  maxVehicles,
  bookedVehicles = null,
  breakfast,
  transfer,
  cars,
  flightDetails,
  carsError,
  flightError,
  onToggle,
  onCars,
  onFlightDetails,
}: Readonly<{
  /** Only what can be chosen now. */
  services: readonly OfferedService[];
  maxVehicles: number | null;
  /** An existing booking can keep its count if the offer changed. */
  bookedVehicles?: number | null;
  breakfast: boolean;
  transfer: boolean;
  cars: number;
  flightDetails: string;
  carsError: string | null;
  flightError: string | null;
  onToggle: (kind: ServiceKind, chosen: boolean) => void;
  onCars: (cars: number) => void;
  onFlightDetails: (value: string) => void;
}>) {
  if (services.length === 0) return null;
  const carOptions = Array.from(
    { length: maxVehicles ?? 0 },
    (_, index) => index + 1,
  );
  if (bookedVehicles !== null && bookedVehicles > carOptions.length)
    carOptions.push(bookedVehicles);

  return (
    <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
      <legend className={`${fieldLabel} mb-1 p-0`}>Extras (optional)</legend>
      <p className={fieldHelp}>Prices are before VAT.</p>
      {services.map((service) => {
        const { kind } = service;
        const chosen = kind === "BREAKFAST" ? breakfast : transfer;
        return (
          <div key={kind} className="grid min-w-0 gap-3">
            <label className={choiceCard}>
              <input
                type="checkbox"
                name={kind}
                checked={chosen}
                className={choiceInput}
                onChange={(event) =>
                  onToggle(kind, event.currentTarget.checked)
                }
              />
              <span className="grid min-w-0">
                <span className="font-medium text-plum-900">
                  {serviceName[kind]}
                </span>
                <span className="text-small text-neutral-600">
                  {servicePrice(service)}
                </span>
              </span>
            </label>
            {kind === "AIRPORT_TRANSFER" && chosen && carOptions.length > 0 && (
              <div className="grid min-w-0 gap-4 border-l-2 border-gold-400 pl-4">
                <p className={fieldHelp}>
                  We pick you up from the airport when you arrive.
                </p>
                <div className={fieldGroup}>
                  <label htmlFor="transfer-cars" className={fieldLabel}>
                    Cars
                  </label>
                  <span className="relative w-full max-w-40">
                    <select
                      id="transfer-cars"
                      value={cars}
                      aria-invalid={carsError ? true : undefined}
                      aria-describedby={
                        carsError
                          ? "transfer-cars-error transfer-cars-help"
                          : "transfer-cars-help"
                      }
                      className={`${fieldControl} appearance-none pr-10`}
                      onChange={(event) =>
                        onCars(Number(event.currentTarget.value))
                      }
                    >
                      {carOptions.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden="true" className={selectArrow} />
                  </span>
                  {carsError && (
                    <p
                      id="transfer-cars-error"
                      role="alert"
                      className={fieldError}
                    >
                      {carsError}
                    </p>
                  )}
                  <p
                    id="transfer-cars-help"
                    aria-live="polite"
                    className={fieldHelp}
                  >
                    {carCapacity(cars)}
                  </p>
                </div>
                <div className={fieldGroup}>
                  <label htmlFor="transfer-flight" className={fieldLabel}>
                    Flight number and arrival time (optional)
                  </label>
                  <input
                    id="transfer-flight"
                    type="text"
                    autoComplete="off"
                    maxLength={FLIGHT_DETAILS_LIMIT}
                    value={flightDetails}
                    aria-invalid={flightError ? true : undefined}
                    aria-describedby={
                      flightError
                        ? "transfer-flight-error transfer-flight-help"
                        : "transfer-flight-help"
                    }
                    className={fieldControl}
                    onChange={(event) =>
                      onFlightDetails(event.currentTarget.value)
                    }
                  />
                  {flightError && (
                    <p id="transfer-flight-error" className={fieldError}>
                      {flightError}
                    </p>
                  )}
                  <p id="transfer-flight-help" className={fieldHelp}>
                    For example: MS 985, arriving 14:30.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
