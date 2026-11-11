import type { StaffPrincipal } from "../../src/application/auth/ports.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seedDatabase } from "../seed-data.ts";
import { ensureSeedAdmin } from "./admin.ts";
import { SEED_ADMIN } from "./admin-credentials.ts";
import { seedBranchDetails, seedBranchHero } from "./branch.ts";
import { SEEDED_COUNTS, seedContent } from "./content.ts";
import { seedDemo, seedDemoInventory, seedDemoCommercial } from "./demo.ts";

/**
 * The one seed, step by step. Each new feature adds its step here, with a
 * test (tests/integration/seed.test.ts). Every step is safe to repeat.
 *
 *   1. structure  settings, the default branch, the three pages
 *   2. admin      the first administrator
 *   3. branch     the branch's contact, address, map, and check-in times
 *               (its hero image is set after the content step)
 *   4. content    the old site's rooms, facilities, photos, and page text
 *   5. demo       only with --demo, never in production: fictional data
 */
export async function runSeed(
  client: PrismaClient,
  options: Readonly<{
    mediaRoot: string;
    adminPassword: string;
    demo?: boolean;
    log?: (message: string) => void;
  }>,
) {
  const log = options.log ?? console.log;

  const branchId = await seedDatabase(client);
  log("Structure: settings, default branch, and pages are in place.");

  const { user, created } = await ensureSeedAdmin(
    client,
    options.adminPassword,
  );
  log(
    created
      ? `Admin: created ${SEED_ADMIN.email}.`
      : `Admin: ${SEED_ADMIN.email} already exists; password unchanged.`,
  );

  const filled = await seedBranchDetails(client, branchId);
  log(
    filled.length > 0
      ? `Branch: filled ${filled.join(", ")}.`
      : "Branch: left as is (already set, or edited by staff).",
  );

  const [rooms, facilities, media] = await Promise.all([
    client.room.count(),
    client.facility.count(),
    client.mediaAsset.count(),
  ]);
  let contentSeeded = false;
  if (rooms + facilities + media === 0) {
    const staff: StaffPrincipal = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "ADMIN",
      sessionId: "seed",
      branchIds: [],
    };
    await seedContent(client, {
      mediaRoot: options.mediaRoot,
      staff,
      branchId,
    });
    log(
      `Content: seeded ${SEEDED_COUNTS.rooms} rooms, ${SEEDED_COUNTS.facilities} facilities (the Café stays a draft until it has a photo), ${SEEDED_COUNTS.images} images, and the Home, About, and Contact pages.`,
    );
    contentSeeded = true;
  } else {
    log(
      `Content: skipped; the database already has ${rooms} rooms, ${facilities} facilities, and ${media} images.`,
    );
    if (rooms + facilities === 0) {
      log(
        "Warning: there are images but no rooms or facilities, which looks like an interrupted earlier run. Start again from an empty database (see docs/operations/deployment.md).",
      );
    }
  }

  if (await seedBranchHero(client, branchId)) {
    log("Branch: set the hero image shown in the branch chooser.");
  }

  log(
    "Inventory: units and rates need approved hotel data; no real inventory or prices were seeded.",
  );

  if (options.demo) {
    const demo = await seedDemo(client, { staffId: user.id });
    log(
      demo.created
        ? "Demo: created the fictional branch demo-giza (active), so the site now has two branches."
        : `Demo: demo-giza already exists (${demo.status.toLowerCase()}); existing branch content preserved.${
            demo.status === "INACTIVE"
              ? " To show it, set its status to Active in Admin > Branches."
              : ""
          }`,
    );
    const commercial = await seedDemoCommercial(client);
    log(
      `Demo commercial rules: created ${commercial.created} fictional service/coupon records; existing records and VAT preserved.`,
    );
    const inventory = await seedDemoInventory(client);
    log(
      `Demo inventory: created ${inventory.created} fictional unit/rate records; existing records preserved.`,
    );
  }
  return { branchId, contentSeeded };
}
