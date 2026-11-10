import { describe, expect, it } from "vitest";

import {
  checkInventoryReduction,
  type InventoryReductionInput,
  type NightInventory,
} from "@/domain/inventory";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

const date = (value: string) => LocalDate.parse(value);
const range = (from: string, to: string) =>
  StayRange.create(date(from), date(to));
const blocked = range("2026-09-14", "2026-09-18");
const row = (night = "2026-09-15", capacity = 3, sold = 2): NightInventory => ({
  night: date(night),
  capacity,
  sold,
});
const input = (
  overrides: Partial<InventoryReductionInput> = {},
): InventoryReductionInput => ({
  unit: { active: true, blocks: [] },
  change: { kind: "BLOCK", range: blocked },
  nights: [],
  assignments: [],
  ...overrides,
});

describe("inventory reductions (AC-3, AC-4, applicable T-AV)", () => {
  it("allows a block when projected capacity exactly covers sold units", () => {
    expect(checkInventoryReduction(input({ nights: [row()] }))).toMatchObject({
      allowed: true,
      projectedNights: [{ capacity: 2, sold: 2, free: 0 }],
    });
  });

  it("rejects the earliest sold night that would fall below capacity", () => {
    expect(
      checkInventoryReduction(
        input({ nights: [row("2026-09-17", 2, 2), row("2026-09-15", 2, 2)] }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "CAPACITY",
      firstUnavailableNight: date("2026-09-15"),
      projectedNights: [
        { night: date("2026-09-15"), capacity: 1, free: -1 },
        { night: date("2026-09-17"), capacity: 1, free: -1 },
      ],
    });
  });

  it("allows empty sold nights and ignores counts outside the proposed block", () => {
    expect(
      checkInventoryReduction(
        input({ nights: [row("2026-09-15", 1, 0), row("2026-09-18", 1, 1)] }),
      ),
    ).toEqual({ allowed: true, projectedNights: [] });
  });

  it.each([
    ["2026-09-13", "2026-09-15"],
    ["2026-09-15", "2026-09-17"],
    ["2026-09-17", "2026-09-19"],
    ["2026-09-13", "2026-09-19"],
    ["2026-09-14", "2026-09-18"],
  ])(
    "rejects overlapping existing block %s to %s even without sold nights",
    (from, to) => {
      expect(
        checkInventoryReduction(
          input({
            unit: {
              active: true,
              blocks: [{ id: "existing", range: range(from, to) }],
            },
          }),
        ),
      ).toMatchObject({
        allowed: false,
        reason: "BLOCK_OVERLAP",
      });
    },
  );

  it("allows adjacent blocks at either half open boundary", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: {
            active: true,
            blocks: [
              { id: "before", range: range("2026-09-12", "2026-09-14") },
              { id: "after", range: range("2026-09-18", "2026-09-20") },
            ],
          },
        }),
      ).allowed,
    ).toBe(true);
  });

  it("rejects an assignment on the specific unit even when total capacity suffices", () => {
    expect(
      checkInventoryReduction(
        input({
          nights: [row("2026-09-15", 100, 1)],
          assignments: [range("2026-09-16", "2026-09-20")],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "UNIT_ASSIGNED",
      firstUnavailableNight: date("2026-09-16"),
    });
  });

  it("permits assignments ending at block start or starting at block end", () => {
    expect(
      checkInventoryReduction(
        input({
          assignments: [
            range("2026-09-12", "2026-09-14"),
            range("2026-09-18", "2026-09-20"),
          ],
        }),
      ).allowed,
    ).toBe(true);
  });

  it("reports the earliest conflict across capacity, assignment, and existing block checks", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: {
            active: true,
            blocks: [{ id: "late", range: range("2026-09-17", "2026-09-20") }],
          },
          assignments: [range("2026-09-16", "2026-09-17")],
          nights: [row("2026-09-15", 2, 2)],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "CAPACITY",
      firstUnavailableNight: date("2026-09-15"),
    });
  });

  it("replaces a block without subtracting the old and new block twice", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: { active: true, blocks: [{ id: "edited", range: blocked }] },
          change: { kind: "BLOCK", range: blocked, replaceBlockId: "edited" },
          nights: [row("2026-09-15", 2, 2)],
        }),
      ),
    ).toMatchObject({
      allowed: true,
      projectedNights: [{ capacity: 2, free: 0 }],
    });
  });

  it("checks newly blocked extension nights against the capacity before the edit", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: {
            active: true,
            blocks: [
              { id: "edited", range: range("2026-09-14", "2026-09-16") },
            ],
          },
          change: { kind: "BLOCK", range: blocked, replaceBlockId: "edited" },
          nights: [row("2026-09-15", 2, 2), row("2026-09-17", 2, 2)],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "CAPACITY",
      firstUnavailableNight: date("2026-09-17"),
    });
  });

  it("does not treat released dates in a shortened block as reductions", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: { active: true, blocks: [{ id: "edited", range: blocked }] },
          change: {
            kind: "BLOCK",
            range: range("2026-09-14", "2026-09-16"),
            replaceBlockId: "edited",
          },
          nights: [row("2026-09-15", 2, 2), row("2026-09-17", 2, 2)],
        }),
      ),
    ).toMatchObject({
      allowed: true,
      projectedNights: [{ night: date("2026-09-15"), capacity: 2 }],
    });
  });

  it("still checks the replacement against other blocks on the unit", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: {
            active: true,
            blocks: [
              { id: "edited", range: range("2026-09-14", "2026-09-16") },
              { id: "other", range: range("2026-09-17", "2026-09-20") },
            ],
          },
          change: { kind: "BLOCK", range: blocked, replaceBlockId: "edited" },
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "BLOCK_OVERLAP",
      firstUnavailableNight: date("2026-09-17"),
    });
  });

  it("does not reduce capacity again for a block on an inactive unit", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: { active: false, blocks: [] },
          nights: [row("2026-09-15", 2, 2)],
        }),
      ),
    ).toMatchObject({ allowed: true, projectedNights: [{ capacity: 2 }] });
  });

  it("deactivates from the explicit branch date and checks far beyond the public horizon", () => {
    expect(
      checkInventoryReduction(
        input({
          change: { kind: "DEACTIVATE", from: date("2026-09-15") },
          nights: [row("2026-09-14", 1, 1), row("2036-09-15", 1, 1)],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "CAPACITY",
      firstUnavailableNight: date("2036-09-15"),
    });
  });

  it("does not reduce an already blocked unit twice during deactivation", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: { active: true, blocks: [{ id: "existing", range: blocked }] },
          change: { kind: "DEACTIVATE", from: date("2026-09-14") },
          nights: [row("2026-09-15", 2, 2), row("2026-09-18", 3, 2)],
        }),
      ),
    ).toMatchObject({
      allowed: true,
      projectedNights: [{ capacity: 2 }, { capacity: 2 }],
    });
  });

  it("makes repeated deactivation a capacity no op", () => {
    expect(
      checkInventoryReduction(
        input({
          unit: { active: false, blocks: [] },
          change: { kind: "DEACTIVATE", from: date("2026-09-14") },
          nights: [row("2026-09-15", 2, 2)],
        }),
      ),
    ).toMatchObject({ allowed: true, projectedNights: [{ capacity: 2 }] });
  });

  it("rejects future and in progress assignments on a deactivated active unit", () => {
    expect(
      checkInventoryReduction(
        input({
          change: { kind: "DEACTIVATE", from: date("2026-09-15") },
          assignments: [
            range("2036-01-01", "2036-01-03"),
            range("2026-09-14", "2026-09-16"),
          ],
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "UNIT_ASSIGNED",
      firstUnavailableNight: date("2026-09-15"),
    });
  });

  it("ignores assignments completed on or before deactivation", () => {
    expect(
      checkInventoryReduction(
        input({
          change: { kind: "DEACTIVATE", from: date("2026-09-15") },
          assignments: [range("2026-09-12", "2026-09-15")],
        }),
      ).allowed,
    ).toBe(true);
  });

  it("checks a very long block using only sparse sold nights and assignment ranges", () => {
    const result = checkInventoryReduction(
      input({
        change: { kind: "BLOCK", range: range("0001-01-01", "9999-12-31") },
        nights: [row("9000-01-01", 2, 1), row("0001-01-01", 2, 1)],
        assignments: [range("9500-01-01", "9500-01-02")],
      }),
    );
    expect(result).toMatchObject({
      allowed: false,
      reason: "UNIT_ASSIGNED",
      firstUnavailableNight: date("9500-01-01"),
    });
    expect(result.projectedNights).toHaveLength(2);
  });

  it("allows a long empty block without synthesizing millions of date rows", () => {
    expect(
      checkInventoryReduction(
        input({
          change: { kind: "BLOCK", range: range("0001-01-01", "9999-12-31") },
        }),
      ),
    ).toEqual({ allowed: true, projectedNights: [] });
  });

  it("rejects a replacement id absent from the current unit", () => {
    expect(() =>
      checkInventoryReduction(
        input({
          change: { kind: "BLOCK", range: blocked, replaceBlockId: "absent" },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("rejects duplicate block identities", () => {
    expect(() =>
      checkInventoryReduction(
        input({
          unit: {
            active: true,
            blocks: [
              { id: "same", range: blocked },
              { id: "same", range: blocked },
            ],
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("rejects counts inconsistent with the currently contributing unit", () => {
    expect(() =>
      checkInventoryReduction(input({ nights: [row("2026-09-15", 0, 1)] })),
    ).toThrow(DomainValidationError);
  });

  it("validates duplicate or malformed sold counts through the public reduction entry point", () => {
    expect(() =>
      checkInventoryReduction(input({ nights: [row(), row()] })),
    ).toThrow(DomainValidationError);
    expect(() =>
      checkInventoryReduction(input({ nights: [row("2026-09-15", 3, -1)] })),
    ).toThrow(DomainValidationError);
  });

  it("does not mutate caller state and returns immutable projected records", () => {
    const state = input({ nights: [row()] });
    const result = checkInventoryReduction(state);
    expect(state.unit.blocks).toEqual([]);
    expect(state.nights[0]?.capacity).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.projectedNights)).toBe(true);
    expect(Object.isFrozen(result.projectedNights[0])).toBe(true);
  });
});
