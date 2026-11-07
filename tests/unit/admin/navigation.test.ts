import { describe, expect, it } from "vitest";

import {
  isCurrentDestination,
  navigationFor,
} from "@/presentation/admin/navigation";

describe("admin navigation", () => {
  it("shows editors every content destination but no administration", () => {
    expect(navigationFor("EDITOR").map((item) => item.label)).toEqual([
      "Overview",
      "Pages",
      "Rooms",
      "Facilities",
      "Media",
      "Promotions",
      "Enquiries",
    ]);
  });

  it("adds Settings and Staff for administrators", () => {
    expect(navigationFor("ADMIN").map((item) => item.label)).toEqual([
      "Overview",
      "Pages",
      "Rooms",
      "Facilities",
      "Media",
      "Promotions",
      "Enquiries",
      "Settings",
      "Staff",
    ]);
  });

  // AC-4: no CMS destination for branch-scoped roles; Enquiries stays (Q-26).
  it.each(["RECEPTIONIST", "MANAGER"] as const)(
    "shows %s only the overview and enquiries",
    (role) => {
      expect(navigationFor(role).map((item) => item.label)).toEqual([
        "Overview",
        "Enquiries",
      ]);
    },
  );

  it("marks a destination current on its own page and sub-pages only", () => {
    expect(isCurrentDestination("/admin", "/admin")).toBe(true);
    expect(isCurrentDestination("/admin/rooms", "/admin")).toBe(false);
    expect(isCurrentDestination("/admin/rooms/abc", "/admin/rooms")).toBe(true);
    expect(isCurrentDestination("/admin/roomsxyz", "/admin/rooms")).toBe(false);
  });
});
