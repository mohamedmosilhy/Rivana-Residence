import { describe, expect, it } from "vitest";

import {
  localDateAt,
  isValidTimeZone,
  utcToZonedLocal,
  zonedLocalToUtc,
} from "@/domain/shared/zoned-time";
import { DomainValidationError } from "@/domain/shared/domain-error";

describe("property time zone conversion", () => {
  it("converts Cairo wall-clock time in winter (UTC+2) and summer (UTC+3)", () => {
    expect(
      zonedLocalToUtc("2026-01-15T09:00", "Africa/Cairo")?.toISOString(),
    ).toBe("2026-01-15T07:00:00.000Z");
    expect(
      zonedLocalToUtc("2026-07-15T09:00", "Africa/Cairo")?.toISOString(),
    ).toBe("2026-07-15T06:00:00.000Z");
  });

  it("round-trips through the form value", () => {
    for (const value of [
      "2026-01-01T00:00",
      "2026-07-31T23:59",
      "2026-10-29T12:30",
    ]) {
      const utc = zonedLocalToUtc(value, "Africa/Cairo")!;
      expect(utcToZonedLocal(utc, "Africa/Cairo")).toBe(value);
    }
  });

  it("formats an instant as local wall-clock time", () => {
    expect(
      utcToZonedLocal(new Date("2026-09-25T21:05:00Z"), "Africa/Cairo"),
    ).toBe("2026-09-26T00:05");
    expect(utcToZonedLocal(new Date("2026-09-25T21:05:00Z"), "UTC")).toBe(
      "2026-09-25T21:05",
    );
  });

  it("resolves a time skipped by the spring-forward jump to a real instant", () => {
    // Cairo moves 00:00 → 01:00 on the last Friday of April 2026 (24 April).
    const result = zonedLocalToUtc("2026-04-24T00:30", "Africa/Cairo");
    expect(result).not.toBeNull();
    expect(utcToZonedLocal(result!, "Africa/Cairo")).toMatch(/^2026-04-2[34]T/);
  });

  it.each([
    "",
    "2026-02-30T10:00",
    "2026-13-01T10:00",
    "2026-01-01T24:00",
    "2026-01-01 10:00",
    "tomorrow",
  ])("rejects %o", (value) => {
    expect(zonedLocalToUtc(value, "Africa/Cairo")).toBeNull();
  });

  it("validates time zone names", () => {
    expect(isValidTimeZone("Africa/Cairo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("branch calendar date (AC-3, T-DATE-8)", () => {
  it.each([
    ["2026-09-25T21:05:00Z", "Africa/Cairo", "2026-09-26"],
    ["2026-09-25T21:05:00Z", "UTC", "2026-09-25"],
    ["2026-01-01T01:00:00Z", "America/New_York", "2025-12-31"],
    ["2026-04-23T21:59:59Z", "Africa/Cairo", "2026-04-23"],
    ["2026-04-23T22:00:00Z", "Africa/Cairo", "2026-04-24"],
    ["2026-10-29T20:59:59Z", "Africa/Cairo", "2026-10-29"],
    ["2026-10-29T21:00:00Z", "Africa/Cairo", "2026-10-29"],
    ["2026-10-29T22:00:00Z", "Africa/Cairo", "2026-10-30"],
    ["0001-01-01T00:00:00Z", "UTC", "0001-01-01"],
  ])("derives %s in %s as %s", (instant, zone, expected) => {
    expect(localDateAt(new Date(instant), zone).toString()).toBe(expected);
  });

  it("rejects an invalid clock instant", () => {
    expect(() => localDateAt(new Date(NaN), "Africa/Cairo")).toThrow(
      DomainValidationError,
    );
  });

  it("rejects an invalid branch time zone", () => {
    expect(() =>
      localDateAt(new Date("2026-01-01T00:00:00Z"), "Mars/Olympus"),
    ).toThrow(DomainValidationError);
  });

  it.each(["0000-01-01T00:00:00Z", "+010000-01-01T00:00:00Z"])(
    "rejects a branch date outside the supported Gregorian years for %s",
    (instant) => {
      expect(() => localDateAt(new Date(instant), "UTC")).toThrow(
        DomainValidationError,
      );
    },
  );
});
