import { describe, expect, it } from "vitest";
import { CancellationDeadline } from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";

const day = LocalDate.parse;
const cairo = (checkInTime: string | null) => ({
  timeZone: "Africa/Cairo",
  checkInTime,
});

describe("T-CXL-1: CancellationDeadline (CX-1)", () => {
  it("is 24 hours before the check-in time in the branch zone (winter, UTC+2)", () => {
    expect(
      CancellationDeadline.for(
        cairo("14:00"),
        day("2026-01-15"),
      )?.toISOString(),
    ).toBe("2026-01-14T12:00:00.000Z");
  });
  it("follows summer time (UTC+3)", () => {
    expect(
      CancellationDeadline.for(
        cairo("14:00"),
        day("2026-07-15"),
      )?.toISOString(),
    ).toBe("2026-07-14T11:00:00.000Z");
  });
  it("is an absolute 24 hours when daylight saving starts in between", () => {
    // Cairo moves to UTC+3 on 2026-04-24: arrival 14:00 is 11:00Z, so the
    // deadline is 11:00Z the day before, which is 13:00 local on that day.
    const deadline = CancellationDeadline.for(
      cairo("14:00"),
      day("2026-04-24"),
    );
    expect(deadline?.toISOString()).toBe("2026-04-23T11:00:00.000Z");
  });
  it("is an absolute 24 hours when daylight saving ends in between", () => {
    // Cairo returns to UTC+2 on 2026-10-30 at 00:00 local (23:00 on the 29th).
    // Arrival 14:00 on the 30th is 12:00Z; 24 hours earlier is 12:00Z on the
    // 29th, which is still summer time, so 15:00 local on that day.
    const deadline = CancellationDeadline.for(
      cairo("14:00"),
      day("2026-10-30"),
    );
    expect(deadline?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
  });
  it("uses the branch zone, not the server zone", () => {
    expect(
      CancellationDeadline.for(
        { timeZone: "UTC", checkInTime: "14:00" },
        day("2026-07-15"),
      )?.toISOString(),
    ).toBe("2026-07-14T14:00:00.000Z");
  });
  it("is null without a branch check-in time", () => {
    expect(CancellationDeadline.for(cairo(null), day("2026-07-15"))).toBeNull();
  });
  it.each(["2pm", "24:00", "14:60", "9:00", ""])(
    "rejects the check-in time %j",
    (checkInTime) => {
      expect(() =>
        CancellationDeadline.for(cairo(checkInTime), day("2026-07-15")),
      ).toThrow(DomainValidationError);
    },
  );
  it("rejects an unknown time zone", () => {
    expect(() =>
      CancellationDeadline.for(
        { timeZone: "Mars/Base", checkInTime: "14:00" },
        day("2026-07-15"),
      ),
    ).toThrow(DomainValidationError);
  });
});

describe("T-CXL-2: requests close at the deadline (CX-1, Q-64)", () => {
  const deadline = CancellationDeadline.for(cairo("14:00"), day("2026-01-15"));
  it("is open strictly before the deadline", () => {
    expect(
      CancellationDeadline.isOpen(
        deadline,
        new Date("2026-01-14T11:59:59.999Z"),
      ),
    ).toBe(true);
    expect(CancellationDeadline.isOpen(deadline, deadline!)).toBe(false);
    expect(
      CancellationDeadline.isOpen(
        deadline,
        new Date("2026-01-14T12:00:00.001Z"),
      ),
    ).toBe(false);
  });
  it("never opens for a booking made inside the 24-hour window", () => {
    const madeAt = new Date("2026-01-14T18:00:00.000Z");
    expect(CancellationDeadline.isOpen(deadline, madeAt)).toBe(false);
  });
  it("never opens without a deadline", () => {
    expect(CancellationDeadline.isOpen(null, new Date("2020-01-01"))).toBe(
      false,
    );
  });
  it("rejects an invalid instant", () => {
    expect(() =>
      CancellationDeadline.isOpen(deadline, new Date("nope")),
    ).toThrow(DomainValidationError);
  });
});
