import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";

describe("server environment", () => {
  it.each([undefined, "", "  "])(
    "treats an empty optional phone secret as unconfigured: %j",
    (value) => {
      const environment = parseServerEnv({ PHONE_VERIFICATION_SECRET: value });
      expect(environment.PHONE_VERIFICATION_SECRET).toBeUndefined();
      expect(environment.APP_URL).toBe("http://localhost:3000");
    },
  );
  it("preserves a configured phone secret exactly and refuses a short nonempty value", () => {
    const value = "  phone-secret-0123456789abcdefghijklmnop  ";
    expect(
      parseServerEnv({ PHONE_VERIFICATION_SECRET: value })
        .PHONE_VERIFICATION_SECRET,
    ).toBe(value);
    expect(() =>
      parseServerEnv({ PHONE_VERIFICATION_SECRET: "short" }),
    ).toThrow("PHONE_VERIFICATION_SECRET");
  });
  it("reports a missing production media root clearly", () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: "production",
        APP_URL: "https://rivanaresidence.com",
      }),
    ).toThrowError(/MEDIA_STORAGE_ROOT is required in production/);
  });

  it("accepts an explicit production media root", () => {
    expect(
      parseServerEnv({
        NODE_ENV: "production",
        APP_URL: "https://rivanaresidence.com",
        MEDIA_STORAGE_ROOT: "/srv/rivana/media",
        DATABASE_URL: "postgresql://rivana@example.test/rivana",
        BETTER_AUTH_SECRET: "s".repeat(48),
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      MEDIA_STORAGE_ROOT: "/srv/rivana/media",
      DATABASE_URL: "postgresql://rivana@example.test/rivana",
    });
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "mysql://rivana@example.test/rivana",
      }),
    ).toThrowError(/Must be a PostgreSQL connection URL/);
  });

  it("requires a strong auth secret in production", () => {
    const production = {
      NODE_ENV: "production",
      MEDIA_STORAGE_ROOT: "/srv/rivana/media",
      DATABASE_URL: "postgresql://rivana@example.test/rivana",
    };
    expect(() => parseServerEnv(production)).toThrowError(
      /BETTER_AUTH_SECRET is required in production/,
    );
    expect(() =>
      parseServerEnv({ ...production, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrowError(/at least 32 characters/);
  });

  it("trusts proxy headers only when explicitly enabled", () => {
    expect(parseServerEnv({}).AUTH_TRUST_PROXY_HEADERS).toBe(false);
    expect(
      parseServerEnv({ AUTH_TRUST_PROXY_HEADERS: "true" })
        .AUTH_TRUST_PROXY_HEADERS,
    ).toBe(true);
    expect(() => parseServerEnv({ AUTH_TRUST_PROXY_HEADERS: "yes" })).toThrow();
  });

  // M8-T4 (spec 0005 Decision 6): the fake WhatsApp adapter never runs in
  // production; development and tests default to it.
  it("defaults WhatsApp to the fake outside production and Meta in it", () => {
    expect(parseServerEnv({}).WHATSAPP_PROVIDER).toBe("fake");
    expect(parseServerEnv({}).WHATSAPP_GRAPH_VERSION).toBe("v23.0");
    expect(
      parseServerEnv({
        NODE_ENV: "production",
        MEDIA_STORAGE_ROOT: "/srv/rivana/media",
        DATABASE_URL: "postgresql://rivana@example.test/rivana",
        BETTER_AUTH_SECRET: "s".repeat(48),
      }).WHATSAPP_PROVIDER,
    ).toBe("meta");
  });

  it("refuses the fake WhatsApp provider in production", () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: "production",
        MEDIA_STORAGE_ROOT: "/srv/rivana/media",
        DATABASE_URL: "postgresql://rivana@example.test/rivana",
        BETTER_AUTH_SECRET: "s".repeat(48),
        WHATSAPP_PROVIDER: "fake",
      }),
    ).toThrowError(/WHATSAPP_PROVIDER=fake is not allowed in production/);
  });

  it("checks the Graph API version format", () => {
    expect(() => parseServerEnv({ WHATSAPP_GRAPH_VERSION: "latest" })).toThrow(
      /Graph API version/,
    );
  });
});
