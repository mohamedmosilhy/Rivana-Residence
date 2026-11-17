import { describe, expect, it } from "vitest";
import {
  parseServiceOfferingInput,
  selectRequestedServices,
  SERVICE_PRICE_UNITS,
} from "@/domain/services";
import { QuoteCalculator } from "@/domain/pricing";
import { Money } from "@/domain/shared/money";
import { LocalDate } from "@/domain/shared/local-date";
const money = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const offering = {
  kind: "AIRPORT_TRANSFER" as const,
  unit: "PER_VEHICLE" as const,
  price: money(4000),
  childPrice: null,
  active: true,
  maxVehicles: 3,
};
const quote = (
  vehicles: number,
  unit = offering.unit as (typeof SERVICE_PRICE_UNITS)[number],
) =>
  QuoteCalculator.compute({
    lines: [
      {
        nights: [
          {
            night: LocalDate.parse("2031-01-01"),
            amount: money(10000),
            source: null,
            periodId: null,
            label: null,
          },
        ],
      },
    ],
    guests: { adults: 2, children: 1 },
    services: [{ ...offering, vehicles, unit }],
    coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
    vatRateBasisPoints: 1500,
  });

describe("SV-5 airport transfer cars", () => {
  it("charges per car before coupon and VAT", () => {
    expect(quote(2)).toMatchObject({
      servicesMinor: 8000,
      subtotalMinor: 18000,
      discountMinor: 1800,
      taxableMinor: 16200,
      vatMinor: 2430,
      totalMinor: 18630,
      serviceLines: [{ vehicles: 2, adultQuantity: 2, childQuantity: 0 }],
    });
  });
  it.each([
    "PER_BOOKING",
    "PER_NIGHT",
    "PER_PERSON",
    "PER_PERSON_PER_NIGHT",
  ] as const)("keeps %s pricing when the car count changes", (unit) => {
    expect(quote(2, unit).servicesMinor).toBe(quote(1, unit).servicesMinor);
    expect(quote(2, unit).serviceLines[0]?.vehicles).toBe(2);
  });
  it.each([0, -1, 1.5, 11, NaN, Infinity])(
    "refuses invalid calculator car count %s",
    (vehicles) => expect(() => quote(vehicles)).toThrow(),
  );
  it.each([1, 3])("accepts selected count %s at the bounds", (vehicles) =>
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", vehicles }],
        [offering],
      ),
    ).toMatchObject({ ok: true, services: [{ vehicles }] }),
  );
  it("defaults legacy and object requests to one car", () => {
    for (const input of ["AIRPORT_TRANSFER", { kind: "AIRPORT_TRANSFER" }])
      expect(selectRequestedServices([input], [offering])).toMatchObject({
        ok: true,
        services: [{ vehicles: 1 }],
      });
  });
  it("refuses a count above the branch maximum at its indexed field", () =>
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", vehicles: 4 }],
        [offering],
      ),
    ).toMatchObject({ ok: false, issues: [{ path: "services.0.vehicles" }] }));
  it("refuses a count on breakfast", () =>
    expect(
      selectRequestedServices(
        [{ kind: "BREAKFAST", vehicles: 1 }],
        [
          {
            ...offering,
            kind: "BREAKFAST",
            unit: "PER_BOOKING",
            maxVehicles: null,
          },
        ],
      ),
    ).toMatchObject({ ok: false, issues: [{ path: "services.0.vehicles" }] }));
  it("validates duplicates across bare and object forms before availability", () =>
    expect(
      selectRequestedServices(
        ["AIRPORT_TRANSFER", { kind: "AIRPORT_TRANSFER" }],
        [],
      ),
    ).toMatchObject({ ok: false, issues: [{ path: "services.1" }] }));
  it.each([0, 1.5, 11, null])("refuses invalid selected count %s", (vehicles) =>
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", vehicles }],
        [offering],
      ).ok,
    ).toBe(false),
  );
  it("keeps bounded plain flight details and refuses oversized or control-bearing values", () => {
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", details: " MS123 10:30 " }],
        [offering],
      ),
    ).toMatchObject({ ok: true, services: [{ details: "MS123 10:30" }] });
    for (const details of ["x".repeat(301), "flight\nheader"])
      expect(
        selectRequestedServices(
          [{ kind: "AIRPORT_TRANSFER", details }],
          [offering],
        ).ok,
      ).toBe(false);
  });
  it("rejects client pricing keys", () =>
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", vehicles: 2, priceMinor: 1 }],
        [offering],
      ).ok,
    ).toBe(false));
  it("defaults a transfer maximum to three and keeps breakfast null", () => {
    const body = {
      priceUnit: "PER_BOOKING",
      price: { amountMinor: 100, currency: "USD" },
      active: true,
    };
    expect(parseServiceOfferingInput(body, "AIRPORT_TRANSFER")).toMatchObject({
      ok: true,
      value: { maxVehicles: 3 },
    });
    expect(parseServiceOfferingInput(body, "BREAKFAST")).toMatchObject({
      ok: true,
      value: { maxVehicles: null },
    });
    expect(
      parseServiceOfferingInput(
        { ...body, priceUnit: "PER_VEHICLE" },
        "BREAKFAST",
      ).ok,
    ).toBe(false);
    expect(
      parseServiceOfferingInput({ ...body, maxVehicles: 2 }, "BREAKFAST").ok,
    ).toBe(false);
    expect(
      parseServiceOfferingInput(
        {
          ...body,
          priceUnit: "PER_VEHICLE",
          childPrice: { amountMinor: 10, currency: "USD" },
        },
        "AIRPORT_TRANSFER",
      ).ok,
    ).toBe(false);
  });
  it("refuses a car count on breakfast before looking at offerings", () =>
    // Breakfast is not offered at all: the field error still wins over
    // SERVICE_UNAVAILABLE, because it does not depend on the branch.
    expect(
      selectRequestedServices([{ kind: "BREAKFAST", vehicles: 2 }], [offering]),
    ).toMatchObject({ ok: false, issues: [{ path: "services.0.vehicles" }] }));
  it.each([1.5, null, "2", 0, 11])(
    "reports a wrong count %s on the vehicles field, not the whole item",
    (vehicles) =>
      expect(
        selectRequestedServices(
          [{ kind: "AIRPORT_TRANSFER", vehicles }],
          [offering],
        ),
      ).toMatchObject({ ok: false, issues: [{ path: "services.0.vehicles" }] }),
  );
  it("fails closed when a transfer offering has no stored maximum", () =>
    expect(
      selectRequestedServices(
        ["AIRPORT_TRANSFER"],
        [{ ...offering, maxVehicles: null }],
      ),
    ).toEqual({ ok: false, kind: "AIRPORT_TRANSFER" }));
  it("stores blank flight details as no details", () =>
    expect(
      selectRequestedServices(
        [{ kind: "AIRPORT_TRANSFER", details: "   " }],
        [offering],
      ),
    ).toMatchObject({ ok: true, services: [{ details: null }] }));
});
