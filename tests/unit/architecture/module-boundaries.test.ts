import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// Architecture rules D-7, D-8, and D-11 (docs/architecture/dependency-rules.md),
// checked from source text so they hold even if a lint rule is disabled.

const root = join(__dirname, "../../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

const importPattern =
  /(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g;

function importsOf(file: string) {
  return [...readFileSync(file, "utf8").matchAll(importPattern)].map(
    (match) => match[1]!,
  );
}

const PUBLIC_SURFACE_MODULES = [
  "branches",
  "audit",
  "health",
  "inventory",
  "pricing",
  "reservations",
  "guests",
  "reporting",
  "notifications",
];

describe("D-7: HTTP contracts", () => {
  it("import only zod and sibling contract files", () => {
    const offenders = sourceFiles(join(root, "src/contracts")).flatMap((file) =>
      importsOf(file)
        .filter((target) => target !== "zod" && !target.startsWith("./"))
        .map((target) => `${relative(root, file)} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("D-8: module public surfaces", () => {
  it.each(PUBLIC_SURFACE_MODULES)(
    "%s is imported only through its index from outside the module",
    (module) => {
      const deep = new RegExp(`^@/(domain|application)/${module}/(?!index$)`);
      const offenders = sourceFiles(join(root, "src"))
        .filter((file) => !file.includes("/src/generated/"))
        .flatMap((file) =>
          importsOf(file)
            .filter((target) => deep.test(target))
            .map((target) => `${relative(root, file)} → ${target}`),
        );
      expect(offenders).toEqual([]);
    },
  );

  it("gives every existing module of that list an index.ts", () => {
    const missing = ["domain", "application"].flatMap((layer) =>
      PUBLIC_SURFACE_MODULES.filter((module) => {
        try {
          return statSync(join(root, "src", layer, module)).isDirectory();
        } catch {
          return false;
        }
      })
        .filter((module) => {
          try {
            statSync(join(root, "src", layer, module, "index.ts"));
            return false;
          } catch {
            return true;
          }
        })
        .map((module) => `src/${layer}/${module}`),
    );
    expect(missing).toEqual([]);
  });
});

describe("D-11: Server Actions and reservations", () => {
  // Reservation mutations go through the REST API (ADR 014). Add an entry
  // here only with an ADR recording the exception.
  const ALLOWED: readonly string[] = [];
  const reservationModules =
    /^@\/application\/(reservations|inventory|pricing|guests)(\/|$)/;

  it("no Server Action imports a reservation use case", () => {
    const offenders = sourceFiles(join(root, "src/app"))
      .filter((file) =>
        /^\s*["']use server["']/m.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(root, file))
      .filter((file) => !ALLOWED.includes(file))
      .flatMap((file) =>
        importsOf(join(root, file))
          .filter((target) => reservationModules.test(target))
          .map((target) => `${file} → ${target}`),
      );
    expect(offenders).toEqual([]);
  });
});
