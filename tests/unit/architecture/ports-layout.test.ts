import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// M8-T0: a port lives in the application module that consumes it. Only ports
// that many modules share live outside a module, in `src/application/shared/`
// (there is no `src/application/ports/` folder), and module port files never
// depend on each other (no cycles). See docs/architecture/dependency-rules.md.

const root = join(__dirname, "../../..");
const applicationRoot = join(root, "src/application");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

const importPattern =
  /(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g;
const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(importPattern)].map((m) => m[1]!);

const SHARED_PORTS = ["Clock", "IdGenerator"];

describe("M8-T0: application ports layout", () => {
  it("has no shared ports folder; the shared providers are Clock and IdGenerator", () => {
    expect(readdirSync(applicationRoot)).not.toContain("ports");
    const exported = [
      ...readFileSync(
        join(applicationRoot, "shared/providers.ts"),
        "utf8",
      ).matchAll(
        /^export (?:abstract\s+)?(?:interface|type|const|let|class|function|enum) (\w+)/gm,
      ),
    ].map((match) => match[1]);
    expect(exported.sort()).toEqual([...SHARED_PORTS].sort());
  });

  it("does not bring back the retired shared ports folder", () => {
    const offenders = sourceFiles(join(root, "src"))
      .concat(sourceFiles(join(root, "tests")))
      .filter((file) => !file.endsWith("ports-layout.test.ts"))
      .flatMap((file) =>
        importsOf(file)
          .filter((target) => /application\/ports\//.test(target))
          .map((target) => `${relative(root, file)} → ${target}`),
      );
    expect(offenders).toEqual([]);
  });

  it("lets port files depend only on the domain, zod, and the shared files", () => {
    const portFiles = sourceFiles(applicationRoot).filter((file) =>
      file.endsWith("/ports.ts"),
    );
    expect(portFiles.length).toBeGreaterThan(8);
    // Anything else, including a relative import or another module's index,
    // could bring back a cycle between module ports.
    const allowed = [
      /^zod$/,
      /^@\/domain\//,
      /^@\/application\/shared\//,
      /^@\/application\/auth\/authorize-branch$/,
    ];
    const offenders = portFiles.flatMap((file) =>
      importsOf(file)
        .filter((target) => !allowed.some((rule) => rule.test(target)))
        .map((target) => `${relative(root, file)} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });
});
