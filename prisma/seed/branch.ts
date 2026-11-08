import type {
  Prisma,
  PrismaClient,
} from "../../src/generated/prisma/client.ts";
import { BRANCH, IMAGES } from "../initial-content/content.ts";

/**
 * Gives the default branch its own contact, address, location, map, and
 * check-in and check-out times (audit F08). The public Contact page reads
 * these from `Branch`, not from the retired `SiteSettings` columns.
 *
 * Staff edits are never overwritten. Every dashboard or API save sets
 * `updatedById` and the seed never does, so a branch that has an editor is
 * left completely alone (a field staff cleared stays cleared). On a branch
 * nobody has edited, only fields that are still empty are filled. Returns the
 * fields it filled.
 */
export async function seedBranchDetails(
  client: PrismaClient,
  branchId: string,
): Promise<readonly string[]> {
  return client.$transaction(async (transaction) => {
    const current = await transaction.branch.findUniqueOrThrow({
      where: { id: branchId },
    });
    if (current.updatedById !== null) return [];

    const fill: Prisma.BranchUpdateInput = {};
    for (const [field, value] of Object.entries(BRANCH)) {
      if (current[field as keyof typeof current] === null) {
        Object.assign(fill, { [field]: value });
      }
    }
    const fields = Object.keys(fill);
    if (fields.length > 0) {
      await transaction.branch.update({ where: { id: branchId }, data: fill });
    }
    return fields;
  });
}

/**
 * Gives the default branch its hero image, which the branch chooser shows.
 * It runs after the content step, because it needs the uploaded photos. Any
 * seeded photo will do for now: the exterior, which the demo branch shares.
 * Like `seedBranchDetails`, it leaves a branch alone once staff have edited
 * it, and never replaces a hero that is already set. Returns whether it set
 * the hero.
 */
export async function seedBranchHero(
  client: PrismaClient,
  branchId: string,
): Promise<boolean> {
  return client.$transaction(async (transaction) => {
    const branch = await transaction.branch.findUniqueOrThrow({
      where: { id: branchId },
    });
    if (branch.updatedById !== null || branch.heroMediaId !== null) {
      return false;
    }
    const photo = await transaction.mediaAsset.findFirst({
      where: {
        status: "READY",
        originalFilename: IMAGES.exteriorWide.file,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!photo) return false;
    await transaction.branch.update({
      where: { id: branchId },
      data: { heroMediaId: photo.id },
    });
    return true;
  });
}
