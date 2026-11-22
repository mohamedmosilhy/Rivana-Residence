import "server-only";

import type {
  GuestReservationReader,
  GuestReservationRecord,
} from "@/application/reservations";
import type { PhoneNumber } from "@/domain/guests";
import type { ReservationReference } from "@/domain/reservations";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaReservationRepository } from "../reservation-repository";

/** "My reservations" is the most recent N of a phone. */
const SUMMARY_LIMIT = 100;
const day = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Reads that start from a token hash or a verified phone. Ownership is part of
 * every query (the unique token hash, or the guest's unique phone), so a row
 * that is not the caller's is simply not found.
 */
export class PrismaGuestReservationReader implements GuestReservationReader {
  constructor(private readonly client: PrismaClient) {}

  findByManageTokenHash(tokenHash: string) {
    return this.load({ manageTokenHash: tokenHash });
  }

  findForPhone(phone: PhoneNumber, reference: ReservationReference) {
    return this.load({
      reference: reference.value,
      guest: { phone: phone.value },
    });
  }

  async listForPhone(phone: PhoneNumber) {
    const rows = await this.client.reservation.findMany({
      where: { guest: { phone: phone.value } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: SUMMARY_LIMIT,
      select: {
        reference: true,
        status: true,
        checkIn: true,
        checkOut: true,
        totalMinor: true,
        createdAt: true,
        branch: { select: { name: true, slug: true } },
        _count: { select: { rooms: true } },
      },
    });
    return rows.map((row) => ({
      reference: row.reference,
      status: row.status,
      branchName: row.branch.name,
      branchSlug: row.branch.slug,
      stay: { checkIn: day(row.checkIn), checkOut: day(row.checkOut) },
      units: row._count.rooms,
      totalMinor: row.totalMinor,
      createdAt: row.createdAt,
    }));
  }

  private async load(
    where: Prisma.ReservationWhereInput,
  ): Promise<GuestReservationRecord | null> {
    const key = await this.client.reservation.findFirst({
      where,
      select: {
        id: true,
        branchId: true,
        guest: { select: { phone: true } },
      },
    });
    if (!key) return null;
    const reservation = await new PrismaReservationRepository(
      this.client,
    ).findById(key.branchId, key.id);
    if (!reservation) return null;
    const [branch, rooms] = await Promise.all([
      this.client.branch.findUniqueOrThrow({
        where: { id: key.branchId },
        select: { name: true, slug: true, phone: true, email: true },
      }),
      this.client.room.findMany({
        where: {
          id: { in: [...new Set(reservation.lines.map((l) => l.roomTypeId))] },
        },
        select: { id: true, name: true },
      }),
    ]);
    return {
      stored: reservation,
      ownerPhone: key.guest?.phone ?? null,
      branch,
      roomNames: Object.fromEntries(rooms.map((room) => [room.id, room.name])),
    };
  }
}
