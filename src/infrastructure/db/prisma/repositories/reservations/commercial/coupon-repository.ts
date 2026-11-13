import "server-only";

import type { BranchScope } from "@/application/auth/authorize-branch";
import type {
  CouponLookup,
  CouponRepository,
  CouponQuery,
  ManagedCoupon,
} from "@/application/coupons";
import { ADMIN_PAGE_SIZE } from "@/application/shared/pagination";
import { failure, success, type Result } from "@/application/shared/result";
import type { CouponInput, CouponRecord } from "@/domain/coupons";
import { Money } from "@/domain/shared/money";
import { Prisma } from "@/generated/prisma/client";
import {
  postgresErrorCode,
  translatePrismaWriteError,
} from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const select = {
  id: true,
  code: true,
  kind: true,
  percentBasisPoints: true,
  amountMinor: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  maxRedemptions: true,
  maxRedemptionsPerPhone: true,
  allBranches: true,
  active: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  branches: {
    select: { branchId: true },
    orderBy: { branchId: "asc" as const },
  },
} as const;
type Row = Prisma.CouponGetPayload<{ select: typeof select }>;
function record(row: Row): ManagedCoupon {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    percentBasisPoints: row.percentBasisPoints,
    amount:
      row.amountMinor === null
        ? null
        : Money.create({
            amountMinor: row.amountMinor,
            currency: row.currency,
          }),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    maxRedemptionsPerPhone: row.maxRedemptionsPerPhone,
    allBranches: row.allBranches,
    branchIds: row.branches.map((branch) => branch.branchId),
    active: row.active,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    redemptionsTotal: 0, // M8 adds persisted redemptions.
  };
}
function data(input: CouponInput) {
  return {
    code: input.code,
    kind: input.kind,
    percentBasisPoints: input.percentBasisPoints,
    amountMinor: input.amount?.amountMinor ?? null,
    currency: "USD",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    maxRedemptions: input.maxRedemptions,
    maxRedemptionsPerPhone: input.maxRedemptionsPerPhone,
    allBranches: input.allBranches,
    active: input.active,
    description: input.description,
  };
}

export class PrismaCouponRepository implements CouponRepository, CouponLookup {
  constructor(private readonly client: DatabaseClient) {}

  async findByCode(code: string): Promise<CouponRecord | null> {
    // One statement hydrates the coupon and its branch joins, like `list`.
    // The match uses the unique `upper(code)` index, never a pattern.
    type LookupRow = Omit<Row, "branches"> & Readonly<{ branchIds: string[] }>;
    const [row] = await this.client.$queryRaw<LookupRow[]>(Prisma.sql`
      SELECT c.id, c.code, c.kind, c."percentBasisPoints", c."amountMinor", c.currency,
        c."startsAt", c."endsAt", c."maxRedemptions", c."maxRedemptionsPerPhone",
        c."allBranches", c.active, c.description, c."createdAt", c."updatedAt",
        ARRAY(SELECT cb."branchId" FROM "CouponBranch" cb
          WHERE cb."couponId" = c.id ORDER BY cb."branchId") AS "branchIds"
      FROM "Coupon" c WHERE upper(c.code) = upper(${code})
    `);
    return row
      ? record({
          ...row,
          branches: row.branchIds.map((branchId) => ({ branchId })),
        })
      : null;
  }

  async list(scope: BranchScope, query: CouponQuery) {
    const filters: Prisma.Sql[] = [];
    if (scope !== "ALL") {
      if (scope.length === 0) filters.push(Prisma.sql`FALSE`);
      else
        filters.push(Prisma.sql`
        c."allBranches" = FALSE
        AND EXISTS (SELECT 1 FROM "CouponBranch" cb WHERE cb."couponId" = c.id)
        AND NOT EXISTS (
          SELECT 1 FROM "CouponBranch" cb WHERE cb."couponId" = c.id
            AND cb."branchId" NOT IN (${Prisma.join([...scope])})
        )
      `);
    }
    if (query.branchId)
      filters.push(Prisma.sql`
      (c."allBranches" OR EXISTS (
        SELECT 1 FROM "CouponBranch" cb WHERE cb."couponId" = c.id AND cb."branchId" = ${query.branchId}
      ))
    `);
    if (query.active !== undefined)
      filters.push(Prisma.sql`c.active = ${query.active}`);
    if (query.q)
      filters.push(Prisma.sql`strpos(upper(c.code), upper(${query.q})) > 0`);
    const where = filters.length
      ? Prisma.join(filters, " AND ")
      : Prisma.sql`TRUE`;
    // Prisma's relation hydration uses a second statement. A scope edit
    // between parent and relation reads could disclose foreign branches.
    // Filter and hydrate each item in one PostgreSQL statement snapshot.
    type ListRow = Omit<Row, "branches"> & Readonly<{ branchIds: string[] }>;
    const [rows, counts] = await Promise.all([
      this.client.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT c.id, c.code, c.kind, c."percentBasisPoints", c."amountMinor", c.currency,
          c."startsAt", c."endsAt", c."maxRedemptions", c."maxRedemptionsPerPhone",
          c."allBranches", c.active, c.description, c."createdAt", c."updatedAt",
          ARRAY(SELECT cb."branchId" FROM "CouponBranch" cb
            WHERE cb."couponId" = c.id ORDER BY cb."branchId") AS "branchIds"
        FROM "Coupon" c WHERE ${where}
        ORDER BY c.code, c.id
        LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(query.page - 1) * ADMIN_PAGE_SIZE}
      `),
      this.client.$queryRaw<Readonly<{ total: bigint }>[]>(Prisma.sql`
        SELECT count(*) AS total FROM "Coupon" c WHERE ${where}
      `),
    ]);
    return {
      items: rows.map((row) =>
        record({
          ...row,
          branches: row.branchIds.map((branchId) => ({ branchId })),
        }),
      ),
      total: Number(counts[0]?.total ?? 0n),
      page: query.page,
      pageSize: ADMIN_PAGE_SIZE,
    };
  }

  async branchesExist(ids: readonly string[]) {
    return (
      (await this.client.branch.count({ where: { id: { in: [...ids] } } })) ===
      ids.length
    );
  }

  async create(
    id: string,
    input: CouponInput,
    actorId: string,
    now: Date,
  ): Promise<Result<ManagedCoupon>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const row = await this.client.coupon.create({
        data: {
          id,
          ...data(input),
          createdAt: now,
          updatedAt: now,
          createdById: actorId,
          updatedById: actorId,
          branches: {
            create: input.branchIds.map((branchId) => ({ branchId })),
          },
        },
        select,
      });
      return success(record(row));
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure("TRY_AGAIN", "Coupons are busy. Try again shortly.");
      return translatePrismaWriteError(error);
    }
  }

  async lock(id: string): Promise<Result<ManagedCoupon | null>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "Coupon" WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) return success(null);
      const row = await this.client.coupon.findUnique({
        where: { id },
        select,
      });
      return success(row ? record(row) : null);
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure("TRY_AGAIN", "Coupons are busy. Try again shortly.");
      throw error;
    }
  }

  async replace(id: string, input: CouponInput, actorId: string, now: Date) {
    const row = await this.client.coupon.update({
      where: { id },
      data: {
        ...data(input),
        updatedAt: now,
        updatedById: actorId,
        branches: {
          deleteMany: {},
          create: input.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select,
    });
    return record(row);
  }
}
