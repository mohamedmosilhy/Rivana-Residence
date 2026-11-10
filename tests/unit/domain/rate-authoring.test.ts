import { describe, expect, it } from "vitest";

import {
  RATE_AMOUNT_MAX_MINOR,
  mergeRatePeriodRange,
  parseBaseRateInput,
  parseRatePeriodInput,
  parseRatePeriodPatch,
  parseRateReadWindow,
} from "@/domain/pricing";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });
const range = (from: string, to: string) =>
  StayRange.create(LocalDate.parse(from), LocalDate.parse(to));

describe("rate authoring (M6 AC-2 and AC-7)", () => {
  it("accepts the full positive PostgreSQL integer range for USD", () => {
    expect(parseBaseRateInput({ amount: usd(1) }).ok).toBe(true);
    expect(parseBaseRateInput({ amount: usd(RATE_AMOUNT_MAX_MINOR) }).ok).toBe(
      true,
    );
  });

  it.each([0, -1, RATE_AMOUNT_MAX_MINOR + 1, 1.5])(
    "rejects an amount of %s cents",
    (amountMinor) => {
      expect(parseBaseRateInput({ amount: usd(amountMinor) })).toMatchObject({
        ok: false,
      });
    },
  );

  it("rejects another currency and unknown fields", () => {
    expect(
      parseBaseRateInput({ amount: { amountMinor: 100, currency: "EGP" } }),
    ).toMatchObject({ ok: false });
    expect(
      parseBaseRateInput({ amount: usd(100), roomTypeId: "foreign" }),
    ).toMatchObject({ ok: false });
  });

  it("parses a period, trims its label, and keeps a half open range", () => {
    const parsed = parseRatePeriodInput({
      startDate: "2031-06-01",
      endDate: "2031-06-10",
      amount: usd(6_000),
      label: "  High season  ",
    });
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        range: {
          checkIn: { value: "2031-06-01" },
          checkOut: { value: "2031-06-10" },
        },
        amount: { amountMinor: 6_000 },
        label: "High season",
      },
    });
  });

  it("turns a blank or explicit null label into null", () => {
    for (const label of ["   ", null]) {
      expect(
        parseRatePeriodInput({
          startDate: "2031-06-01",
          endDate: "2031-06-10",
          amount: usd(6_000),
          label,
        }),
      ).toMatchObject({ ok: true, value: { label: null } });
    }
  });

  it.each([
    { startDate: "2031-06-01", endDate: "2031-06-01" },
    { startDate: "2031-06-02", endDate: "2031-06-01" },
    { startDate: "2031-02-30", endDate: "2031-03-01" },
  ])("rejects invalid period dates %#", (dates) => {
    expect(
      parseRatePeriodInput({ ...dates, amount: usd(6_000) }),
    ).toMatchObject({ ok: false });
  });

  it("requires one patch field and parses every supported field", () => {
    expect(parseRatePeriodPatch({})).toMatchObject({ ok: false });
    expect(
      parseRatePeriodPatch({
        startDate: "2031-06-02",
        endDate: "2031-06-11",
        amount: usd(7_000),
        label: null,
        active: false,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        startDate: { value: "2031-06-02" },
        endDate: { value: "2031-06-11" },
        amount: { amountMinor: 7_000 },
        label: null,
        active: false,
      },
    });
  });

  it("validates the merged range after a partial patch", () => {
    const current = range("2031-06-01", "2031-06-10");
    const invalid = mergeRatePeriodRange(current, {
      startDate: LocalDate.parse("2031-06-10"),
    });
    expect(invalid).toMatchObject({
      ok: false,
      issues: [{ path: "endDate" }],
    });
  });

  it("accepts exactly 62 read nights and rejects 63", () => {
    expect(
      parseRateReadWindow({ from: "2031-06-01", to: "2031-08-02" }).ok,
    ).toBe(true);
    expect(
      parseRateReadWindow({ from: "2031-06-01", to: "2031-08-03" }),
    ).toMatchObject({ ok: false, issues: [{ path: "to" }] });
  });

  it("rejects impossible, reversed, missing, and unknown read fields", () => {
    for (const query of [
      { from: "2031-02-30", to: "2031-03-01" },
      { from: "2031-06-02", to: "2031-06-01" },
      { from: "2031-06-01" },
      { from: "2031-06-01", to: "2031-06-02", extra: true },
    ]) {
      expect(parseRateReadWindow(query).ok).toBe(false);
    }
  });
});
