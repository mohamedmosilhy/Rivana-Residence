import { describe, expect, it } from "vitest";

import {
  SEED_ADMIN,
  resolveSeedAdminCredentials,
} from "../../../prisma/seed-admin-credentials";

const STRONG = "river-lantern-4471-quiet";

describe("initial admin seed credentials (F07)", () => {
  it("refuses when SEED_ADMIN_PASSWORD is missing, in any environment", () => {
    for (const env of [
      {},
      { NODE_ENV: "development" },
      { NODE_ENV: "production" },
    ]) {
      const result = resolveSeedAdminCredentials(env);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.issues.join(" ")).toMatch(/SEED_ADMIN_PASSWORD/);
    }
  });

  it("refuses an empty password", () => {
    expect(resolveSeedAdminCredentials({ SEED_ADMIN_PASSWORD: "" }).ok).toBe(
      false,
    );
  });

  it("refuses the old default and other weak passwords, outside production too", () => {
    for (const password of [
      "123456",
      "short",
      "aaaaaaaaaaaa",
      "password1234",
      `${SEED_ADMIN.email.split("@")[0]}-secret-99`,
    ]) {
      const result = resolveSeedAdminCredentials({
        SEED_ADMIN_PASSWORD: password,
        NODE_ENV: "development",
      });
      expect(result.ok, password).toBe(false);
      if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("accepts a strong password and returns it unchanged", () => {
    expect(
      resolveSeedAdminCredentials({ SEED_ADMIN_PASSWORD: STRONG }),
    ).toEqual({
      ok: true,
      password: STRONG,
    });
  });

  it("never echoes the supplied password in a refusal", () => {
    const result = resolveSeedAdminCredentials({
      SEED_ADMIN_PASSWORD: "123456",
    });
    expect(JSON.stringify(result)).not.toContain("123456");
  });
});
