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
const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file: string) {
  const source = readFileSync(file, "utf8");
  return [
    ...source.matchAll(importPattern),
    ...source.matchAll(dynamicImportPattern),
  ].map((match) => match[1]!);
}

// Keep both module lists in sync with the same lists in eslint.config.mjs.
const PUBLIC_SURFACE_MODULES = [
  "branches",
  "audit",
  "health",
  "inventory",
  "pricing",
  "quotes",
  "services",
  "coupons",
  "commercial",
  "reservations",
  "guests",
  "reporting",
  "notifications",
];

// M8-T0b: the older CMS modules follow D-8 on the application side only. Their
// domain folders (`src/domain/content`, `media`, …) are not covered yet.
// M9-T0 added `auth` (`src/domain/auth` is scheduled with M14-T11).
const APPLICATION_SURFACE_MODULES = [
  "auth",
  "content",
  "media",
  "settings",
  "enquiries",
  "admin",
  "booking",
  "cache",
  "public",
];

function deepImportsOf(pattern: RegExp) {
  return sourceFiles(join(root, "src"))
    .filter((file) => !file.includes("/src/generated/"))
    .flatMap((file) =>
      importsOf(file)
        .filter((target) => pattern.test(target))
        .map((target) => `${relative(root, file)} → ${target}`),
    );
}

function missingIndexes(layers: string[], modules: string[]) {
  return layers.flatMap((layer) =>
    modules
      .filter((module) => {
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
}

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
      expect(
        deepImportsOf(
          new RegExp(`^@/(domain|application)/${module}/(?!index$)`),
        ),
      ).toEqual([]);
    },
  );

  it("gives every existing module of that list an index.ts", () => {
    expect(
      missingIndexes(["domain", "application"], PUBLIC_SURFACE_MODULES),
    ).toEqual([]);
  });

  it.each(APPLICATION_SURFACE_MODULES)(
    "application/%s is imported only through its index from outside the module",
    (module) => {
      expect(
        deepImportsOf(new RegExp(`^@/application/${module}/(?!index$)`)),
      ).toEqual([]);
    },
  );

  it("gives every application CMS module an index.ts", () => {
    expect(
      missingIndexes(["application"], APPLICATION_SURFACE_MODULES),
    ).toEqual([]);
  });
});

describe("M9-T0: auth and shared stay leaf modules", () => {
  // Several module port files import the `BranchScope` type from the auth
  // index. That cannot form a cycle between modules only while auth and the
  // shared application files import no other application module. Each guard
  // checks one hop, and together they cover the whole chain.
  const leafImports = [
    /^\.\/(?!\.\.)/,
    /^zod$/,
    /^@\/domain\//,
    /^@\/application\/shared\//,
  ];
  it.each(["auth", "shared"])(
    "src/application/%s imports only its own files, shared application files, the domain, and zod",
    (folder) => {
      const files = sourceFiles(join(root, "src/application", folder));
      expect(files.length).toBeGreaterThan(5);
      const offenders = files.flatMap((file) =>
        importsOf(file)
          .filter((target) => !leafImports.some((rule) => rule.test(target)))
          .map((target) => `${relative(root, file)} → ${target}`),
      );
      expect(offenders).toEqual([]);
    },
  );
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
