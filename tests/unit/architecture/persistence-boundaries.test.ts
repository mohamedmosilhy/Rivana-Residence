import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RESERVATION_MODELS,
  RESERVATION_SQL_FOLDERS,
} from "../../support/reservation-models";

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

// D-9 and D-12: reservation-module tables are reached only from the
// reservation and reporting repositories. Replaces the Phase 2 "booking
// scope" word check now that the reservation design is accepted (ADR 015).
describe("reservation data boundaries", () => {
  const lowerFirst = (name: string) => name[0]!.toLowerCase() + name.slice(1);
  const references = (source: string, model: string) =>
    new RegExp(`\\.${lowerFirst(model)}\\b|"${model}"`).test(source);

  it("keeps reservation tables out of every other folder", () => {
    const offenders = sourceFiles(join(root, "src"))
      .map((file) => relative(root, file))
      .filter(
        (file) =>
          !file.startsWith("src/generated/") &&
          !RESERVATION_SQL_FOLDERS.some((folder) => file.startsWith(folder)),
      )
      .flatMap((file) => {
        const source = readFileSync(join(root, file), "utf8");
        return RESERVATION_MODELS.filter((model) =>
          references(source, model),
        ).map((model) => `${file}: ${model}`);
      });
    expect(offenders).toEqual([]);
  });

  it("declares every reservation model it guards in the data model", () => {
    const dataModel = readFileSync(
      join(root, "docs/database/data-model.md"),
      "utf8",
    );
    expect(
      RESERVATION_MODELS.filter((model) => !dataModel.includes(model)),
    ).toEqual([]);
  });
});
