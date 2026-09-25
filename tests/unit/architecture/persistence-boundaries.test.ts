import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

const persistenceImport =
  /from\s+["'](?:@prisma\/[^"']+|prisma(?:\/[^"']*)?|pg|[^"']*generated\/prisma[^"']*)["']/;

function filesImportingPersistence(directory: string) {
  return sourceFiles(join(root, directory))
    .filter((file) => persistenceImport.test(readFileSync(file, "utf8")))
    .map((file) => relative(root, file));
}

describe("persistence boundaries", () => {
  it.each(["src/domain", "src/application", "src/presentation", "src/app"])(
    "%s has no Prisma or PostgreSQL imports",
    (directory) => {
      expect(filesImportingPersistence(directory)).toEqual([]);
    },
  );

  it("confines Prisma imports to the database infrastructure", () => {
    const offenders = filesImportingPersistence("src").filter(
      (file) =>
        !file.startsWith("src/infrastructure/db/") &&
        !file.startsWith("src/generated/"),
    );
    expect(offenders).toEqual([]);
  });

  it("marks every database module as server-only", () => {
    const missing = sourceFiles(join(root, "src/infrastructure/db"))
      .filter(
        (file) =>
          !readFileSync(file, "utf8").startsWith('import "server-only";'),
      )
      .map((file) => relative(root, file));
    expect(missing).toEqual([]);
  });
});

describe("booking scope", () => {
  it("keeps booking, pricing, guest, and redemption data out of the schema", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    const declarations = [
      ...schema.matchAll(/^\s*(?:model|enum)\s+(\w+)|^\s{2}(\w+)\s+\S/gm),
    ].map((match) => match[1] ?? match[2] ?? "");
    const forbidden = new Set([
      "availability",
      "booking",
      "discount",
      "guest",
      "payment",
      "price",
      "rate",
      "redemption",
      "reservation",
      "stay",
    ]);
    const words = (name: string) =>
      name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[\s_]+/)
        .map((word) => word.replace(/s$/, ""));

    expect(
      declarations.filter((name) =>
        words(name).some((word) => forbidden.has(word)),
      ),
    ).toEqual([]);
  });
});
