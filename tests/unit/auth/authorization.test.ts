import { describe, expect, it } from "vitest";

import { authorize } from "@/application/auth/authorize";
import {
  CAPABILITIES,
  capabilitiesFor,
  roleHasCapability,
  type Capability,
} from "@/domain/auth/capabilities";

// The reviewed role/capability matrix. Changing a row here is a deliberate
// security decision and must be reflected in docs/phase-3-auth.md.
const MATRIX: Record<Capability, { EDITOR: boolean; ADMIN: boolean }> = {
  "admin:access": { EDITOR: true, ADMIN: true },
  "content:edit": { EDITOR: true, ADMIN: true },
  "content:publish": { EDITOR: true, ADMIN: true },
  "content:archive": { EDITOR: true, ADMIN: true },
  "media:upload": { EDITOR: true, ADMIN: true },
  "media:delete": { EDITOR: false, ADMIN: true },
  "promotions:manage": { EDITOR: true, ADMIN: true },
  "enquiries:read": { EDITOR: true, ADMIN: true },
  "enquiries:manage": { EDITOR: true, ADMIN: true },
  "settings:edit": { EDITOR: false, ADMIN: true },
  "users:manage": { EDITOR: false, ADMIN: true },
  "sessions:manage-own": { EDITOR: true, ADMIN: true },
  "sessions:revoke-any": { EDITOR: false, ADMIN: true },
};

const staff = (role: "EDITOR" | "ADMIN") => ({
  id: "user-1",
  name: "Staff",
  email: "staff@example.test",
  role,
  sessionId: "session-1",
});

describe("role capability matrix", () => {
  it("covers every capability", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CAPABILITIES].sort());
  });

  it.each(
    CAPABILITIES.flatMap((capability) =>
      (["EDITOR", "ADMIN"] as const).map(
        (role) => [role, capability, MATRIX[capability][role]] as const,
      ),
    ),
  )("%s → %s = %s", (role, capability, expected) => {
    expect(roleHasCapability(role, capability)).toBe(expected);
    expect(authorize(staff(role), capability).ok).toBe(expected);
  });

  it("gives administrators every capability", () => {
    expect(capabilitiesFor("ADMIN")).toEqual(CAPABILITIES);
  });
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
