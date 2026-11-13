import "server-only";

import type {
  CommercialSettingsRecord,
  CommercialSettingsRepository,
  CommercialSettingsWrite,
  CommercialSettingsWriteOutcome,
} from "@/application/commercial";
import { failure, success, type Result } from "@/application/shared/result";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const ROW_ID = "default";
const BUSY = "Settings are busy. Please try the request again shortly.";

const select = { vatRateBasisPoints: true, updatedAt: true } as const;

export class PrismaCommercialSettingsRepository
  implements CommercialSettingsRepository
{
  constructor(private readonly client: DatabaseClient) {}

  async read(): Promise<CommercialSettingsRecord> {
    return this.client.commercialSettings.findUniqueOrThrow({
      where: { id: ROW_ID },
      select,
    });
  }

  async update(
    write: CommercialSettingsWrite,
  ): Promise<Result<CommercialSettingsWriteOutcome>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<
        Readonly<{ vatRateBasisPoints: number; updatedAt: Date }>[]
      >(Prisma.sql`
        SELECT "vatRateBasisPoints", "updatedAt"
        FROM "CommercialSettings"
        WHERE id = ${ROW_ID}
        FOR UPDATE
      `);
      const before = locked[0];
      if (!before) {
        throw new Error("The commercial settings row is missing.");
      }
      if (before.vatRateBasisPoints === write.vatRateBasisPoints) {
        return success({ before, after: before, changed: false });
      }
      const after = await this.client.commercialSettings.update({
        where: { id: ROW_ID },
        data: {
          vatRateBasisPoints: write.vatRateBasisPoints,
          updatedAt: write.now(),
          updatedById: write.updatedById,
        },
        select,
      });
      return success({ before, after, changed: true });
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure("TRY_AGAIN", BUSY);
      }
      throw error;
    }
  }
}
