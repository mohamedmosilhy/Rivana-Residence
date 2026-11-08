// The one seed: `npm run db:seed` (also run by `prisma db seed`).
//
// It builds a complete, real website on a freshly migrated database. The
// steps and their order are in prisma/seed/index.ts (`runSeed`).
//
// Needs DATABASE_URL, MEDIA_STORAGE_ROOT, and SEED_ADMIN_PASSWORD. There is no
// default admin password: a missing or weak one refuses the run before
// anything is written (src/domain/auth/password-policy.ts).
//
// Re-running never overwrites staff edits: an existing admin keeps its
// password, a branch staff have edited is left alone, and content is added
// only while the database has no rooms, facilities, or images.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { resolveSeedAdminCredentials } from "./seed/admin-credentials.ts";
import { runSeed } from "./seed/index.ts";

const url = process.env.DATABASE_URL;
const mediaRoot = process.env.MEDIA_STORAGE_ROOT;
if (!url) throw new Error("DATABASE_URL is required to seed the database.");
if (!mediaRoot) throw new Error("MEDIA_STORAGE_ROOT is required.");

// Checked before the database client exists, so a refused run writes nothing.
const credentials = resolveSeedAdminCredentials(process.env);
if (!credentials.ok) {
  throw new Error(`Refusing to seed: ${credentials.issues.join(" ")}`);
}

const client = new PrismaClient({
  // Timestamps must round-trip in UTC; see src/infrastructure/db/prisma/client.ts.
  adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }),
});

try {
  await runSeed(client, { mediaRoot, adminPassword: credentials.password });
  console.log(
    "If the site is running, delete .next/cache/fetch-cache and .next/dev/cache/fetch-cache, then reload.",
  );
} finally {
  await client.$disconnect();
}
