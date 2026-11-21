import "server-only";

import type {
  CouponRedemptionCounts,
  CouponRedemptionReader,
  CouponRedemptionStore,
} from "@/application/coupons";
import { failure, success } from "@/application/shared/result";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

/**
 * Counts unreleased redemptions. Public quotes pass `phoneAware: false` and
 * P6 drops any `phone` it is sent (M8-T7b), so a guesser can never learn
 * which phone used a coupon (M7 AC-4). The booking transaction passes
 * `true` and only ever supplies a phone proved by a verification token.
 */
export class PrismaCouponRedemptionReader implements CouponRedemptionReader {
  constructor(
    private readonly client: DatabaseClient,
    private readonly options: Readonly<{ phoneAware: boolean }>,
  ) {}

  async count(
    input: Readonly<{ code: string; phone?: string | undefined }>,
  ): Promise<CouponRedemptionCounts> {
    const coupon = {
      code: { equals: input.code, mode: "insensitive" },
    } as const;
    const total = await this.client.couponRedemption.count({
      where: { releasedAt: null, coupon },
    });
    const forPhone =
      this.options.phoneAware && input.phone
        ? await this.client.couponRedemption.count({
            where: { releasedAt: null, phone: input.phone, coupon },
          })
        : 0;
    return { total, forPhone };
  }
}

export class PrismaCouponRedemptionStore implements CouponRedemptionStore {
  constructor(private readonly client: DatabaseClient) {}

  async lockByCode(code: string) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const rows = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "Coupon" WHERE upper(code) = upper(${code}) FOR UPDATE
      `;
      return success(rows[0]?.id ?? null);
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure("TRY_AGAIN", "Coupons are busy. Try again shortly.");
      throw error;
    }
  }

  async record(input: Parameters<CouponRedemptionStore["record"]>[0]) {
    await this.client.couponRedemption.create({
      data: {
        couponId: input.couponId,
        reservationId: input.reservationId,
        phone: input.phone,
        createdAt: input.at,
      },
    });
  }

  async release(reservationId: string, at: Date) {
    await this.client.couponRedemption.updateMany({
      where: { reservationId, releasedAt: null },
      data: { releasedAt: at },
    });
  }
}
