import "server-only";

import type { BranchScope } from "@/application/auth";
import type {
  StaffReservationQuery,
  StaffReservationReader,
} from "@/application/reservations";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PrismaReservationRepository } from "./reservation-repository";

function contains(value: string) {
  return {
    contains: value.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive",
  } as const;
}

export class PrismaStaffReservationReader implements StaffReservationReader {
  constructor(private readonly client: PrismaClient) {}

  findVisible(id: string, scope: BranchScope) {
    return new PrismaReservationRepository(this.client).findVisible(id, scope);
  }

  async list(
    scope: BranchScope,
    query: StaffReservationQuery,
    includeGuest: boolean,
  ) {
    const where: Prisma.ReservationWhereInput = {
      ...(scope === "ALL" ? {} : { branchId: { in: [...scope] } }),
      ...(query.source ? { source: query.source } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from
        ? { checkOut: { gt: new Date(query.from + "T00:00:00Z") } }
        : {}),
      ...(query.to
        ? { checkIn: { lt: new Date(query.to + "T00:00:00Z") } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { reference: contains(query.q) },
              { externalReference: contains(query.q) },
              ...(includeGuest
                ? [
                    { guestName: contains(query.q) },
                    { guestEmail: contains(query.q) },
                    { guestPhone: contains(query.q) },
                  ]
                : []),
            ],
          }
        : {}),
    };
    const order = query.sort.startsWith("-") ? "desc" : "asc";
    const sort: Prisma.ReservationOrderByWithRelationInput =
      query.sort.endsWith("checkIn")
        ? { checkIn: order }
        : { createdAt: order };
    const [rows, total] = await this.client.$transaction(
      [
        this.client.reservation.findMany({
          where,
          orderBy: [sort, { id: "asc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            branchId: true,
            reference: true,
            source: true,
            status: true,
            checkIn: true,
            checkOut: true,
            externalReference: true,
            guestName: includeGuest,
            totalMinor: true,
            createdAt: true,
          },
        }),
        this.client.reservation.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        reference: row.reference,
        source: row.source,
        status: row.status,
        externalReference: row.externalReference,
        totalMinor: row.totalMinor,
        guestName: includeGuest ? row.guestName : null,
        createdAt: row.createdAt.toISOString(),
        stay: {
          checkIn: row.checkIn.toISOString().slice(0, 10),
          checkOut: row.checkOut.toISOString().slice(0, 10),
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
