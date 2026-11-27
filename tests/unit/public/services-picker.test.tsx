import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { OfferedService } from "@/presentation/features/booking/extras-state";
import {
  servicePrice,
  ServicesPicker,
} from "@/presentation/features/booking/services-picker";

import { bookingServices, usd } from "./booking-extras-fixtures";

const service = (
  unit: OfferedService["unit"],
  child: number | null = null,
): OfferedService => ({
  kind: "BREAKFAST",
  unit,
  price: usd(1000),
  childPrice: child === null ? null : usd(child),
});

it.each([
  [service("PER_BOOKING"), "$10.00 per booking"],
  [service("PER_NIGHT"), "$10.00 per night"],
  [service("PER_VEHICLE"), "$10.00 per car"],
  [service("PER_PERSON", 500), "$10.00 per adult, $5.00 per child"],
  [service("PER_PERSON"), "$10.00 per adult, children are not charged"],
  [
    service("PER_PERSON_PER_NIGHT", 500),
    "$10.00 per adult per night, $5.00 per child per night",
  ],
  [
    service("PER_PERSON_PER_NIGHT"),
    "$10.00 per adult per night, children are not charged",
  ],
])("words the price of $unit", (offered, words) => {
  expect(servicePrice(offered)).toBe(words);
});

const props = {
  services: bookingServices,
  maxVehicles: 3,
  breakfast: false,
  transfer: false,
  cars: 1,
  flightDetails: "",
  carsError: null,
  flightError: null,
  onToggle: vi.fn(),
  onCars: vi.fn(),
  onFlightDetails: vi.fn(),
};

it("lists the offered extras unticked, with prices before VAT", () => {
  render(<ServicesPicker {...props} />);
  expect(
    screen.getByRole("group", { name: "Extras (optional)" }),
  ).toBeVisible();
  expect(screen.getByText("Prices are before VAT.")).toBeVisible();
  for (const box of screen.getAllByRole("checkbox"))
    expect(box).not.toBeChecked();
  expect(screen.queryByLabelText("Cars")).toBeNull();
  expect(screen.queryByLabelText(/Flight number/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /Airport transfer/ }));
  expect(props.onToggle).toHaveBeenCalledWith("AIRPORT_TRANSFER", true);
});

it.each(["PER_VEHICLE", "PER_BOOKING"] as const)(
  "asks for 1 to the branch's maximum cars when the unit is %s",
  (unit) => {
    render(
      <ServicesPicker
        {...props}
        services={[{ ...bookingServices[1]!, unit }]}
        maxVehicles={2}
        transfer
      />,
    );
    const cars = screen.getByLabelText("Cars");
    expect(cars).toHaveValue("1");
    expect([...cars.querySelectorAll("option")].map((o) => o.value)).toEqual([
      "1",
      "2",
    ]);
    fireEvent.change(cars, { target: { value: "2" } });
    expect(props.onCars).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText(/Flight number/), {
      target: { value: "MS 985" },
    });
    expect(props.onFlightDetails).toHaveBeenCalledWith("MS 985");
  },
);

it("shows nothing when the branch offers no extra", () => {
  const { container } = render(<ServicesPicker {...props} services={[]} />);
  expect(container).toBeEmptyDOMElement();
});
