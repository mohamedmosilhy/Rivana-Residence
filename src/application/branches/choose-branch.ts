import type { BranchRecord, BranchRepository } from "./ports";

export type BranchChoice = Readonly<{
  branches: readonly BranchRecord[];
  selected: BranchRecord | null;
}>;

/**
 * The CMS branch selector (spec 0002): the branch named by `?branch=<slug>`
 * when it exists, otherwise the first branch by display order (any status).
 * The slug is looked up on the server on every request.
 */
export async function chooseBranch(
  branches: BranchRepository,
  slug: unknown,
): Promise<BranchChoice> {
  const all = await branches.listAll();
  const selected =
    (typeof slug === "string" && all.find((branch) => branch.slug === slug)) ||
    all[0] ||
    null;
  return { branches: all, selected };
}
