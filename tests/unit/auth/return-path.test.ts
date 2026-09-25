import { describe, expect, it } from "vitest";

import { loginPathFor, safeReturnPath } from "@/application/auth/return-path";

describe("safe return paths", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/account", "/admin/account"],
    ["/admin/rooms?status=draft", "/admin/rooms?status=draft"],
    ["/admin/../admin/account", "/admin/account"],
  ])("keeps internal admin path %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    ["/admin/account"],
    "",
    "admin",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example",
    "\\\\evil.example",
    "/admin\\..\\..\\evil",
    "/%2F%2Fevil.example",
    "/admin/%2e%2e%2f%2e%2e%2fevil",
    "javascript:alert(1)",
    "/admin\u0000",
    "/admin\nLocation: https://evil.example",
    "/",
    "/about",
    "/administrator",
    "/admin/../about",
    "/admin/login",
    "/admin/login?returnTo=/admin",
    `/admin/${"a".repeat(600)}`,
  ])("falls back to /admin for %j", (input) => {
    expect(safeReturnPath(input)).toBe("/admin");
  });

  it("builds login URLs that carry only safe return paths", () => {
    expect(loginPathFor("/admin")).toBe("/admin/login");
    expect(loginPathFor("/admin/account?tab=security")).toBe(
      "/admin/login?returnTo=%2Fadmin%2Faccount%3Ftab%3Dsecurity",
    );
    expect(loginPathFor("https://evil.example")).toBe("/admin/login");
  });
});
