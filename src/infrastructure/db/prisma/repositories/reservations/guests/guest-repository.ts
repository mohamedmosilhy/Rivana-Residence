import "server-only";

import type { GuestIdentity, GuestRepository } from "@/application/guests";
import { failure, success } from "@/application/shared/result";
import type { PhoneNumber } from "@/domain/guests";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export class PrismaGuestRepository implements GuestRepository {
  constructor(private readonly client: DatabaseClient) {}

  findByPhone(phone: PhoneNumber) {
    return this.client.guest.findUnique({ where: { phone: phone.value } });
  }

  async ensureExists(input: GuestIdentity) {
    // DO NOTHING avoids overwriting a blocked or opted out profile before its lock is held.
    await this.client.$executeRaw`
      INSERT INTO "Guest" (id, phone, name, email, "createdAt", "updatedAt")
      VALUES (${input.id}, ${input.phone.value}, ${input.name}, ${input.email}, ${input.at}, ${input.at})
      ON CONFLICT (phone) DO NOTHING
    `;
    const guest = await this.findByPhone(input.phone);
    if (!guest) throw new Error("Guest identity was not persisted.");
    return guest;
  }

  async lockByPhone(phone: PhoneNumber) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const rows = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "Guest" WHERE phone = ${phone.value} FOR UPDATE
      `;
      if (rows.length === 0) return success(null);
      return success(await this.findByPhone(phone));
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure(
          "TRY_AGAIN",
          "Guest record is busy. Please try again shortly.",
        );
      throw error;
    }
  }

  async recordWebsiteBooking(
    input: Parameters<GuestRepository["recordWebsiteBooking"]>[0],
  ) {
    // The caller holds the guest row lock, so this read cannot go stale.
    const current = await this.client.guest.findUniqueOrThrow({
      where: { id: input.id },
      select: { phoneVerifiedAt: true },
    });
    return this.client.guest.update({
      where: { id: input.id },
      data: {
        name: input.name,
        email: input.email,
        updatedAt: input.verifiedAt,
        phoneVerifiedAt: current.phoneVerifiedAt ?? input.verifiedAt,
        ...(input.marketingConsentVersion === null
          ? {}
          : {
              marketingOptInAt: input.verifiedAt,
              marketingConsentVersion: input.marketingConsentVersion,
              marketingOptOutAt: null,
            }),
      },
    });
  }

  updateContact(input: Parameters<GuestRepository["updateContact"]>[0]) {
    return this.client.guest.update({
      where: { id: input.id },
      data: { name: input.name, email: input.email, updatedAt: input.at },
    });
  }
}
