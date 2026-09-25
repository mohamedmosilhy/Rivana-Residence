import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";

describe("server environment", () => {
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
});
