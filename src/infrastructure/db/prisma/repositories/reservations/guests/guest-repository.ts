import "server-only";

import type { GuestIdentity, GuestRepository } from "@/application/guests";
import { failure, success } from "@/application/shared/result";
import { websiteBookingProfile, type PhoneNumber } from "@/domain/guests";
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
      select: { phoneVerifiedAt: true, email: true, emailVerifiedAt: true },
    });
    const update = websiteBookingProfile(current, {
      name: input.name,
      email: input.email,
      channel: input.channel,
      at: input.verifiedAt,
      marketingConsentVersion: input.marketingConsentVersion,
    });
    return this.client.guest.update({
      where: { id: input.id },
      data: {
        ...(update.contact ?? {}),
        updatedAt: input.verifiedAt,
        phoneVerifiedAt: update.phoneVerifiedAt,
        emailVerifiedAt: update.emailVerifiedAt,
        ...(update.marketingConsentVersion === null
          ? {}
          : {
              marketingOptInAt: input.verifiedAt,
              marketingConsentVersion: update.marketingConsentVersion,
              marketingOptOutAt: null,
            }),
      },
    });
  }

  findById(id: string) {
    return this.client.guest.findUnique({ where: { id } });
  }

  async lockById(id: string) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const rows = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "Guest" WHERE id = ${id} FOR UPDATE
      `;
      if (rows.length === 0) return success(null);
      return success(await this.findById(id));
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure(
          "TRY_AGAIN",
          "Guest record is busy. Please try again shortly.",
        );
      throw error;
    }
  }

  setBlocked(input: Parameters<GuestRepository["setBlocked"]>[0]) {
    return this.client.guest.update({
      where: { id: input.id },
      data: {
        blockedAt: input.at,
        blockedById: input.by,
        blockReason: input.reason,
        updatedAt: input.at,
      },
    });
  }

  clearBlocked(input: Parameters<GuestRepository["clearBlocked"]>[0]) {
    return this.client.guest.update({
      where: { id: input.id },
      data: {
        blockedAt: null,
        blockedById: null,
        blockReason: null,
        updatedAt: input.at,
      },
    });
  }

  async updateContact(input: Parameters<GuestRepository["updateContact"]>[0]) {
    // The caller holds the guest row lock. A new address was never proven.
    const current = await this.client.guest.findUniqueOrThrow({
      where: { id: input.id },
      select: { email: true },
    });
    return this.client.guest.update({
      where: { id: input.id },
      data: {
        name: input.name,
        email: input.email,
        updatedAt: input.at,
        ...(current.email === input.email ? {} : { emailVerifiedAt: null }),
      },
    });
  }
}
