// Publishes the full demo website (rooms, facilities, pages, settings, and
// imported reference photography) into the database in DATABASE_URL, using
// the same fixture as the browser tests. For local review only.
//
//   npm run db:seed:demo
//
// It refuses to run when rooms, facilities, or media already exist, so it
// never duplicates or overwrites content entered through the CMS.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { seedDatabase } from "../prisma/seed-data.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { seedPublicContent } from "../tests/e2e/fixtures/public-content.mts";

const url = process.env.DATABASE_URL;
const mediaRoot = process.env.MEDIA_STORAGE_ROOT;
if (!url) throw new Error("DATABASE_URL is required.");
if (!mediaRoot) throw new Error("MEDIA_STORAGE_ROOT is required.");
if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is for local review only.");
}

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }),
});

try {
  const [rooms, facilities, media] = await Promise.all([
    client.room.count(),
    client.facility.count(),
    client.mediaAsset.count(),
  ]);
  if (rooms + facilities + media > 0) {
    throw new Error(
      `Refusing to seed: the database already has ${rooms} rooms, ${facilities} facilities, and ${media} images.`,
    );
  }
  const author = await client.user.findFirst({ where: { role: "ADMIN" } });
  if (!author) {
    throw new Error("Create an admin account first with npm run staff.");
  }
  // Adds any missing structural records (settings, pages, default
  // sections) without overwriting existing edits.
  await seedDatabase(client);
  await seedPublicContent(client, mediaRoot, {
    id: author.id,
    role: "ADMIN",
  });
  console.log(
    "Demo website published. Delete .next/cache/fetch-cache (and .next/dev/cache) and reload the site.",
  );
} finally {
  await client.$disconnect();
}
