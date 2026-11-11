import { describe, expect, it } from "vitest";

import {
  SERVICE_PRICE_MAX_MINOR,
  parseServiceKind,
  parseServiceOfferingInput,
  selectRequestedServices,
  type ServiceOffering,
} from "@/domain/services";
import { Money } from "@/domain/shared/money";

const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const money = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const issuePaths = (result: ReturnType<typeof parseServiceOfferingInput>) =>
  result.ok ? [] : result.issues.map((issue) => issue.path);

describe("parseServiceOfferingInput (SV-1, S36 body)", () => {
  it.each(["PER_BOOKING", "PER_NIGHT"] as const)(
    "accepts %s with an adult price only",
    (priceUnit) => {
      const result = parseServiceOfferingInput({
        priceUnit,
        price: usd(2500),
        active: true,
      });
      expect(result).toEqual({
        ok: true,
        value: {
          priceUnit,
          price: money(2500),
          childPrice: null,
          active: true,
          description: null,
        },
      });
    },
  );

  it.each(["PER_PERSON", "PER_PERSON_PER_NIGHT"] as const)(
    "accepts %s with a child price",
    (priceUnit) => {
      const result = parseServiceOfferingInput({
        priceUnit,
        price: usd(1000),
        childPrice: usd(500),
        active: false,
        description: "  Buffet  ",
      });
      expect(result).toEqual({
        ok: true,
        value: {
          priceUnit,
          price: money(1000),
          childPrice: money(500),
          active: false,
          description: "Buffet",
        },
      });
    },
  );

  it("treats a missing or null child price as children not charged", () => {
    for (const childPrice of [undefined, null]) {
      const result = parseServiceOfferingInput({
        priceUnit: "PER_PERSON",
        price: usd(1000),
        ...(childPrice === undefined ? {} : { childPrice }),
        active: true,
      });
      expect(result.ok && result.value.childPrice).toBeNull();
    }
  });

  it.each(["PER_BOOKING", "PER_NIGHT"] as const)(
    "refuses a child price on %s",
    (priceUnit) => {
      const result = parseServiceOfferingInput({
        priceUnit,
        price: usd(1000),
        childPrice: usd(500),
        active: true,
      });
      expect(issuePaths(result)).toEqual(["childPrice"]);
    },
  );

  it("accepts the full positive PostgreSQL integer range", () => {
    for (const amountMinor of [1, SERVICE_PRICE_MAX_MINOR]) {
      expect(
        parseServiceOfferingInput({
          priceUnit: "PER_PERSON",
          price: usd(amountMinor),
          childPrice: usd(amountMinor),
          active: true,
        }).ok,
      ).toBe(true);
    }
  });

  it.each([0, -1, 1.5, SERVICE_PRICE_MAX_MINOR + 1, NaN])(
    "refuses a price of %s",
    (amountMinor) => {
      const result = parseServiceOfferingInput({
        priceUnit: "PER_BOOKING",
        price: usd(amountMinor),
        active: true,
      });
      expect(issuePaths(result)).toContain("price.amountMinor");
    },
  );

  it.each([0, -1, 1.5, SERVICE_PRICE_MAX_MINOR + 1])(
    "refuses a child price of %s",
    (amountMinor) => {
      const result = parseServiceOfferingInput({
        priceUnit: "PER_PERSON",
        price: usd(1000),
        childPrice: usd(amountMinor),
        active: true,
      });
      expect(issuePaths(result)).toContain("childPrice.amountMinor");
    },
  );

  it("refuses another currency on a child price", () => {
    expect(
      parseServiceOfferingInput({
        priceUnit: "PER_PERSON",
        price: usd(1000),
        childPrice: { amountMinor: 500, currency: "EGP" },
        active: true,
      }).ok,
    ).toBe(false);
  });

  it.each([
    ["an unknown unit", { priceUnit: "PER_ROOM", price: usd(1), active: true }],
    ["a missing unit", { price: usd(1), active: true }],
    ["a missing price", { priceUnit: "PER_BOOKING", active: true }],
    ["a missing active flag", { priceUnit: "PER_BOOKING", price: usd(1) }],
    [
      "another currency",
      {
        priceUnit: "PER_BOOKING",
        price: { amountMinor: 1, currency: "EGP" },
        active: true,
      },
    ],
    [
      "a client branch",
      { priceUnit: "PER_BOOKING", price: usd(1), active: true, branchId: "x" },
    ],
    [
      "a client kind",
      { priceUnit: "PER_BOOKING", price: usd(1), active: true, kind: "X" },
    ],
    [
      "a long description",
      {
        priceUnit: "PER_BOOKING",
        price: usd(1),
        active: true,
        description: "x".repeat(301),
      },
    ],
    ["a non object", "nope"],
    ["null", null],
  ])("refuses %s", (_name, input) => {
    expect(parseServiceOfferingInput(input).ok).toBe(false);
  });

  it("turns a blank description into null", () => {
    const result = parseServiceOfferingInput({
      priceUnit: "PER_BOOKING",
      price: usd(1),
      active: true,
      description: "   ",
    });
    expect(result.ok && result.value.description).toBeNull();
  });
});

describe("parseServiceKind", () => {
  it.each(["BREAKFAST", "AIRPORT_TRANSFER"])("accepts %s", (kind) => {
    expect(parseServiceKind(kind)).toEqual({ ok: true, value: kind });
  });
  it.each(["breakfast", "SPA", "", null, 1])("refuses %j", (kind) => {
    expect(parseServiceKind(kind).ok).toBe(false);
  });
});

describe("selectRequestedServices (SV-2, T-SVC-1…2)", () => {
  const breakfast: ServiceOffering = {
    kind: "BREAKFAST",
    unit: "PER_PERSON_PER_NIGHT",
    price: money(1000),
    childPrice: money(500),
    active: true,
  };
  const transfer: ServiceOffering = {
    kind: "AIRPORT_TRANSFER",
    unit: "PER_BOOKING",
    price: money(2500),
    childPrice: null,
    active: true,
  };

  it("T-SVC-1: returns only the requested services, in request order", () => {
    expect(
      selectRequestedServices(["AIRPORT_TRANSFER"], [breakfast, transfer]),
    ).toEqual({ ok: true, services: [transfer] });
    expect(
      selectRequestedServices(
        ["AIRPORT_TRANSFER", "BREAKFAST"],
        [breakfast, transfer],
      ),
    ).toEqual({ ok: true, services: [transfer, breakfast] });
  });

  it("T-SVC-1b: nothing requested adds nothing, even with active offerings", () => {
    expect(selectRequestedServices([], [breakfast, transfer])).toEqual({
      ok: true,
      services: [],
    });
  });

  it("T-SVC-2: a requested inactive service refuses with its kind", () => {
    expect(
      selectRequestedServices(
        ["BREAKFAST"],
        [{ ...breakfast, active: false }, transfer],
      ),
    ).toEqual({ ok: false, kind: "BREAKFAST" });
  });

  it("T-SVC-2b: a requested service with no offering refuses with its kind", () => {
    expect(selectRequestedServices(["AIRPORT_TRANSFER"], [breakfast])).toEqual({
      ok: false,
      kind: "AIRPORT_TRANSFER",
    });
    expect(selectRequestedServices(["BREAKFAST"], [])).toEqual({
      ok: false,
      kind: "BREAKFAST",
    });
  });

  it("reports the first unavailable service in request order", () => {
    expect(
      selectRequestedServices(["AIRPORT_TRANSFER", "BREAKFAST"], []),
    ).toEqual({ ok: false, kind: "AIRPORT_TRANSFER" });
    expect(
      selectRequestedServices(["BREAKFAST", "AIRPORT_TRANSFER"], []),
    ).toEqual({ ok: false, kind: "BREAKFAST" });
  });

  it("returns a frozen list", () => {
    const result = selectRequestedServices(["BREAKFAST"], [breakfast]);
    expect(result.ok && Object.isFrozen(result.services)).toBe(true);
  });

  it("an inactive offering that was not requested does not matter", () => {
    expect(
      selectRequestedServices(
        ["AIRPORT_TRANSFER"],
        [{ ...breakfast, active: false }, transfer],
      ),
    ).toEqual({ ok: true, services: [transfer] });
  });

  it.each([
    ["a duplicate", ["BREAKFAST", "BREAKFAST"], "services.1"],
    ["an unknown kind", ["SPA"], "services.0"],
    ["a lower case kind", ["breakfast"], "services.0"],
    ["a non string", [1], "services.0"],
  ])("refuses %s as a validation issue", (_name, requested, path) => {
    const result = selectRequestedServices(requested, [breakfast, transfer]);
    expect(result.ok).toBe(false);
    expect("issues" in result && result.issues.map((i) => i.path)).toEqual([
      path,
    ]);
  });

  it.each([null, undefined, "BREAKFAST", {}])(
    "refuses a non list %j",
    (requested) => {
      const result = selectRequestedServices(requested, [breakfast]);
      expect("issues" in result && result.issues[0]?.path).toBe("services");
    },
  );
});
