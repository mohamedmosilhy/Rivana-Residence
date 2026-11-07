import "server-only";

import type { DatabaseProbe } from "@/application/health";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(private readonly client: PrismaClient = getPrisma()) {}

  async ping() {
    await this.client.$queryRaw`SELECT 1`;
  }
}
