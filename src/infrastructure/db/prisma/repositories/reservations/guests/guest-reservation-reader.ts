import "server-only";

import {
  unlinkedReservationPhone,
  type GuestReservationReader,
  type GuestReservationRecord,
} from "@/application/reservations";
import type { PhoneNumber } from "@/domain/guests";
import type { ReservationReference } from "@/domain/reservations";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PrismaBookingPaymentStore } from "../booking-payment-store";
import { PrismaChangeRequestStore } from "../change-request-store";
import { PrismaCancellationRequestStore } from "../cancellation-request-store";
import { PrismaReservationRepository } from "../reservation-repository";
import { PrismaGuestRepository } from "./guest-repository";

/** "My reservations" is the most recent N of a phone. */
const SUMMARY_LIMIT = 100;
/**
 * A phone session proves the phone, so it never sees a booking someone made
 * with an email code while typing that phone (spec 0006 Decision 9). A null
 * channel is a staff, external, or pre ADR 031 WhatsApp booking.
 */
const NOT_EMAIL_VERIFIED: Prisma.ReservationWhereInput = {
  OR: [{ verificationChannel: null }, { verificationChannel: "WHATSAPP" }],
};
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
      ...NOT_EMAIL_VERIFIED,
    });
  }

  async listForPhone(phone: PhoneNumber) {
    const rows = await this.client.reservation.findMany({
      where: { guest: { phone: phone.value }, ...NOT_EMAIL_VERIFIED },
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

  private load(
    where: Prisma.ReservationWhereInput,
  ): Promise<GuestReservationRecord | null> {
    // A staff transition can change the booking and close its request together.
    // Use one snapshot for access, the booking, and its cancellation state.
    return this.client.$transaction(
      async (transaction) => {
        const key = await transaction.reservation.findFirst({
          where,
          select: {
            id: true,
            branchId: true,
            guest: { select: { phone: true, blockedAt: true } },
            branch: {
              select: {
                name: true,
                slug: true,
                phone: true,
                email: true,
                timeZone: true,
                checkInTime: true,
              },
            },
          },
        });
        if (!key) return null;
        const reservation = await new PrismaReservationRepository(
          transaction,
        ).findById(key.branchId, key.id);
        if (!reservation) return null;
        const phone = unlinkedReservationPhone(reservation);
        const guest = phone
          ? await new PrismaGuestRepository(transaction).findByPhone(phone)
          : key.guest;
        const cancellations = new PrismaCancellationRequestStore(transaction);
        const cancellationRequest = await cancellations.findCurrent(
          reservation.id,
        );
        const cancellationRequestActive =
          (await cancellations.findActive(reservation.id)) !== null;
        const changeRequest = await new PrismaChangeRequestStore(
          transaction,
        ).findCurrent(reservation.id);
        const paidPayment =
          reservation.paymentMethod === "ONLINE" &&
          reservation.paymentStatus === "PAID"
            ? await new PrismaBookingPaymentStore(transaction).findPaidPayment(
                reservation.id,
              )
            : null;
        const rooms = await transaction.room.findMany({
          where: {
            id: {
              in: [...new Set(reservation.lines.map((l) => l.roomTypeId))],
            },
          },
          select: { id: true, name: true },
        });
        const { timeZone, checkInTime, ...contact } = key.branch;
        return {
          stored: reservation,
          ownerPhone: key.guest?.phone ?? null,
          branch: contact,
          cancellationTiming: { timeZone, checkInTime },
          currentCancellationRequest: cancellationRequest,
          cancellationRequestActive,
          currentChangeRequest: changeRequest,
          paidTotalMinor: paidPayment?.amountMinor ?? null,
          phoneBlocked: Boolean(guest?.blockedAt),
          roomNames: Object.fromEntries(
            rooms.map((room) => [room.id, room.name]),
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
