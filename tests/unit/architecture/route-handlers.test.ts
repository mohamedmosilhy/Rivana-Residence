import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// D-10: `/api/v1` Route Handlers stay thin: every exported method is built
// from a shared wrapper (so CSRF, size caps, problem mapping, and logging
// always apply), no handler reaches infrastructure, and none exceeds 60 lines.
// A text check can be bypassed; code review is the backstop.

const root = join(__dirname, "../../..");
const apiRoot = join(root, "src/app/api/v1");

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const routes = routeFiles(apiRoot).map((file) => ({
  file: relative(root, file),
  source: readFileSync(file, "utf8"),
}));

describe("D-10: /api/v1 Route Handlers", () => {
  it("has at least the health route", () => {
    expect(routes.map((route) => route.file)).toContain(
      "src/app/api/v1/health/route.ts",
    );
  });

  it.each(routes)("$file builds every method from a wrapper", ({ source }) => {
    const exported = METHODS.filter((method) =>
      new RegExp(
        `export\\s+(const|async function|function)\\s+${method}\\b`,
      ).test(source),
    );
    expect(exported.length).toBeGreaterThan(0);
    for (const method of exported) {
      expect(source).toMatch(
        new RegExp(
          `export const ${method}\\s*=\\s*(publicRoute|staffRoute|webhookRoute)\\(`,
        ),
      );
    }
  });

  it.each(routes)("$file imports no infrastructure or Prisma", ({ source }) => {
    expect(source).not.toMatch(/from\s+["']@\/infrastructure\//);
    expect(source).not.toMatch(/generated\/prisma/);
  });

  it.each(routes)("$file stays within 60 lines", ({ source }) => {
    expect(source.trimEnd().split("\n").length).toBeLessThanOrEqual(60);
  });
});
