import type {
  Prisma,
  PrismaClient,
} from "../../src/generated/prisma/client.ts";
import { BRANCH } from "../initial-content/content.ts";

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
