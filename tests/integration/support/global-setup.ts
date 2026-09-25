import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { testDatabaseUrl } from "./test-database";

// Recreates the disposable database and applies every migration, so each run
// also proves the migration history works from an empty database.
export default async function setup() {
  const { url, database } = testDatabaseUrl();
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
}
