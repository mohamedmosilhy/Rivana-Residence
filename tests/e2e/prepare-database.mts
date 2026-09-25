// Prepares the disposable E2E database. Run through tsx (ESM) because the
// generated Prisma client cannot load in Playwright's CommonJS transform.
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";

import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seedDatabase } from "../../prisma/seed-data.ts";
import { createStaff, setStaffActive } from "../../scripts/staff-admin.ts";
import { E2E_PASSWORD, E2E_PROJECTS, accountsFor } from "./support/accounts.ts";

const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error("E2E_DATABASE_URL is required.");

// Uploaded objects belong to the database being recreated, so start empty.
// Keep in sync with MEDIA_STORAGE_ROOT in playwright.config.ts.
await rm("/tmp/rivana-e2e-media", { recursive: true, force: true });

{
  const target = new URL(url);
  const database = target.pathname.slice(1);
  if (!database.endsWith("_test")) {
    throw new Error(
      `Refusing to reset "${database}": name must end in "_test".`,
    );
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
    stdio: "pipe",
  });

  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      options: "-c TimeZone=UTC",
    }),
  });
  try {
    await seedDatabase(client);
    for (const project of E2E_PROJECTS) {
      const accounts = accountsFor(project);
      await createStaff(client, {
        email: accounts.admin,
        name: "Amira Admin",
        role: "ADMIN",
        password: E2E_PASSWORD,
      });
      for (const key of ["editor", "inactive", "lockout", "account"] as const) {
        await createStaff(client, {
          email: accounts[key],
          name: "Omar Editor",
          role: "EDITOR",
          password: E2E_PASSWORD,
        });
      }
      await setStaffActive(client, accounts.inactive, false);
    }
  } finally {
    await client.$disconnect();
  }
}
