// Publishes the full demo website (rooms, facilities, pages, settings, and
// imported reference photography) into the database in DATABASE_URL, using
// the same fixture as the browser tests. For local review only.
//
//   npm run db:seed:demo                      (demo-giza stays inactive)
//   npm run db:seed:demo -- --activate-giza   (two branches: the chooser shows)
//
// On an empty database it seeds everything. On a database that already has
// the demo site it only adds the fictional second branch `demo-giza`
// (reusing the images already in the library), or, if that branch exists,
// only switches it on with --activate-giza. It never duplicates or
// overwrites content entered through the CMS.
import "dotenv/config";

import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { seedDatabase } from "../prisma/seed-data.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  DEMO_IMAGES,
  seedPublicContent,
  seedSecondBranch,
} from "../tests/e2e/fixtures/public-content.mts";

const url = process.env.DATABASE_URL;
const mediaRoot = process.env.MEDIA_STORAGE_ROOT;
if (!url) throw new Error("DATABASE_URL is required.");
if (!mediaRoot) throw new Error("MEDIA_STORAGE_ROOT is required.");
if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is for local review only.");
}

const activate = process.argv.includes("--activate-giza");
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }),
});

const CACHE_HINT =
  "Delete .next/cache/fetch-cache (and .next/dev/cache) and reload the site.";

try {
  const author = await client.user.findFirst({
    where: { role: "ADMIN", active: true },
  });
  if (!author) {
    throw new Error("Create an admin account first with npm run staff.");
  }
  const actor = { id: author.id, role: "ADMIN" as const };

  const giza = await client.branch.findUnique({ where: { slug: "demo-giza" } });
  const [rooms, facilities, media] = await Promise.all([
    client.room.count(),
    client.facility.count(),
    client.mediaAsset.count(),
  ]);

  if (giza) {
    // Everything is already here: at most switch the demo branch on.
    if (activate && giza.status !== "ACTIVE") {
      await client.branch.update({
        where: { id: giza.id },
        data: { status: "ACTIVE", updatedById: actor.id },
      });
      console.log(`demo-giza is now active. ${CACHE_HINT}`);
    } else {
      console.log(
        `demo-giza already exists (${giza.status.toLowerCase()}). Nothing to do.${
          activate ? "" : " Add --activate-giza to switch it on."
        }`,
      );
    }
  } else if (rooms + facilities + media === 0) {
    // An empty database: the whole demo site, then the second branch.
    // Adds any missing structural records (settings, pages, default
    // sections) without overwriting existing edits.
    await seedDatabase(client);
    const images = await seedPublicContent(client, mediaRoot, actor);
    await seedSecondBranch(client, actor, images, { active: activate });
    console.log(`Demo website published. ${CACHE_HINT}`);
  } else {
    // The demo site is already here: add only the second branch, reusing
    // the demo images already in the library. Existing content is untouched.
    const assets = await client.mediaAsset.findMany({
      where: { status: "READY", originalFilename: { in: [...DEMO_IMAGES] } },
      select: { id: true, originalFilename: true },
      orderBy: { createdAt: "asc" },
    });
    const images: Record<string, string> = {};
    for (const asset of assets) {
      images[path.basename(asset.originalFilename)] ??= asset.id;
    }
    const missing = DEMO_IMAGES.filter((file) => !images[file]);
    if (missing.length > 0) {
      throw new Error(
        `Refusing to seed: the database already has ${rooms} rooms, ${facilities} facilities, and ${media} images, but not the demo images ${missing.join(", ")}. Seed demo-giza on an empty database instead.`,
      );
    }
    await seedSecondBranch(client, actor, images, { active: activate });
    console.log(
      `Added the demo branch demo-giza (${activate ? "active" : "inactive"}) next to your existing content. ${CACHE_HINT}`,
    );
  }
} finally {
  await client.$disconnect();
}
