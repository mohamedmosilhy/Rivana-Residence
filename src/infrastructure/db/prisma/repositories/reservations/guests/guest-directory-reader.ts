import "server-only";

import type { BranchScope } from "@/application/auth/authorize-branch";
import type {
  GuestDirectoryQuery,
  GuestDirectoryReader,
} from "@/application/guests";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

/** The reservation list on S51 is the most recent N in scope. */
const RESERVATION_LIMIT = 100;

function contains(value: string) {
  return {
    contains: value.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive",
  } as const;
}
const day = (value: Date) => value.toISOString().slice(0, 10);

function reservationScope(scope: BranchScope) {
  return scope === "ALL"
    ? ({} satisfies Prisma.ReservationWhereInput)
    : ({ branchId: { in: [...scope] } } satisfies Prisma.ReservationWhereInput);
}

/**
 * Admin sees every guest. A branch scoped role sees only guests with at least
 * one reservation in its own branches; any other guest does not exist for it.
 */
function visibleTo(scope: BranchScope): Prisma.GuestWhereInput {
  return scope === "ALL"
    ? {}
    : { reservations: { some: reservationScope(scope) } };
}

export class PrismaGuestDirectoryReader implements GuestDirectoryReader {
  constructor(private readonly client: PrismaClient) {}

  async list(scope: BranchScope, query: GuestDirectoryQuery) {
    // Phones are stored compact, so a typed "+20 100 123" still matches.
    const compact = query.q?.replace(/[\s()-]/g, "") ?? "";
    const where: Prisma.GuestWhereInput = {
      ...visibleTo(scope),
      ...(query.blocked === undefined
        ? {}
        : { blockedAt: query.blocked ? { not: null } : null }),
      ...(query.q
        ? {
            OR: [
              { name: contains(query.q) },
              ...(compact ? [{ phone: contains(compact) }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.client.$transaction(
      [
        this.client.guest.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            phone: true,
            name: true,
            phoneVerifiedAt: true,
            blockedAt: true,
            _count: {
              select: { reservations: { where: reservationScope(scope) } },
            },
          },
        }),
        this.client.guest.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        name: row.name,
        verified: row.phoneVerifiedAt !== null,
        blocked: row.blockedAt !== null,
        reservationCount: row._count.reservations,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async find(id: string, scope: BranchScope) {
    const guest = await this.client.guest.findFirst({
      where: { id, ...visibleTo(scope) },
    });
    if (!guest) return null;
    const rows = await this.client.reservation.findMany({
      where: { guestId: id, ...reservationScope(scope) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: RESERVATION_LIMIT,
      select: {
        id: true,
        branchId: true,
        reference: true,
        source: true,
        status: true,
        checkIn: true,
        checkOut: true,
        totalMinor: true,
      },
    });
    return {
      guest,
      reservations: rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        reference: row.reference,
        source: row.source,
        status: row.status,
        stay: { checkIn: day(row.checkIn), checkOut: day(row.checkOut) },
        totalMinor: row.totalMinor,
      })),
    };
  }
}
