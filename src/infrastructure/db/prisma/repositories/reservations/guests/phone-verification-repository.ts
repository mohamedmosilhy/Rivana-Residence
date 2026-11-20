import "server-only";
import type {
  PhoneVerificationRepository,
  VerificationRecord,
} from "@/application/guests";
import { failure, success } from "@/application/shared/result";
import { VERIFICATION_POLICY, type PhoneNumber } from "@/domain/guests";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";

export class PrismaPhoneVerificationRepository
  implements PhoneVerificationRepository
{
  constructor(private readonly client: DatabaseClient) {}
  private async locked<T>(operation: () => Promise<T>) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      return success(await operation());
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure(
          "TRY_AGAIN",
          "Verification is busy. Please try again shortly.",
        );
      throw error;
    }
  }
  lockPhone(phone: PhoneNumber) {
    return this.locked(async () => {
      // A separate namespace avoids collisions with other advisory lock users.
      // A hash collision only serializes unrelated phones, never bypasses a limit.
      await this.client
        .$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-verification:${phone.value}`}, 0))::text`;
    });
  }
  findById(id: string) {
    return this.client.phoneVerification.findUnique({ where: { id } });
  }
  findByTokenHash(tokenHash: string) {
    return this.client.phoneVerification.findUnique({ where: { tokenHash } });
  }
  async consume(id: string, at: Date) {
    // Defense in depth: the caller holds the row lock, and a used token stays used.
    await this.client.phoneVerification.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: at },
    });
  }
  lock(id: string) {
    return this.locked(async () => {
      const rows = await this.client.$queryRaw<
        Readonly<{ id: string }>[]
      >`SELECT id FROM "PhoneVerification" WHERE id = ${id} FOR UPDATE`;
      return rows.length ? this.findById(id) : null;
    });
  }
  async requestHistory(phone: PhoneNumber, since: Date) {
    const rows = await this.client.phoneVerification.findMany({
      where: { phone: phone.value, createdAt: { gt: since } },
      select: { createdAt: true },
    });
    return rows.map((row) => row.createdAt);
  }
  async insert(record: VerificationRecord) {
    await this.client.phoneVerification.create({ data: record });
  }
  async saveConfirmation(
    id: string,
    values: Parameters<PhoneVerificationRepository["saveConfirmation"]>[1],
  ) {
    await this.client.phoneVerification.update({ where: { id }, data: values });
  }
  async invalidate(id: string) {
    // Preserve the domain expiry ordering and request history. Exhaust the code instead.
    await this.client.phoneVerification.update({
      where: { id },
      data: {
        attempts: VERIFICATION_POLICY.maxAttempts,
        tokenHash: null,
        tokenExpiresAt: null,
      },
    });
  }
}
