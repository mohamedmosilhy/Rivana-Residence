// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Money, Stay } from "@/contracts/api/v1/primitives";
import {
  buildOpenApiDocument,
  serializeOpenApiDocument,
} from "@/contracts/api/v1/openapi";
import { API_ROUTES } from "@/contracts/api/v1/routes";

const committed = join(__dirname, "../../../docs/api/openapi.json");

// T-ARCH-4 and AC-8: the committed document matches the contracts.
describe("OpenAPI document", () => {
  it("is committed and matches the contracts (run `npm run openapi`)", () => {
    expect(readFileSync(committed, "utf8")).toBe(serializeOpenApiDocument());
  });

  it("documents every registered route with a problem response", () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe("3.1.0");
    for (const route of API_ROUTES) {
      const operation = document.paths[route.path]?.[route.method] as {
        responses: Record<string, unknown>;
      };
      expect(operation.responses.default).toMatchObject({
        content: { "application/problem+json": expect.anything() },
      });
    }
  });

  it("exposes no version or environment detail beyond the API version", () => {
    const text = serializeOpenApiDocument();
    expect(text).not.toMatch(/localhost|127\.0\.0\.1|NODE_ENV|DATABASE_URL/);
  });
});

describe("contract primitives", () => {
  it("accepts money in whole cents of USD only", () => {
    expect(
      Money.safeParse({ amountMinor: 7000, currency: "USD" }).success,
    ).toBe(true);
    expect(
      Money.safeParse({ amountMinor: 70.5, currency: "USD" }).success,
    ).toBe(false);
    expect(Money.safeParse({ amountMinor: 1, currency: "EGP" }).success).toBe(
      false,
    );
    expect(
      Money.safeParse({ amountMinor: 1, currency: "USD", extra: 1 }).success,
    ).toBe(false);
  });

  it("requires real dates with check-out after check-in", () => {
    expect(
      Stay.safeParse({ checkIn: "2026-11-14", checkOut: "2026-11-16" }).success,
    ).toBe(true);
    expect(
      Stay.safeParse({ checkIn: "2026-11-14", checkOut: "2026-11-14" }).success,
    ).toBe(false);
    expect(
      Stay.safeParse({ checkIn: "2026-02-30", checkOut: "2026-03-02" }).success,
    ).toBe(false);
  });
});
