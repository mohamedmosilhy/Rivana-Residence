import { describe, expect, it } from "vitest";

import {
  isPersonUnit,
  serviceQuantity,
  SERVICE_PRICE_UNITS,
  type ServicePriceUnit,
} from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";

describe("serviceQuantity (SV-3 as amended 2026-11-11, T-SVC-1)", () => {
  const guests = { adults: 2, children: 1 };

  it.each<[ServicePriceUnit, number, number, number]>([
    ["PER_BOOKING", 3, 1, 0],
    ["PER_NIGHT", 3, 3, 0],
    ["PER_PERSON", 3, 2, 1],
    ["PER_PERSON_PER_NIGHT", 3, 6, 3],
    ["PER_PERSON_PER_NIGHT", 1, 2, 1],
    ["PER_PERSON_PER_NIGHT", 30, 60, 30],
  ])("%s over %i nights gives %i adult and %i child", (unit, nights, a, c) => {
    expect(serviceQuantity(unit, guests, nights)).toEqual({
      adults: a,
      children: c,
    });
  });

  it("handles a booking with no children", () => {
    expect(
      serviceQuantity("PER_PERSON_PER_NIGHT", { adults: 1, children: 0 }, 2),
    ).toEqual({ adults: 2, children: 0 });
  });

  it("knows which units are person units", () => {
    expect(SERVICE_PRICE_UNITS.filter(isPersonUnit)).toEqual([
      "PER_PERSON",
      "PER_PERSON_PER_NIGHT",
    ]);
  });

  it.each([
    [{ adults: 0, children: 0 }, 1],
    [{ adults: 1, children: -1 }, 1],
    [{ adults: 1.5, children: 0 }, 1],
    [{ adults: 1, children: 0 }, 0],
    [{ adults: 1, children: 0 }, 1.5],
  ])("rejects invalid input %j nights %s", (g, nights) => {
    expect(() => serviceQuantity("PER_PERSON", g, nights)).toThrow(
      DomainValidationError,
    );
  });

  it("rejects an unknown unit", () => {
    expect(() =>
      serviceQuantity("PER_ROOM" as ServicePriceUnit, guests, 1),
    ).toThrow(DomainValidationError);
  });
});
