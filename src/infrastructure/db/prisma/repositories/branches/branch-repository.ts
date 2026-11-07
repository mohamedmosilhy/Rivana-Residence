import "server-only";

import type { BranchRepository, BranchSummary } from "@/application/branches";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const summary = {
  id: true,
  slug: true,
  name: true,
  status: true,
  sortOrder: true,
} as const;

const defaultOrder = [{ sortOrder: "asc" }, { id: "asc" }] as const;

export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async findDefaultActive(): Promise<BranchSummary | null> {
    return this.client.branch.findFirst({
      where: { status: "ACTIVE" },
      select: summary,
      orderBy: [...defaultOrder],
    });
  }

  async findDefault(): Promise<BranchSummary | null> {
    return this.client.branch.findFirst({
      select: summary,
      orderBy: [...defaultOrder],
    });
  }

  async findById(id: string): Promise<BranchSummary | null> {
    return this.client.branch.findUnique({ where: { id }, select: summary });
  }

  async findBySlug(slug: string): Promise<BranchSummary | null> {
    return this.client.branch.findUnique({ where: { slug }, select: summary });
  }
}
