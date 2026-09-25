import { describe, expect, it } from "vitest";

import { formatDateTime, plural } from "@/presentation/admin/format";

describe("admin formatting", () => {
  it("formats times in the property time zone and names the zone", () => {
    const value = new Date("2026-09-25T10:30:00Z");
    expect(formatDateTime(value, "Africa/Cairo")).toMatch(
      /^25 Sept? 2026, 13:30 (EEST|GMT\+3)$/,
    );
    expect(formatDateTime(value, "UTC")).toMatch(/10:30 UTC$/);
  });

  it("pluralizes counts", () => {
    expect(plural(1, "image")).toBe("1 image");
    expect(plural(2, "enquiry", "enquiries")).toBe("2 enquiries");
  });
});
