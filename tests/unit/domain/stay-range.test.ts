import { describe, expect, it } from "vitest";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

const range = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));

describe("StayRange (AC-3, T-DATE-2 through T-DATE-5)", () => {
  it("includes check-in and excludes check-out when iterating nights", () => {
    const stay = range("2028-02-28", "2028-03-02");
    expect(stay.nightCount).toBe(3);
    expect(Array.from(stay.nights(), (night) => night.toString())).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("counts calendar nights across year and Cairo DST boundaries", () => {
    expect(range("2026-12-31", "2027-01-02").nightCount).toBe(2);
    expect(range("2026-04-23", "2026-04-25").nightCount).toBe(2);
    expect(range("2026-10-29", "2026-10-31").nightCount).toBe(2);
  });

  it.each([
    ["2026-11-08", "2026-11-08"],
    ["2026-11-09", "2026-11-08"],
  ])("rejects a nonpositive range %s to %s", (from, to) => {
    expect(() => range(from, to)).toThrow(DomainValidationError);
    try {
      range(from, to);
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      if (error instanceof DomainValidationError) {
        expect(error.issues.map((issue) => issue.path)).toContain("checkOut");
      }
    }
  });

  it.each([
    ["2026-11-06", "2026-11-08", false],
    ["2026-11-12", "2026-11-14", false],
    ["2026-11-01", "2026-11-07", false],
    ["2026-11-13", "2026-11-15", false],
    ["2026-11-07", "2026-11-09", true],
    ["2026-11-11", "2026-11-13", true],
    ["2026-11-09", "2026-11-11", true],
    ["2026-11-07", "2026-11-13", true],
    ["2026-11-08", "2026-11-12", true],
  ] as const)(
    "checks overlap with %s to %s symmetrically",
    (from, to, expected) => {
      const stay = range("2026-11-08", "2026-11-12");
      const other = range(from, to);
      expect(stay.overlaps(other)).toBe(expected);
      expect(other.overlaps(stay)).toBe(expected);
    },
  );

  it("constructs a long structural range without applying public stay limits", () => {
    const stay = range("0001-01-01", "9999-12-31");
    expect(stay.nightCount).toBe(3652058);
    const nights = stay.nights();
    expect(nights.next().value?.toString()).toBe("0001-01-01");
    expect(nights.next().value?.toString()).toBe("0001-01-02");
    nights.return?.();
  });
});
