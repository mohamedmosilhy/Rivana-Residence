import { describe, expect, it } from "vitest";
import { PhoneNumber, parseGuestContact } from "@/domain/guests";
import {
  validateReservationCreation,
  validateReservationStructure,
  validateReservationPriceSnapshot,
  ReservationStateMachine,
  planNightlyRepricing,
  type ReservationRecord,
  type ReservationLine,
  type ReservationSnapshot,
} from "@/domain/reservations";
import { QuoteCalculator } from "@/domain/pricing";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { Occupancy } from "@/domain/shared/occupancy";
import { Money } from "@/domain/shared/money";
const money = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });
const stay = StayRange.create(
  LocalDate.parse("2026-11-20"),
  LocalDate.parse("2026-11-23"),
);
const phone = PhoneNumber.parse("+12025550101");
const facts = {
  verifiedBookingPhone: phone,
  phoneBlocked: false,
  inventoryReserved: true,
};
function fixture(): ReservationRecord {
  const nights = Array.from(stay.nights(), (night) => ({
    night,
    amount: money(6000),
    source: "MANUAL" as const,
  }));
  const quote = QuoteCalculator.compute({
    lines: [
      {
        nights: nights.map((entry) => ({
          ...entry,
          source: "BASE",
          periodId: null,
          label: null,
        })),
      },
    ],
    guests: { adults: 2, children: 1 },
    services: [
      {
        kind: "BREAKFAST",
        unit: "PER_PERSON_PER_NIGHT",
        price: money(100),
        childPrice: money(50),
      },
    ],
    coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
    vatRateBasisPoints: 1500,
  });
  return {
    branchId: "branch",
    source: "WEBSITE",
    status: "CONFIRMED",
    stay,
    paymentMethod: "PAY_AT_HOTEL",
    paymentStatus: "NOT_REQUIRED",
    guestId: "guest",
    contact: parseGuestContact({
      fullName: "Fictional guest",
      email: "guest@example.test",
      phone: phone.value,
    }),
    externalReference: null,
    lines: [
      {
        branchId: "branch",
        roomTypeId: "listing",
        listing: {
          id: "listing",
          branchId: "branch",
          maxAdults: 2,
          maxChildren: 1,
        },
        physicalUnit: null,
        stay,
        occupancy: Occupancy.create({ adults: 2, children: 1 }),
        consumesInventory: true,
        nights,
        subtotal: money(18000),
      },
    ],
    snapshot: {
      ...quote,
      couponValue: { kind: "PERCENT", percentBasisPoints: 1000 },
    },
  };
}
function changeLine(
  record: ReservationRecord,
  change: Partial<ReservationLine>,
): ReservationRecord {
  return { ...record, lines: [{ ...record.lines[0]!, ...change }] };
}
function changePrice(
  record: ReservationRecord,
  change: Partial<ReservationSnapshot>,
): ReservationRecord {
  if (!record.snapshot) throw new Error("Expected priced fixture");
  return { ...record, snapshot: { ...record.snapshot, ...change } };
}
const validate = (record: ReservationRecord) =>
  validateReservationCreation(record, facts);

describe("R-1…R-10 pure reservation invariants (trusted transaction facts supplied)", () => {
  it("accepts a complete server snapshot including manual nights, service units, coupon and VAT", () => {
    const record = fixture();
    expect(() => validate(record)).not.toThrow();
    expect(record.snapshot).toMatchObject({
      accommodationMinor: 18000,
      servicesMinor: 750,
      subtotalMinor: 18750,
      discountMinor: 1875,
      taxableMinor: 16875,
      vatMinor: 2531,
      totalMinor: 19406,
    });
  });
  it("accepts multiple units and recomputes service quantities over all guests", () => {
    const original = fixture();
    const first = original.lines[0]!;
    const second = {
      ...first,
      occupancy: Occupancy.create({ adults: 1, children: 0 }),
    };
    const quote = QuoteCalculator.compute({
      lines: [first, second].map((line) => ({
        nights: line.nights.map((entry) => ({
          ...entry,
          source: "BASE",
          periodId: null,
          label: null,
        })),
      })),
      guests: { adults: 3, children: 1 },
      services: [],
      vatRateBasisPoints: 0,
    });
    const record = {
      ...original,
      lines: [first, second],
      snapshot: { ...quote, couponValue: null },
    };
    expect(() => validate(record)).not.toThrow();
  });
  it.each([
    { branchId: "foreign" },
    { roomTypeId: "other" },
    {
      listing: {
        id: "listing",
        branchId: "foreign",
        maxAdults: 2,
        maxChildren: 1,
      },
    },
    {
      physicalUnit: { id: "unit", branchId: "foreign", roomTypeId: "listing" },
    },
    { physicalUnit: { id: "unit", branchId: "branch", roomTypeId: "foreign" } },
  ])("R-1 rejects a mismatched ownership fact %j", (change) => {
    expect(() => validate(changeLine(fixture(), change))).toThrow(
      DomainValidationError,
    );
  });
  it("R-2 rejects divergent stays and R-3 rejects occupancy beyond listing limits", () => {
    expect(() =>
      validate(
        changeLine(fixture(), {
          stay: StayRange.create(stay.checkIn, LocalDate.parse("2026-11-24")),
        }),
      ),
    ).toThrow(DomainValidationError);
    expect(() =>
      validate(
        changeLine(fixture(), {
          occupancy: Occupancy.create({ adults: 3, children: 1 }),
        }),
      ),
    ).toThrow(DomainValidationError);
    expect(() =>
      validate(
        changeLine(fixture(), {
          occupancy: Occupancy.create({ adults: 2, children: 2 }),
        }),
      ),
    ).toThrow(DomainValidationError);
  });
  it.each([
    "accommodationMinor",
    "servicesMinor",
    "subtotalMinor",
    "discountMinor",
    "taxableMinor",
    "vatMinor",
    "totalMinor",
  ] as const)("R-4 rejects tampering with %s", (key) => {
    const record = fixture();
    expect(() =>
      validate(changePrice(record, { [key]: record.snapshot![key] + 1 })),
    ).toThrow(DomainValidationError);
  });
  it("R-4 rejects missing, duplicate and outside nights, mixed pricing and incorrect line totals", () => {
    const record = fixture(),
      line = record.lines[0]!,
      first = line.nights[0]!;
    for (const nights of [
      line.nights.slice(1),
      [first, first, line.nights[2]!],
      [{ ...first, night: stay.checkOut }, ...line.nights.slice(1)],
      [{ ...first, amount: null }, ...line.nights.slice(1)],
    ])
      expect(() => validate(changeLine(record, { nights }))).toThrow(
        DomainValidationError,
      );
    expect(() => validate(changeLine(record, { subtotal: money(1) }))).toThrow(
      DomainValidationError,
    );
    expect(() => validate({ ...record, lines: [] })).toThrow(
      DomainValidationError,
    );
  });
  it("R-4 checks stored service quantities, child eligibility, kinds and duplicates", () => {
    const record = fixture(),
      service = record.snapshot!.serviceLines[0]!;
    for (const patch of [
      { adultQuantity: 7 },
      { childQuantity: 0 },
      { amountMinor: 0 },
      { nights: 1 },
      { adults: 1 },
      { priceMinor: 0 },
      { childPriceMinor: 0 },
      { kind: "UNSUPPORTED" },
      { unit: "PER_BOOKING" as const },
    ])
      expect(() =>
        validate(
          changePrice(record, { serviceLines: [{ ...service, ...patch }] }),
        ),
      ).toThrow(DomainValidationError);
    expect(() =>
      validate(changePrice(record, { serviceLines: [service, service] })),
    ).toThrow(DomainValidationError);
  });
  it("SV-5 requires the stored car count of a transfer and refuses one on breakfast", () => {
    const record = fixture();
    const quote = QuoteCalculator.compute({
      lines: [
        {
          nights: record.lines[0]!.nights.map((entry) => ({
            ...entry,
            source: "BASE",
            periodId: null,
            label: null,
          })),
        },
      ],
      guests: { adults: 2, children: 1 },
      services: [
        {
          kind: "BREAKFAST",
          unit: "PER_PERSON_PER_NIGHT",
          price: money(100),
          childPrice: money(50),
        },
        {
          kind: "AIRPORT_TRANSFER",
          unit: "PER_VEHICLE",
          price: money(4000),
          childPrice: null,
          vehicles: 2,
        },
      ],
      coupon: { kind: "PERCENT", percentBasisPoints: 1000 },
      vatRateBasisPoints: 1500,
    });
    const priced = changePrice(record, quote);
    const [breakfast, transfer] = priced.snapshot!.serviceLines;
    expect(transfer).toMatchObject({ vehicles: 2, amountMinor: 8000 });
    expect(() => validate(priced)).not.toThrow();
    for (const lines of [
      [breakfast!, { ...transfer!, vehicles: null }],
      [breakfast!, { ...transfer!, vehicles: 3 }],
      [{ ...breakfast!, vehicles: 1 }, transfer!],
    ])
      expect(() =>
        validate(changePrice(priced, { serviceLines: lines })),
      ).toThrow(DomainValidationError);
  });
  it("allows wholly unpriced external snapshots but never partial pricing or unpriced website/staff", () => {
    const record = fixture();
    const line = record.lines[0]!;
    const external = {
      ...record,
      source: "EXTERNAL" as const,
      externalReference: "PMS-1",
      snapshot: null,
      lines: [
        {
          ...line,
          subtotal: null,
          nights: line.nights.map((entry) => ({
            ...entry,
            amount: null,
            source: null,
          })),
        },
      ],
    };
    expect(() => validate(external)).not.toThrow();
    for (const source of ["STAFF", "WEBSITE"] as const)
      expect(() => validate({ ...external, source })).toThrow(
        DomainValidationError,
      );
    expect(() =>
      validate({
        ...external,
        lines: [{ ...external.lines[0]!, nights: line.nights }],
      }),
    ).toThrow(DomainValidationError);
    expect(() => validate({ ...external, externalReference: " " })).toThrow(
      DomainValidationError,
    );
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "Q-76 external snapshots reject services=%s coupon=%s even when arithmetic is valid",
    (withServices, withCoupon) => {
      const record = fixture();
      const couponValue = withCoupon
        ? { kind: "PERCENT" as const, percentBasisPoints: 1000 }
        : null;
      const quote = QuoteCalculator.compute({
        lines: record.lines.map((line) => ({
          nights: line.nights.map((entry) => ({
            ...entry,
            source: "BASE",
            periodId: null,
            label: null,
          })),
        })),
        guests: { adults: 2, children: 1 },
        services: withServices
          ? [
              {
                kind: "BREAKFAST",
                unit: "PER_PERSON_PER_NIGHT",
                price: money(100),
                childPrice: money(50),
              },
            ]
          : [],
        ...(couponValue === null ? {} : { coupon: couponValue }),
        vatRateBasisPoints: 1500,
      });
      const external = {
        ...record,
        source: "EXTERNAL" as const,
        externalReference: "PMS-1",
        snapshot: { ...quote, couponValue },
      };
      if (withServices || withCoupon) {
        // Assert the Q-76 issue itself, so a refusal for another reason cannot mask a regression.
        const failure = (() => {
          try {
            validate(external);
          } catch (error) {
            return error;
          }
          throw new Error("Expected refusal");
        })();
        expect(failure).toBeInstanceOf(DomainValidationError);
        expect((failure as DomainValidationError).issues).toEqual([
          {
            path: "snapshot",
            message:
              "External reservations cannot include services or a coupon.",
          },
        ]);
      } else {
        expect(() => validate(external)).not.toThrow();
        for (const source of ["BASE", "PERIOD"] as const) {
          expect(() =>
            validate(
              changeLine(external, {
                nights: external.lines[0]!.nights.map((entry) => ({
                  ...entry,
                  source,
                })),
              }),
            ),
          ).toThrow(DomainValidationError);
        }
      }
    },
  );

  it("R-6 requires consumption to match status, and checked-in units to be assigned", () => {
    expect(() =>
      validate(changeLine(fixture(), { consumesInventory: false })),
    ).toThrow(DomainValidationError);
    expect(() =>
      validateReservationStructure({ ...fixture(), status: "CHECKED_IN" }),
    ).toThrow(DomainValidationError);
    const record = changeLine(fixture(), {
      physicalUnit: { id: "unit", branchId: "branch", roomTypeId: "listing" },
    });
    expect(() =>
      validateReservationStructure({ ...record, status: "CHECKED_IN" }),
    ).not.toThrow();
    expect(() =>
      validateReservationStructure({
        ...record,
        lines: [record.lines[0]!, record.lines[0]!],
      }),
    ).toThrow(DomainValidationError);
  });
  it("R-9 requires a profile, matching verified booking phone, email and nonblocked fact", () => {
    const record = fixture();
    for (const patch of [
      { guestId: null },
      { contact: { ...record.contact, email: null } },
      { contact: { ...record.contact, phone: null } },
    ])
      expect(() => validate({ ...record, ...patch })).toThrow(
        DomainValidationError,
      );
    for (const patch of [
      { verifiedBookingPhone: null },
      { verifiedBookingPhone: PhoneNumber.parse("+12025550102") },
      { phoneBlocked: true },
    ])
      expect(() =>
        validateReservationCreation(record, { ...facts, ...patch }),
      ).toThrow(DomainValidationError);
    expect(() =>
      validate({
        ...record,
        contact: { ...record.contact, fullName: "a".repeat(121) },
      }),
    ).toThrow(DomainValidationError);
  });
  it("R-10 requires the reserved-inventory fact and refuses payment creation paths in M8", () => {
    expect(() =>
      validateReservationCreation(fixture(), {
        ...facts,
        inventoryReserved: false,
      }),
    ).toThrow(DomainValidationError);
    expect(() => validate({ ...fixture(), paymentMethod: "ONLINE" })).toThrow(
      DomainValidationError,
    );
    expect(() => validate({ ...fixture(), paymentStatus: "PAID" })).toThrow(
      DomainValidationError,
    );
  });
  it("Q-76 preserves the original nightly snapshot after early checkout while validating operational stays separately", () => {
    const record = fixture();
    const original = JSON.stringify(record.snapshot);
    const result = ReservationStateMachine.transition(
      {
        status: "CHECKED_IN",
        stay,
        paymentMethod: "PAY_AT_HOTEL",
        paymentStatus: "NOT_REQUIRED",
        allUnitsAssigned: true,
      },
      "CHECK_OUT",
      LocalDate.parse("2026-11-21"),
    );
    if (!result.allowed) throw new Error("Expected checkout");
    const checkedOut = {
      ...record,
      status: result.status,
      stay: result.stay,
      lines: record.lines.map((line) => ({ ...line, stay: result.stay })),
    };
    expect(() => validateReservationStructure(checkedOut)).not.toThrow();
    expect(() =>
      validateReservationPriceSnapshot(
        stay,
        record.lines,
        record.snapshot,
        record.source,
      ),
    ).not.toThrow();
    expect(JSON.stringify(record.snapshot)).toBe(original);
    expect(checkedOut.lines[0]?.nights).toHaveLength(3);
  });
  it("detects unsafe sums through Money rather than silently rounding snapshots", () => {
    const record = fixture(),
      line = record.lines[0]!;
    expect(() =>
      validate(
        changeLine(record, {
          nights: line.nights.map((entry) => ({
            ...entry,
            amount: money(Number.MAX_SAFE_INTEGER),
          })),
        }),
      ),
    ).toThrow(DomainValidationError);
  });
});

describe("Q-19 pure nightly repricing plan", () => {
  it("retains unchanged manual snapshots and asks for current prices only on new nights", () => {
    const record = fixture(),
      previous = { roomTypeId: "listing", nights: record.lines[0]!.nights };
    const next = StayRange.create(
      LocalDate.parse("2026-11-21"),
      LocalDate.parse("2026-11-24"),
    );
    const result = planNightlyRepricing(previous, {
      roomTypeId: "listing",
      stay: next,
    });
    expect(result.retained.map((entry) => entry.night.value)).toEqual([
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(result.retained[0]).toBe(previous.nights[1]);
    expect(result.needsCurrentPrice.map((date) => date.value)).toEqual([
      "2026-11-23",
    ]);
    expect(Object.isFrozen(result.retained)).toBe(true);
  });
  it("reprices every night for a changed listing or new unit", () => {
    const record = fixture();
    for (const previous of [
      null,
      { roomTypeId: "other", nights: record.lines[0]!.nights },
    ]) {
      const result = planNightlyRepricing(previous, {
        roomTypeId: "listing",
        stay,
      });
      expect(result.retained).toHaveLength(0);
      expect(result.needsCurrentPrice).toHaveLength(3);
    }
  });
  it("rejects ambiguous duplicate old nights", () => {
    const first = fixture().lines[0]!.nights[0]!;
    expect(() =>
      planNightlyRepricing(
        { roomTypeId: "listing", nights: [first, first] },
        { roomTypeId: "listing", stay },
      ),
    ).toThrow(DomainValidationError);
  });
});
