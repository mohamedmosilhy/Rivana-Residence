import type { StaffPrincipal } from "../../src/application/auth/ports.ts";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seedDatabase } from "../seed-data.ts";
import { ensureSeedAdmin } from "./admin.ts";
import { SEED_ADMIN } from "./admin-credentials.ts";
import { seedBranchDetails } from "./branch.ts";
import { SEEDED_COUNTS, seedContent } from "./content.ts";

/**
 * The one seed, step by step. Each new feature adds its step here, with a
 * test (tests/integration/seed.test.ts). Every step is safe to repeat.
 *
 *   1. structure  settings, the default branch, the three pages
 *   2. admin      the first administrator
 *   3. branch     the branch's contact, address, map, and check-in times
 *   4. content    the old site's rooms, facilities, photos, and page text
 */
export async function runSeed(
  client: PrismaClient,
  options: Readonly<{
    mediaRoot: string;
    adminPassword: string;
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
    return { branchId, contentSeeded: true as const };
  }

  log(
    `Content: skipped; the database already has ${rooms} rooms, ${facilities} facilities, and ${media} images.`,
  );
  if (rooms + facilities === 0) {
    log(
      "Warning: there are images but no rooms or facilities, which looks like an interrupted earlier run. Start again from an empty database (see docs/operations/deployment.md).",
    );
  }
  return { branchId, contentSeeded: false as const };
}
