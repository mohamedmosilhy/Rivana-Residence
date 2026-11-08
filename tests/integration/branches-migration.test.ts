import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_BRANCH_ID } from "../../prisma/seed-data";
import { testDatabaseUrl } from "./support/test-database";

// T-DB-1 and AC-6: the M4 migrations move live M3 data to the first branch
// without losing a row, then leave no drift against the Prisma schema.

const migrationsDir = join(__dirname, "../../prisma/migrations");
const M4_START = "20261106";
const M5_START = "20261107";
const M6_START = "20261108";
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const m3 = migrations.filter((name) => name < M4_START);
const m4 = migrations.filter((name) => name >= M4_START && name < M5_START);
const m5 = migrations.filter((name) => name >= M5_START && name < M6_START);
const m6 = migrations.filter((name) => name >= M6_START);

const base = testDatabaseUrl();
const scratchName = base.database.replace(/_test$/, "_m4_backfill_test");
const scratchUrl = (() => {
  const url = new URL(base.url);
  url.pathname = `/${scratchName}`;
  return url.toString();
})();

async function withAdmin(run: (admin: Client) => Promise<void>) {
  const url = new URL(base.url);
  url.pathname = "/postgres";
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    await run(admin);
  } finally {
    await admin.end();
  }
}

const db = new Client({
  connectionString: scratchUrl,
  options: "-c TimeZone=UTC",
});

async function apply(names: readonly string[]) {
  for (const name of names) {
    await db.query(
      readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"),
    );
  }
}

async function counts() {
  const { rows } = await db.query<Record<string, string>>(`
    SELECT
      (SELECT count(*) FROM "Room") AS rooms,
      (SELECT count(*) FROM "Facility") AS facilities,
      (SELECT count(*) FROM "Page") AS pages,
      (SELECT count(*) FROM "PageSection") AS sections,
      (SELECT count(*) FROM "ContactEnquiry") AS enquiries
  `);
  return rows[0];
}

// Seeded like a live M3 site: contact details and a map in settings, the
// three pages with sections, published and archived listings, an enquiry.
const SEED = `
  INSERT INTO "SiteSettings" ("id","siteName","tagline","timeZone","phone","email","addressLine1","city","country","latitude","longitude","mapEmbedUrl","updatedAt")
  VALUES ('default','Rivana Residence','A calm stay in New Cairo.','Africa/Cairo','+20 2 1234 5678','stay@example.test','Fifth Settlement','New Cairo','Egypt',30.0131,31.4913,'https://www.google.com/maps/embed?pb=test',now());
  INSERT INTO "Page" ("id","key","title","canonicalPath","isPublished","updatedAt") VALUES
    ('p-home','HOME','Home','/',true,now()),
    ('p-about','ABOUT','About','/about',true,now()),
    ('p-contact','CONTACT','Contact','/contact',false,now());
  INSERT INTO "PageSection" ("id","pageId","type","payload","sortOrder","updatedAt") VALUES
    ('s1','p-home','HERO','{"schemaVersion":1}',0,now()),
    ('s2','p-home','RICH_TEXT','{"schemaVersion":1}',1,now()),
    ('s3','p-about','HERO','{"schemaVersion":1}',0,now());
  INSERT INTO "Room" ("id","name","slug","shortDescription","description","maxAdults","sortOrder","status","updatedAt") VALUES
    ('r1','Studio','studio','Calm.','{"type":"doc","content":[]}',2,0,'PUBLISHED',now()),
    ('r2','Suite','suite','Wide.','{"type":"doc","content":[]}',3,1,'DRAFT',now()),
    ('r3','Old','old','Gone.','{"type":"doc","content":[]}',2,1,'ARCHIVED',now());
  INSERT INTO "Facility" ("id","name","slug","shortDescription","description","sortOrder","status","updatedAt") VALUES
    ('f1','Pool','pool','Outdoor.','{"type":"doc","content":[]}',0,'PUBLISHED',now()),
    ('f2','Gym','gym','Indoor.','{"type":"doc","content":[]}',1,'DRAFT',now());
  INSERT INTO "ContactEnquiry" ("id","name","email","message") VALUES
    ('e1','Guest','guest@example.test','Is parking available?');
`;

beforeAll(async () => {
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${scratchName}"`);
  });
  await db.connect();
  await apply(m3);
  await db.query(SEED);
});

afterAll(async () => {
  await db.end();
  await withAdmin((admin) =>
    admin.query(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`).then(),
  );
});

describe("branches_and_staff_roles migration on M3 data", () => {
  it("adds two M4 migrations after the three M3 ones", () => {
    expect(m3).toHaveLength(3);
    expect(m4).toEqual([
      "20261106120000_staff_roles_enum",
      "20261106120100_branches_and_staff_roles",
    ]);
  });

  it("keeps every row and gives rooms, facilities, and pages the first branch", async () => {
    const before = await counts();
    await apply(m4);

    expect(await counts()).toEqual(before);
    expect(before).toEqual({
      rooms: "3",
      facilities: "2",
      pages: "3",
      sections: "3",
      enquiries: "1",
    });

    const { rows: branches } = await db.query(`SELECT * FROM "Branch"`);
    expect(branches).toEqual([
      expect.objectContaining({
        id: DEFAULT_BRANCH_ID,
        slug: "new-cairo",
        name: "Rivana Residence",
        summary: "A calm stay in New Cairo.",
        status: "ACTIVE",
        onlineBookingEnabled: false,
        timeZone: "Africa/Cairo",
        currency: "USD",
        phone: "+20 2 1234 5678",
        email: "stay@example.test",
        addressLine1: "Fifth Settlement",
        city: "New Cairo",
        country: "Egypt",
        latitude: "30.013100",
        longitude: "31.491300",
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=test",
        sortOrder: 0,
      }),
    ]);

    for (const table of ["Room", "Facility", "Page"]) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS other FROM "${table}" WHERE "branchId" IS DISTINCT FROM $1`,
        [DEFAULT_BRANCH_ID],
      );
      expect(rows[0].other).toBe(0);
    }
    const { rows: enquiries } = await db.query(
      `SELECT "branchId" FROM "ContactEnquiry"`,
    );
    expect(enquiries).toEqual([{ branchId: null }]);
    const { rows: rooms } = await db.query(
      `SELECT "accommodationType", "bedroomCount" FROM "Room" ORDER BY id`,
    );
    expect(rooms.every((row) => row.accommodationType === "ROOM")).toBe(true);
  });

  it("adds the new staff roles", async () => {
    const { rows } = await db.query(
      `SELECT unnest(enum_range(NULL::"AdminRole"))::text AS role`,
    );
    expect(rows.map((row) => row.role)).toEqual([
      "EDITOR",
      "ADMIN",
      "RECEPTIONIST",
      "MANAGER",
    ]);
  });

  // AC-16 (M5): the reserved-slug migration applies cleanly on migrated data
  // and refuses the old top-level paths.
  it("applies the M5 reserved-slug migration on top", async () => {
    expect(m5).toEqual(["20261107120000_reserve_legacy_branch_slugs"]);
    await apply(m5);
    for (const slug of ["about", "contact", "rooms", "facilities"]) {
      await expect(
        db.query(
          `INSERT INTO "Branch" ("id","slug","name","sortOrder","updatedAt") VALUES ($1,$2,'X',9,now())`,
          [`reserved-${slug}`, slug],
        ),
      ).rejects.toThrow(/Branch_slug_check/);
    }
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "Branch"`);
    expect(rows[0].n).toBe(1);
  });

  it("applies the additive M6 migration to a copy of M5 data without changing existing rows", async () => {
    expect(m6).toEqual(["20261108120000_inventory_and_rates"]);
    const { rows: tables } = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const { tablename } of tables) {
        const quoted = '"' + tablename.replaceAll('"', '""') + '"';
        result[tablename] = (
          await db.query(
            `SELECT to_jsonb(t) AS row FROM ${quoted} t ORDER BY to_jsonb(t)::text`,
          )
        ).rows;
      }
      return result;
    };
    const before = await snapshot();
    await apply(m6);
    expect(await snapshot()).toEqual(before);
    for (const table of [
      "PhysicalRoom",
      "InventoryBlock",
      "RoomBaseRate",
      "RatePeriod",
    ]) {
      expect(
        (await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows,
      ).toEqual([{ n: 0 }]);
    }
    expect(
      (
        await db.query(
          "SELECT extname FROM pg_extension WHERE extname='btree_gist'",
        )
      ).rows,
    ).toEqual([{ extname: "btree_gist" }]);
  });

  it("leaves no drift between the migrated database and the Prisma schema", () => {
    const output = execFileSync(
      "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
      ],
      {
        cwd: join(__dirname, "../.."),
        env: {
          ...process.env,
          DATABASE_URL: scratchUrl,
          DIRECT_DATABASE_URL: scratchUrl,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    expect(output).toContain("No difference detected.");
  }, 60_000);
});
