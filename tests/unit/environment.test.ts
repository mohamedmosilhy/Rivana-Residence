import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";

const production = {
  NODE_ENV: "production",
  MEDIA_STORAGE_ROOT: "/srv/rivana/media",
  DATABASE_URL: "postgresql://rivana@example.test/rivana",
  BETTER_AUTH_SECRET: "s".repeat(48),
};

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
    expect(() =>
      parseServerEnv({ ...production, BETTER_AUTH_SECRET: undefined }),
    ).toThrowError(/BETTER_AUTH_SECRET is required in production/);
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

  it.each([undefined, "development", "test"])(
    "defaults all provider selections to fake outside production (%s)",
    (NODE_ENV) => {
      expect(parseServerEnv({ NODE_ENV })).toMatchObject({
        PAYMENT_PROVIDER: "fake",
        EMAIL_PROVIDER: "fake",
        WHATSAPP_PROVIDER: "fake",
        WHATSAPP_GRAPH_VERSION: "v23.0",
      });
    },
  );

  it("allows a production deployment without provider credentials", () => {
    expect(parseServerEnv(production)).toMatchObject({
      PAYMENT_PROVIDER: undefined,
      EMAIL_PROVIDER: "smtp",
      WHATSAPP_PROVIDER: "meta",
    });
  });

  // AC-9, T-ADP. Each key must be rejected on its own.
  it.each(["PAYMENT_PROVIDER", "EMAIL_PROVIDER", "WHATSAPP_PROVIDER"])(
    "refuses %s=fake in production",
    (key) => {
      expect(() => parseServerEnv({ ...production, [key]: "fake" })).toThrow(
        `${key}=fake is not allowed in production.`,
      );
    },
  );

  it.each(["PAYMENT_PROVIDER", "EMAIL_PROVIDER"])(
    "refuses an unsupported value for %s",
    (key) => {
      expect(() => parseServerEnv({ [key]: "unknown" })).toThrow(key);
    },
  );

  it.each([undefined, "", " "])(
    "allows no fake payment secret (%j)",
    (value) => {
      expect(
        parseServerEnv({ PAYMENT_FAKE_SECRET: value }).PAYMENT_FAKE_SECRET,
      ).toBeUndefined();
    },
  );

  it("preserves a configured fake payment secret and rejects a short one without exposing it", () => {
    const value = "  a-fake-payment-secret-with-spaces  ";
    expect(
      parseServerEnv({ PAYMENT_FAKE_SECRET: value }).PAYMENT_FAKE_SECRET,
    ).toBe(value);
    expect(() =>
      parseServerEnv({ PAYMENT_FAKE_SECRET: "short-demo-secret" }),
    ).toThrow(/PAYMENT_FAKE_SECRET/);
    expect(() =>
      parseServerEnv({ PAYMENT_FAKE_SECRET: "short-demo-secret" }),
    ).not.toThrow(/short-demo-secret/);
  });

  it("checks the Graph API version format", () => {
    expect(() => parseServerEnv({ WHATSAPP_GRAPH_VERSION: "latest" })).toThrow(
      /Graph API version/,
    );
  });
});
