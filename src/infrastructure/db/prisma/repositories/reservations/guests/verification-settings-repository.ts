import "server-only";

import type {
  VerificationSettingsRecord,
  VerificationSettingsRepository,
} from "@/application/guests";
import { failure, success } from "@/application/shared/result";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const ROW_ID = "default";
const select = { emailEnabled: true, updatedAt: true } as const;

/** The singleton `VerificationSettings` row (created off by the migration). */
export class PrismaVerificationSettingsRepository
  implements VerificationSettingsRepository
{
  constructor(private readonly client: DatabaseClient) {}

  read(): Promise<VerificationSettingsRecord | null> {
    return this.client.verificationSettings.findUnique({
      where: { id: ROW_ID },
      select,
    });
  }

  async update(write: Parameters<VerificationSettingsRepository["update"]>[0]) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      // Restore a missing row (off) so an Admin can still save the switch.
      await this.client.$executeRaw`
        INSERT INTO "VerificationSettings" (id, "emailEnabled", "updatedAt")
        VALUES (${ROW_ID}, false, ${write.now()})
        ON CONFLICT (id) DO NOTHING
      `;
      const locked = await this.client.$queryRaw<VerificationSettingsRecord[]>`
        SELECT "emailEnabled", "updatedAt" FROM "VerificationSettings"
        WHERE id = ${ROW_ID} FOR UPDATE
      `;
      const before = locked[0];
      if (!before) throw new Error("The verification settings row is missing.");
      if (before.emailEnabled === write.emailEnabled)
        return success({ before, after: before, changed: false });
      const after = await this.client.verificationSettings.update({
        where: { id: ROW_ID },
        data: {
          emailEnabled: write.emailEnabled,
          updatedAt: write.now(),
          updatedById: write.updatedById,
        },
        select,
      });
      return success({ before, after, changed: true });
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure(
          "TRY_AGAIN",
          "Verification settings are busy. Please try again shortly.",
        );
      throw error;
    }
  }
}
