import { describe, expect, it } from "vitest";

import { authorize } from "@/application/auth/authorize";
import {
  CAPABILITIES,
  capabilitiesFor,
  roleHasCapability,
  type Capability,
} from "@/domain/auth/capabilities";

// T-AUTHZ-1: the reviewed role/capability matrix, transcribed from
// docs/requirements/user-roles-and-permissions.md (columns Editor,
// Receptionist, Manager, Admin). Changing a row here is a deliberate security
// decision and must be reflected in that document.
const ROLES = ["EDITOR", "RECEPTIONIST", "MANAGER", "ADMIN"] as const;
type Row = readonly [
  editor: 0 | 1,
  receptionist: 0 | 1,
  manager: 0 | 1,
  admin: 0 | 1,
];

const MATRIX: Record<Capability, Row> = {
  "admin:access": [1, 1, 1, 1],
  "content:edit": [1, 0, 0, 1],
  "content:publish": [1, 0, 0, 1],
  "content:archive": [1, 0, 0, 1],
  "content:delete": [0, 0, 0, 1],
  "media:upload": [1, 0, 0, 1],
  "media:delete": [0, 0, 0, 1],
  "media:rights": [0, 0, 0, 1],
  // Receptionists and Managers read their branches' enquiries (Q-26).
  "enquiries:read": [1, 1, 1, 1],
  "enquiries:manage": [1, 1, 1, 1],
  "settings:edit": [0, 0, 0, 1],
  "users:manage": [0, 0, 0, 1],
  "sessions:manage-own": [1, 1, 1, 1],
  "sessions:revoke-any": [0, 0, 0, 1],
  "reservations:read": [0, 1, 1, 1],
  "reservations:create": [0, 1, 1, 1],
  "reservations:record-external": [0, 1, 1, 1],
  "reservations:pms-entry": [0, 1, 1, 1],
  "reservations:modify": [0, 1, 1, 1],
  "reservations:cancel": [0, 1, 1, 1],
  "reservations:cancel-paid": [0, 0, 1, 1],
  "reservations:front-desk": [0, 1, 1, 1],
  "cancellations:decide": [0, 0, 1, 1],
  "guests:read": [0, 1, 1, 1],
  "guests:block": [0, 0, 1, 1],
  "inventory:read": [0, 1, 1, 1],
  "inventory:block": [0, 1, 1, 1],
  "inventory:manage": [0, 0, 1, 1],
  "pricing:read": [0, 1, 1, 1],
  "pricing:manage": [0, 0, 1, 1],
  "pricing:override": [0, 0, 1, 1],
  "services:manage": [0, 0, 1, 1],
  "coupons:manage": [0, 0, 1, 1],
  "tax:manage": [0, 0, 0, 1],
  "marketing:broadcast": [0, 0, 1, 1],
  "reports:read": [0, 0, 1, 1],
  "audit:read": [0, 0, 1, 1],
  "branches:manage": [0, 0, 0, 1],
};

const staff = (role: (typeof ROLES)[number]) => ({
  id: "user-1",
  name: "Staff",
  email: "staff@example.test",
  role,
  sessionId: "session-1",
  branchIds: [],
});

describe("role capability matrix", () => {
  it("covers every capability", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CAPABILITIES].sort());
  });

  it.each(
    CAPABILITIES.flatMap((capability) =>
      ROLES.map(
        (role, column) =>
          [role, capability, MATRIX[capability][column] === 1] as const,
      ),
    ),
  )("%s → %s = %s", (role, capability, expected) => {
    expect(roleHasCapability(role, capability)).toBe(expected);
    expect(authorize(staff(role), capability).ok).toBe(expected);
  });

  it("gives administrators every capability", () => {
    expect(capabilitiesFor("ADMIN")).toEqual(CAPABILITIES);
  });

  it.each(["RECEPTIONIST", "MANAGER"] as const)(
    "gives %s no CMS capability",
    (role) => {
      const cms = CAPABILITIES.filter((capability) =>
        /^(content|media|promotions|settings|users):/.test(capability),
      );
      expect(
        cms.filter((capability) => roleHasCapability(role, capability)),
      ).toEqual([]);
    },
  );
});

describe("authorize", () => {
  it("rejects a missing session as unauthenticated", () => {
    expect(authorize(null, "admin:access")).toEqual({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
    });
  });

  it("rejects an insufficient role as forbidden", () => {
    expect(authorize(staff("EDITOR"), "users:manage")).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns the principal when allowed", () => {
    expect(authorize(staff("ADMIN"), "users:manage")).toEqual({
      ok: true,
      value: staff("ADMIN"),
    });
  });
});
