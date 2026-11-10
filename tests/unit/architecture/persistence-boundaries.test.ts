import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
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

// An audit `entityType` label is a name stored in AuditEvent, not table
// access. Only these exact declarations are exempt: a string literal that is
// the whole value of an `entityType` property assignment, or one member of a
// union type declared on an `entityType` property signature.
const AUDIT_ENTITY_LABELS = [
  "PhysicalRoom",
  "InventoryBlock",
  "RoomBaseRate",
  "RatePeriod",
];

function propertyName(node: ts.Node | undefined) {
  return node && (ts.isPropertyAssignment(node) || ts.isPropertySignature(node))
    ? node.name.getText()
    : undefined;
}

export function withoutAuditEntityLabels(source: string) {
  const file = ts.createSourceFile(
    "scanned.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let result = source;
  const blank: [number, number][] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) && AUDIT_ENTITY_LABELS.includes(node.text)) {
      const parent = node.parent;
      const directValue =
        ts.isPropertyAssignment(parent) &&
        parent.initializer === node &&
        propertyName(parent) === "entityType";
      const unionMember =
        ts.isLiteralTypeNode(parent) &&
        ts.isUnionTypeNode(parent.parent) &&
        propertyName(parent.parent.parent) === "entityType";
      if (directValue || unionMember) {
        blank.push([node.getStart(file), node.getEnd()]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const [start, end] of blank.sort((x, y) => y[0] - x[0])) {
    result =
      result.slice(0, start) + " ".repeat(end - start) + result.slice(end);
  }
  return result;
}

// D-9 and D-12: reservation-module tables are reached only from the
// reservation and reporting repositories. Replaces the Phase 2 "booking
// scope" word check now that the reservation design is accepted (ADR 015).
describe("reservation data boundaries", () => {
  const lowerFirst = (name: string) => name[0]!.toLowerCase() + name.slice(1);
  const references = (source: string, model: string) =>
    new RegExp(`\\.${lowerFirst(model)}\\b|"${model}"`).test(
      withoutAuditEntityLabels(source),
    );

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

describe("audit entity label exemption", () => {
  const detects = (source: string, model = "PhysicalRoom") =>
    new RegExp(
      `\\.${model[0]!.toLowerCase()}${model.slice(1)}\\b|"${model}"`,
    ).test(withoutAuditEntityLabels(source));

  it("exempts only the exact audit entityType declarations", () => {
    expect(detects('const e = { entityType: "PhysicalRoom", id: 1 };')).toBe(
      false,
    );
    expect(
      detects('type E = { entityType: "User" | "Branch" | "PhysicalRoom"; };'),
    ).toBe(false);
    expect(
      detects('const e = { entityType: "RoomBaseRate" };', "RoomBaseRate"),
    ).toBe(false);
    expect(
      detects('type E = { entityType: "User" | "RatePeriod"; };', "RatePeriod"),
    ).toBe(false);
  });

  it("still detects Prisma access inside or beside an entityType property", () => {
    for (const source of [
      "const e = { entityType: client.physicalRoom.findMany() };",
      "const e = { entityType: await db.physicalRoom.count() };",
      'const e = { entityType: `SELECT * FROM "PhysicalRoom"` };',
      'const e = { entityType: "PhysicalRoom" + db.physicalRoom };',
      'const e = { kind: "PhysicalRoom" };',
      'const sql = "PhysicalRoom";',
      'db.physicalRoom.findMany(); const e = { entityType: "PhysicalRoom" };',
      'type E = { other: "User" | "PhysicalRoom" };',
    ]) {
      expect(detects(source), source).toBe(true);
    }
  });
});
