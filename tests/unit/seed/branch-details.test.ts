import { describe, expect, it } from "vitest";

import { parseBranchUpdate } from "@/domain/branches";

import { BRANCH } from "../../../prisma/initial-content/content";

describe("seeded branch details (F08)", () => {
  it("pass the same rules the dashboard and API apply to a branch", () => {
    const parsed = parseBranchUpdate({ ...BRANCH });
    expect(
      parsed.success,
      parsed.success ? "" : JSON.stringify(parsed.error.issues),
    ).toBe(true);
  });

  it("give the branch a Google Maps embed link, coordinates, and check-in times", () => {
    expect(
      BRANCH.mapEmbedUrl.startsWith("https://www.google.com/maps/embed"),
    ).toBe(true);
    expect(BRANCH.latitude).toBeCloseTo(30.016, 2);
    expect(BRANCH.longitude).toBeCloseTo(31.493, 2);
    expect(BRANCH.checkInTime).toBe("14:00");
    expect(BRANCH.checkOutTime).toBe("12:00");
  });
});
