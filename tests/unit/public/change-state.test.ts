import { describe, expect, it } from "vitest";

import { changeFailure } from "@/presentation/features/booking/change-problems";
import {
  changeFacts,
  changeField,
  changeInput,
  checkChange,
  prefillChange,
  type ChangeForm,
} from "@/presentation/features/booking/change-state";
import type { ApiProblem } from "@/presentation/api-client/result";

import { booking, currentQuote, transferLine } from "./change-fixtures";

const base = prefillChange(currentQuote(), booking());
const edited = (patch: Partial<ChangeForm>, from = base) => ({
  ...from,
  ...patch,
});
const withTransfer = prefillChange(
  currentQuote({ services: [transferLine(2)] }),
  booking({
    price: {
      ...booking().price!,
      services: [
        {
          kind: "AIRPORT_TRANSFER",
          amountMinor: 5000,
          vehicles: 2,
          details: "MS 985, 14:30",
        },
      ],
    },
  }),
);

describe("filling the change form", () => {
  it("takes the stay, units and extras from the preview and the rest from the booking", () => {
    expect(withTransfer).toEqual({
      checkIn: "2026-12-03",
      checkOut: "2026-12-05",
      units: [
        {
          id: 1,
          roomSlug: "deluxe",
          roomName: "Deluxe Double",
          adults: 2,
          children: 0,
        },
      ],
      breakfast: false,
      transfer: true,
      cars: 2,
      flightDetails: "MS 985, 14:30",
      fullName: "Amina Hassan",
      email: "amina@example.test",
      specialRequests: "A quiet room",
    });
  });
});

describe("what is sent", () => {
  it("sends nothing for an untouched form", () => {
    expect(changeInput(base, base)).toBeNull();
    expect(changeInput(withTransfer, withTransfer)).toBeNull();
  });

  it("does not count capitals, spaces, line breaks or unit order as a change", () => {
    const two = edited({
      units: [
        ...base.units,
        {
          id: 2,
          roomSlug: "family",
          roomName: "Family Apartment",
          adults: 1,
          children: 1,
        },
      ],
    });
    expect(
      changeInput(
        two,
        edited(
          {
            units: [...two.units].reverse(),
            fullName: "  Amina Hassan ",
            email: "AMINA@Example.Test",
            specialRequests: "A quiet room\n",
          },
          two,
        ),
      ),
    ).toBeNull();
  });

  it("sends only the dates when only the dates changed", () => {
    expect(changeInput(base, edited({ checkOut: "2026-12-06" }))).toEqual({
      stay: { checkIn: "2026-12-03", checkOut: "2026-12-06" },
    });
  });

  it("sends every unit when a guest count changed", () => {
    expect(
      changeInput(base, edited({ units: [{ ...base.units[0]!, adults: 1 }] })),
    ).toEqual({
      lines: [{ roomSlug: "deluxe", occupancy: { adults: 1, children: 0 } }],
    });
  });

  it("sends a new transfer with its cars and flight", () => {
    expect(
      changeInput(
        base,
        edited({ transfer: true, cars: 2, flightDetails: " MS 1 " }),
      ),
    ).toEqual({
      services: [{ kind: "AIRPORT_TRANSFER", vehicles: 2, details: "MS 1" }],
    });
  });

  it("sends only what changed on a kept transfer, so the server keeps the rest", () => {
    expect(
      changeInput(withTransfer, edited({ cars: 3 }, withTransfer))?.services,
    ).toEqual([{ kind: "AIRPORT_TRANSFER", vehicles: 3 }]);
    // An empty text clears the flight.
    expect(
      changeInput(withTransfer, edited({ flightDetails: "" }, withTransfer))
        ?.services,
    ).toEqual([{ kind: "AIRPORT_TRANSFER", details: "" }]);
    expect(
      changeInput(withTransfer, edited({ breakfast: true }, withTransfer))
        ?.services,
    ).toEqual(["BREAKFAST", { kind: "AIRPORT_TRANSFER" }]);
  });

  it("sends an empty list when every extra is removed", () => {
    expect(
      changeInput(withTransfer, edited({ transfer: false }, withTransfer)),
    ).toEqual({ services: [] });
  });

  it("ignores cars and flight typed for a transfer that is not chosen", () => {
    expect(
      changeInput(base, edited({ cars: 3, flightDetails: "MS 1" })),
    ).toBeNull();
  });

  it("sends only the changed contact fields, and an empty text to clear one", () => {
    expect(
      changeInput(
        base,
        edited({ email: "new@example.test", specialRequests: " " }),
      ),
    ).toEqual({
      guest: { email: "new@example.test", specialRequests: "" },
    });
  });
});

describe("checks in the browser", () => {
  it("checks only what changed", () => {
    const old = edited({ email: "not an address", fullName: "" });
    expect(checkChange(old, edited({ checkOut: "2026-12-06" }, old))).toEqual(
      [],
    );
  });

  it("names the field of each wrong value", () => {
    expect(
      checkChange(
        base,
        edited({
          checkOut: "2026-12-03",
          fullName: " ",
          email: "",
          specialRequests: "a\u0000b",
        }),
      ).map(({ field }) => field),
    ).toEqual([
      changeField.checkOut,
      changeField.fullName,
      changeField.email,
      changeField.specialRequests,
    ]);
  });

  it("asks for both dates", () => {
    expect(
      checkChange(base, edited({ checkIn: "", checkOut: "" })),
    ).toHaveLength(2);
  });
});

describe("the review list", () => {
  it("lists each changed part as it was and as it would be", () => {
    const facts = changeFacts(
      withTransfer,
      edited(
        { checkOut: "2026-12-06", transfer: false, specialRequests: "" },
        withTransfer,
      ),
    );
    expect(facts.map(({ label }) => label)).toEqual([
      "Dates",
      "Extras",
      "Special requests",
    ]);
    expect(facts[1]).toEqual({
      label: "Extras",
      before: "Airport transfer, 2 cars, MS 985, 14:30",
      after: "None",
    });
    expect(facts[2]!.after).toBe("None");
  });
});

describe("what a refusal means", () => {
  const problem = (
    code: string,
    extra: Partial<ApiProblem> = {},
  ): ApiProblem => ({
    code: code as ApiProblem["code"],
    status: 400,
    title: "Refused",
    ...extra,
  });

  it.each([
    ["UNAUTHENTICATED", "access"],
    ["PHONE_NOT_VERIFIED", "access"],
    ["STALE_VERSION", "stale"],
    ["PRECONDITION_REQUIRED", "stale"],
    ["PRICE_CHANGED", "price"],
    ["INVENTORY_UNAVAILABLE", "taken"],
    ["NOT_FOUND", "gone"],
    ["TRY_AGAIN", "busy"],
    ["NETWORK", "unknown"],
    ["UNEXPECTED_RESPONSE", "unknown"],
    ["ABORTED", "unknown"],
    ["INTERNAL", "unknown"],
    ["A_NEW_CODE", "unknown"],
  ])("reads %s as %s", (code, kind) => {
    expect(changeFailure(problem(code), "MANAGE_LINK").kind).toBe(kind);
  });

  it("ends a session key as a session", () => {
    expect(changeFailure(problem("UNAUTHENTICATED"), "SESSION")).toEqual({
      kind: "access",
      refusal: "session",
    });
  });

  it.each([
    ["DEADLINE_PASSED", "DEADLINE_PASSED"],
    ["REQUEST_OPEN", "REQUEST_OPEN"],
    ["PHONE_BLOCKED", "PHONE_BLOCKED"],
    ["SOMETHING_ELSE", "STATUS"],
  ])("closes the change for the reason %s", (reason, expected) => {
    expect(
      changeFailure(
        problem("CHANGE_NOT_ALLOWED", { context: { reason } }),
        "MANAGE_LINK",
      ),
    ).toEqual({ kind: "closed", reason: expected });
  });

  it("puts each server field message on its control", () => {
    expect(
      changeFailure(
        problem("VALIDATION", {
          fieldErrors: {
            "stay.checkOut": ["Too long."],
            "lines.1.occupancy": ["Too many."],
            "services.0.vehicles": ["Fewer cars."],
            "guest.email": ["Wrong."],
            stay: ["Nothing was changed."],
          },
        }),
        "MANAGE_LINK",
      ),
    ).toEqual({
      kind: "fields",
      errors: [
        { field: changeField.checkOut, message: "Too long." },
        { field: changeField.unit(1), message: "Too many." },
        { field: changeField.cars, message: "Fewer cars." },
        { field: changeField.email, message: "Wrong." },
        { field: null, message: "Nothing was changed." },
      ],
    });
  });

  it("waits as long as the server asks", () => {
    expect(
      changeFailure(problem("RATE_LIMITED", { retryAfter: 90 }), "MANAGE_LINK"),
    ).toEqual({ kind: "wait", seconds: 90 });
  });
});
