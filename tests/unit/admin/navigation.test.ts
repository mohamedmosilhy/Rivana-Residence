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

  it("marks a destination current on its own page and sub-pages only", () => {
    expect(isCurrentDestination("/admin", "/admin")).toBe(true);
    expect(isCurrentDestination("/admin/rooms", "/admin")).toBe(false);
    expect(isCurrentDestination("/admin/rooms/abc", "/admin/rooms")).toBe(true);
    expect(isCurrentDestination("/admin/roomsxyz", "/admin/rooms")).toBe(false);
  });
});
