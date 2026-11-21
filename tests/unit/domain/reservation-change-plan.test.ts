import { describe, expect, it } from "vitest";

import {
  planReservationChange,
  summarizeReservation,
  type CurrentChangeLine,
} from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

const stay = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));
const occupancy = (adults: number, children = 0) =>
  Occupancy.create({ adults, children });
const nights = (range: StayRange) =>
  [...range.nights()].map((night) => ({
    night,
    amount: Money.create({ amountMinor: 10_000, currency: "USD" }),
    source: "BASE" as const,
  }));
const current = stay("2031-04-10", "2031-04-13");
const line = (
  id: string,
  roomTypeId = "garden",
  adults = 2,
  physicalRoomId: string | null = null,
): CurrentChangeLine => ({
  id,
  roomTypeId,
  physicalRoomId,
  occupancy: occupancy(adults),
  nights: nights(current),
});
const today = LocalDate.parse("2031-03-01");
const options = { today, allowPriceOnly: false };
const request = (range: StayRange, ...units: [string, number][]) => ({
  stay: range,
  lines: units.map(([roomTypeId, adults]) => ({
    roomTypeId,
    occupancy: occupancy(adults),
  })),
});

describe("planReservationChange (Q-19, PR-11)", () => {
  it("prices only the nights the unit did not already have", () => {
    const plan = planReservationChange(
      { stay: current, lines: [line("a")] },
      request(stay("2031-04-11", "2031-04-15"), ["garden", 2]),
      options,
    );
    expect(plan.stayChanged).toBe(true);
    expect(plan.lines[0]?.retained.map((n) => n.night.value)).toEqual([
      "2031-04-11",
      "2031-04-12",
    ]);
    expect(plan.lines[0]?.needsCurrentPrice.map((n) => n.value)).toEqual([
      "2031-04-13",
      "2031-04-14",
    ]);
    expect(plan.repricedNightCount).toBe(2);
  });

  it("offers the current unit as a candidate for every continuing line; the caller checks it is still free", () => {
    const only = planReservationChange(
      { stay: current, lines: [line("a", "garden", 2, "unit-1")] },
      request(current, ["garden", 3]),
      options,
    );
    expect(only.lines[0]).toMatchObject({
      continuesLineId: "a",
      assignedPhysicalRoomId: "unit-1",
      needsCurrentPrice: [],
    });
    const moved = planReservationChange(
      { stay: current, lines: [line("a", "garden", 2, "unit-1")] },
      request(stay("2031-04-12", "2031-04-14"), ["garden", 2]),
      options,
    );
    expect(moved.lines[0]?.assignedPhysicalRoomId).toBe("unit-1");
  });

  it("matches units by listing, exact occupancy first, and reports added and removed units", () => {
    const plan = planReservationChange(
      {
        stay: current,
        lines: [line("a", "garden", 2), line("b", "garden", 3)],
      },
      request(current, ["garden", 3], ["suite", 2]),
      options,
    );
    expect(plan.lines.map((l) => l.continuesLineId)).toEqual(["b", null]);
    expect(plan.removedLineIds).toEqual(["a"]);
    expect(plan.roomTypeIds).toEqual(["garden", "suite"]);
    // A unit that moves to another listing is priced afresh for every night.
    expect(plan.lines[1]?.needsCurrentPrice).toHaveLength(3);
  });

  it("prefers the assigned unit when units of one listing are interchangeable", () => {
    // The unassigned unit has the lower id, so id order alone would pick it.
    const plan = planReservationChange(
      {
        stay: current,
        lines: [line("a-free"), line("b-assigned", "garden", 2, "unit-9")],
      },
      request(current, ["garden", 3]),
      options,
    );
    expect(plan.lines[0]).toMatchObject({
      continuesLineId: "b-assigned",
      assignedPhysicalRoomId: "unit-9",
    });
    expect(plan.removedLineIds).toEqual(["a-free"]);
    // An exact occupancy match still wins over an assignment elsewhere.
    const exact = planReservationChange(
      {
        stay: current,
        lines: [line("a", "garden", 3), line("b", "garden", 2, "unit-9")],
      },
      request(current, ["garden", 3]),
      options,
    );
    expect(exact.lines[0]?.continuesLineId).toBe("a");
  });

  it("reports a price-only request as not structural", () => {
    const plan = planReservationChange(
      { stay: current, lines: [line("a")] },
      request(current, ["garden", 2]),
      { ...options, allowPriceOnly: true },
    );
    expect(plan.structureChanged).toBe(false);
    expect(
      planReservationChange(
        { stay: current, lines: [line("a")] },
        request(current, ["garden", 3]),
        options,
      ).structureChanged,
    ).toBe(true);
  });

  it("refuses a no-op and an empty or oversized request", () => {
    expect(() =>
      planReservationChange(
        { stay: current, lines: [line("a")] },
        request(current, ["garden", 2]),
        options,
      ),
    ).toThrow(DomainValidationError);
    expect(() =>
      planReservationChange(
        { stay: current, lines: [line("a")] },
        request(current),
        options,
      ),
    ).toThrow(DomainValidationError);
  });

  it("plans the retained edits, additions, and removals of a full service selection", () => {
    const booked = {
      stay: current,
      lines: [line("a")],
      snapshot: {
        serviceLines: [
          { kind: "AIRPORT_TRANSFER", vehicles: 2, details: "MS100 10:30" },
        ],
      },
    };
    const same = request(current, ["garden", 2]);
    expect(() =>
      planReservationChange(
        booked,
        {
          ...same,
          services: [
            {
              kind: "AIRPORT_TRANSFER",
              vehicles: undefined,
              details: undefined,
            },
          ],
        },
        options,
      ),
    ).toThrow("Check the change.");
    const edited = planReservationChange(
      booked,
      {
        ...same,
        services: [
          { kind: "BREAKFAST", vehicles: undefined, details: undefined },
          { kind: "AIRPORT_TRANSFER", vehicles: 3, details: "" },
        ],
      },
      options,
    );
    expect(edited.structureChanged).toBe(false);
    expect(edited.services).toMatchObject([
      { kind: "BREAKFAST", index: 0, added: true },
      {
        kind: "AIRPORT_TRANSFER",
        vehicles: 3,
        details: null,
        changedVehiclesAt: 1,
        detailsChanged: true,
      },
    ]);
    expect(
      planReservationChange(booked, { ...same, services: [] }, options)
        .removedServices,
    ).toEqual(["AIRPORT_TRANSFER"]);
  });

  it("allows details corrections on a started stay and refuses a change to selection or cars", () => {
    const booked = {
      stay: current,
      lines: [line("a")],
      snapshot: {
        serviceLines: [
          { kind: "AIRPORT_TRANSFER", vehicles: 2, details: null },
        ],
      },
    };
    const started = { ...options, today: LocalDate.parse("2031-04-11") };
    const same = request(current, ["garden", 2]);
    const edit = {
      kind: "AIRPORT_TRANSFER",
      vehicles: undefined,
      details: "MS200",
    } as const;
    expect(
      planReservationChange(booked, { ...same, services: [edit] }, started)
        .services,
    ).toMatchObject([{ vehicles: 2, details: "MS200", detailsChanged: true }]);
    for (const services of [
      [],
      [{ ...edit, vehicles: 3 }],
      [
        edit,
        { kind: "BREAKFAST" as const, vehicles: undefined, details: undefined },
      ],
    ])
      expect(() =>
        planReservationChange(booked, { ...same, services }, started),
      ).toThrow("Check the change.");
  });

  it("summarizes without personal values", () => {
    const service = { kind: "AIRPORT_TRANSFER", vehicles: 2, details: "MS100" };
    const summary = summarizeReservation({
      stay: current,
      status: "CONFIRMED",
      lines: [
        {
          roomTypeId: "garden",
          occupancy: occupancy(2, 1),
          physicalRoomId: "unit-1",
        },
      ],
      snapshot: {
        accommodationMinor: 30_000,
        serviceLines: [service],
        servicesMinor: 0,
        discountMinor: 0,
        vatMinor: 4500,
        totalMinor: 34_500,
      },
    });
    expect(summary).toEqual({
      status: "CONFIRMED",
      assignedUnits: 1,
      checkIn: "2031-04-10",
      checkOut: "2031-04-13",
      units: [{ roomTypeId: "garden", adults: 2, children: 1 }],
      accommodationMinor: 30_000,
      services: [
        { kind: "AIRPORT_TRANSFER", vehicles: 2, detailsChanged: false },
      ],
      servicesMinor: 0,
      discountMinor: 0,
      vatMinor: 4500,
      totalMinor: 34_500,
    });
  });

  it("allows a price-only request only when asked, and still refuses a plain no-op", () => {
    const same = request(current, ["garden", 2]);
    expect(() =>
      planReservationChange(
        { stay: current, lines: [line("a")] },
        same,
        options,
      ),
    ).toThrow(DomainValidationError);
    const plan = planReservationChange(
      { stay: current, lines: [line("a")] },
      same,
      {
        ...options,
        allowPriceOnly: true,
      },
    );
    expect(plan.stayChanged).toBe(false);
    expect(plan.repricedNightCount).toBe(0);
  });

  describe("a stay that has started", () => {
    const later = {
      today: LocalDate.parse("2031-04-11"),
      allowPriceOnly: false,
    };
    const started = { stay: current, lines: [line("a")] };

    it("extends the check out and prices only the added nights", () => {
      const plan = planReservationChange(
        started,
        request(stay("2031-04-10", "2031-04-15"), ["garden", 2]),
        later,
      );
      expect(plan.lines[0]?.retained).toHaveLength(3);
      expect(plan.lines[0]?.needsCurrentPrice.map((n) => n.value)).toEqual([
        "2031-04-13",
        "2031-04-14",
      ]);
    });

    it("keeps nights before today, the check in, and the units", () => {
      const refuse = (range: StayRange, ...units: [string, number][]) =>
        expect(() =>
          planReservationChange(started, request(range, ...units), later),
        ).toThrow(DomainValidationError);
      refuse(stay("2031-04-11", "2031-04-14"), ["garden", 2]); // check in moved
      // On 12 April the nights of 10 and 11 April are history: ending on 11 April drops one.
      expect(() =>
        planReservationChange(
          started,
          request(stay("2031-04-10", "2031-04-11"), ["garden", 2]),
          { ...later, today: LocalDate.parse("2031-04-12") },
        ),
      ).toThrow(DomainValidationError);
      refuse(stay("2031-04-10", "2031-04-14"), ["garden", 2], ["garden", 2]); // unit added
      refuse(stay("2031-04-10", "2031-04-14"), ["suite", 2]); // moved listing
      // Shortening to today keeps every past night.
      expect(
        planReservationChange(
          started,
          request(stay("2031-04-10", "2031-04-11"), ["garden", 2]),
          { ...later, today: LocalDate.parse("2031-04-11") },
        ).lines[0]?.retained,
      ).toHaveLength(1);
    });

    it("cannot add nights in the past to a stay that is already over", () => {
      expect(() =>
        planReservationChange(
          started,
          request(stay("2031-04-10", "2031-04-14"), ["garden", 2]),
          { today: LocalDate.parse("2031-04-20"), allowPriceOnly: false },
        ),
      ).toThrow(DomainValidationError);
    });
  });

  it("a stay that has not started cannot move its check in into the past", () => {
    expect(() =>
      planReservationChange(
        { stay: current, lines: [line("a")] },
        request(stay("2031-02-27", "2031-04-13"), ["garden", 2]),
        options,
      ),
    ).toThrow(DomainValidationError);
  });
});
