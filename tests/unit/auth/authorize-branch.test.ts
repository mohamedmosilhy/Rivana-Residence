// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  authorizeBranch,
  branchScope,
  inBranchScope,
} from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { StaffRole } from "@/domain/shared/types";

// AC-5: Admin everywhere; Receptionist and Manager only on assigned
// branches; Editor never; no assignment means no branch data (ADR 018).

const staff = (
  role: StaffRole,
  branchIds: readonly string[] = [],
): StaffPrincipal => ({
  id: `${role.toLowerCase()}-1`,
  name: "Staff",
  email: "staff@example.test",
  role,
  sessionId: "session-1",
  branchIds,
});

describe("authorizeBranch", () => {
  it("lets an administrator act on any branch", () => {
    expect(
      authorizeBranch(staff("ADMIN"), "reservations:read", "branch-z").ok,
    ).toBe(true);
  });

  it.each(["RECEPTIONIST", "MANAGER"] as const)(
    "lets a %s act on an assigned branch",
    (role) => {
      expect(
        authorizeBranch(
          staff(role, ["branch-a", "branch-b"]),
          "reservations:read",
          "branch-b",
        ),
      ).toEqual({ ok: true, value: staff(role, ["branch-a", "branch-b"]) });
    },
  );

  it.each(["RECEPTIONIST", "MANAGER"] as const)(
    "refuses a %s on a branch they are not assigned to",
    (role) => {
      expect(
        authorizeBranch(
          staff(role, ["branch-a"]),
          "reservations:read",
          "branch-b",
        ),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    },
  );

  it("refuses a receptionist with no assignment on every branch", () => {
    expect(
      authorizeBranch(staff("RECEPTIONIST"), "reservations:read", "branch-a"),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("refuses an editor even for a capability editors hold", () => {
    expect(
      authorizeBranch(staff("EDITOR"), "content:edit", "branch-a"),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("checks the capability before the branch", () => {
    expect(
      authorizeBranch(
        staff("RECEPTIONIST", ["branch-a"]),
        "pricing:manage",
        "branch-a",
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Your role does not allow this action.",
      },
    });
  });

  it("treats a missing session as unauthenticated", () => {
    expect(
      authorizeBranch(null, "reservations:read", "branch-a"),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("ignores assignment rows on an administrator or editor principal", () => {
    expect(
      authorizeBranch(staff("EDITOR", ["branch-a"]), "content:edit", "branch-a")
        .ok,
    ).toBe(false);
  });
});

describe("branchScope", () => {
  it.each(["ADMIN", "EDITOR"] as const)("gives %s every branch", (role) => {
    expect(branchScope(staff(role))).toBe("ALL");
  });

  it("limits a manager to assigned branches, and none without assignments", () => {
    expect(branchScope(staff("MANAGER", ["branch-a"]))).toEqual(["branch-a"]);
    expect(branchScope(staff("MANAGER"))).toEqual([]);
  });

  it("never matches a row without a branch for a scoped list", () => {
    expect(inBranchScope(["branch-a"], null)).toBe(false);
    expect(inBranchScope(["branch-a"], "branch-a")).toBe(true);
    expect(inBranchScope("ALL", null)).toBe(true);
  });
});
