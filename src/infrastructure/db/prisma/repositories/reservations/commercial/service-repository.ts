import "server-only";

import type {
  ServiceOfferingRecord,
  ServiceOfferingRepository,
  ServiceOfferingWrite,
  ServiceOfferingWriteOutcome,
} from "@/application/services";
import { failure, success, type Result } from "@/application/shared/result";
import type { ServiceKind, ServicePriceUnit } from "@/domain/services";
import { Money } from "@/domain/shared/money";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const select = {
  id: true,
  kind: true,
  priceUnit: true,
  priceMinor: true,
  childPriceMinor: true,
  currency: true,
  active: true,
  description: true,
  updatedAt: true,
} as const;

type Row = Prisma.ServiceOfferingGetPayload<{ select: typeof select }>;

const BUSY = "Services are busy. Please try the request again shortly.";

function record(row: Row): ServiceOfferingRecord {
  return {
    id: row.id,
    kind: row.kind as ServiceKind,
    priceUnit: row.priceUnit as ServicePriceUnit,
    price: Money.create({
      amountMinor: row.priceMinor,
      currency: row.currency,
    }),
    childPrice:
      row.childPriceMinor === null
        ? null
        : Money.create({
            amountMinor: row.childPriceMinor,
            currency: row.currency,
          }),
    active: row.active,
    description: row.description,
    updatedAt: row.updatedAt,
  };
}

export class PrismaServiceOfferingRepository
  implements ServiceOfferingRepository
{
  constructor(private readonly client: DatabaseClient) {}

  async branchExists(branchId: string) {
    const branch = await this.client.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    return branch !== null;
  }

  async listByBranch(branchId: string) {
    const rows = await this.client.serviceOffering.findMany({
      where: { branchId },
      select,
      orderBy: { kind: "asc" },
    });
    return rows.map(record);
  }

  async upsert(
    write: ServiceOfferingWrite,
  ): Promise<Result<ServiceOfferingWriteOutcome>> {
    const { input } = write;
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      // A missing row cannot be locked, so the insert settles the create race:
      // the loser sees DO NOTHING and then waits on the winner's row lock.
      const inserted = await this.client.$queryRaw<Readonly<{ id: string }>[]>(
        Prisma.sql`
          INSERT INTO "ServiceOffering"
            (id, "branchId", kind, "priceUnit", "priceMinor",
             "childPriceMinor", currency, active, description,
             "updatedAt", "updatedById")
          VALUES (${write.id}, ${write.branchId},
            ${write.kind}::"ServiceKind", ${input.priceUnit}::"ServicePriceUnit",
            ${input.price.amountMinor}, ${input.childPrice?.amountMinor ?? null},
            ${input.price.currency}, ${input.active}, ${input.description},
            ${write.now()}, ${write.updatedById})
          ON CONFLICT ("branchId", kind) DO NOTHING
          RETURNING id
        `,
      );
      const locked = await this.client.$queryRaw<Readonly<{ id: string }>[]>(
        Prisma.sql`
          SELECT id FROM "ServiceOffering"
          WHERE "branchId" = ${write.branchId}
            AND kind = ${write.kind}::"ServiceKind"
          FOR UPDATE
        `,
      );
      const id = locked[0]?.id;
      if (!id) return failure("NOT_FOUND", "This service was not found.");
      const current = await this.client.serviceOffering.findUniqueOrThrow({
        where: { id },
        select,
      });
      if (inserted.length > 0) {
        return success({ before: null, after: record(current), changed: true });
      }
      const before = record(current);
      const same =
        current.priceUnit === input.priceUnit &&
        current.priceMinor === input.price.amountMinor &&
        current.childPriceMinor === (input.childPrice?.amountMinor ?? null) &&
        current.active === input.active &&
        current.description === input.description;
      if (same) return success({ before, after: before, changed: false });
      const updated = await this.client.serviceOffering.update({
        where: { id },
        data: {
          priceUnit: input.priceUnit,
          priceMinor: input.price.amountMinor,
          childPriceMinor: input.childPrice?.amountMinor ?? null,
          currency: input.price.currency,
          active: input.active,
          description: input.description,
          updatedAt: write.now(),
          updatedById: write.updatedById,
        },
        select,
      });
      return success({ before, after: record(updated), changed: true });
    } catch (error) {
      if (postgresErrorCode(error) === "55P03") {
        return failure("TRY_AGAIN", BUSY);
      }
      throw error;
    }
  }
}
