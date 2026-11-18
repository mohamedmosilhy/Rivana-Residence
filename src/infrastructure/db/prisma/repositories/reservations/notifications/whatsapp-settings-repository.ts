import "server-only";

import type {
  WhatsAppSettingsRecord,
  WhatsAppSettingsRepository,
  WhatsAppSettingsWrite,
  WhatsAppSettingsWriteOutcome,
  WhatsAppTestOutcome,
} from "@/application/notifications";
import { failure, success, type Result } from "@/application/shared/result";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const ROW_ID = "default";
const BUSY = "WhatsApp settings are busy. Please try again shortly.";
const ERROR_MAX = 200;

const select = {
  businessPhoneNumber: true,
  providerPhoneNumberId: true,
  lastTestAt: true,
  lastTestOk: true,
  lastTestError: true,
  updatedAt: true,
} as const;

/** The singleton `WhatsAppSettings` row (M8-T1 creates it, number empty). */
export class PrismaWhatsAppSettingsRepository
  implements WhatsAppSettingsRepository
{
  constructor(private readonly client: DatabaseClient) {}

  async read(): Promise<WhatsAppSettingsRecord> {
    return this.client.whatsAppSettings.findUniqueOrThrow({
      where: { id: ROW_ID },
      select,
    });
  }

  async update(
    write: WhatsAppSettingsWrite,
  ): Promise<Result<WhatsAppSettingsWriteOutcome>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<WhatsAppSettingsRecord[]>(
        Prisma.sql`
          SELECT "businessPhoneNumber", "providerPhoneNumberId", "lastTestAt",
                 "lastTestOk", "lastTestError", "updatedAt"
          FROM "WhatsAppSettings"
          WHERE id = ${ROW_ID}
          FOR UPDATE
        `,
      );
      const before = locked[0];
      if (!before) throw new Error("The WhatsApp settings row is missing.");
      const { businessPhoneNumber, providerPhoneNumberId } = write.input;
      if (
        before.businessPhoneNumber === businessPhoneNumber &&
        before.providerPhoneNumberId === providerPhoneNumberId
      ) {
        return success({ before, after: before, changed: false });
      }
      const after = await this.client.whatsAppSettings.update({
        where: { id: ROW_ID },
        data: {
          businessPhoneNumber,
          providerPhoneNumberId,
          updatedAt: write.now(),
          updatedById: write.updatedById,
        },
        select,
      });
      return success({ before, after, changed: true });
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure("TRY_AGAIN", BUSY);
      throw error;
    }
  }

  async recordTest(outcome: WhatsAppTestOutcome): Promise<boolean> {
    // Not an Admin edit of the setup: `updatedAt` and `updatedById` stay.
    // SKIP LOCKED never waits, so a concurrent settings save cannot make the
    // caller's transaction (and its audit event) fail.
    const updated = await this.client.$executeRaw`
      UPDATE "WhatsAppSettings"
      SET "lastTestAt" = ${outcome.at},
          "lastTestOk" = ${outcome.ok},
          "lastTestError" = ${outcome.error?.slice(0, ERROR_MAX) ?? null}
      WHERE id = (
        SELECT id FROM "WhatsAppSettings"
        WHERE id = ${ROW_ID}
        FOR UPDATE SKIP LOCKED
      )
    `;
    return updated === 1;
  }
}
