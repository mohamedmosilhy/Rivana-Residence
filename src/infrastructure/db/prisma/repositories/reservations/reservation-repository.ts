import "server-only";

import type {
  ReservationInsert,
  ReservationRepository,
  StoredReservation,
} from "@/application/reservations";
import { failure, success } from "@/application/shared/result";
import { consumesInventory, ReservationReference } from "@/domain/reservations";
import { SERVICE_KINDS } from "@/domain/services";
import type { PhoneNumber } from "@/domain/guests";
import type { ReservationSource } from "@/domain/shared/types";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import { Prisma } from "@/generated/prisma/client";
import { postgresErrorCode } from "@/infrastructure/db/prisma/error-translation";
import {
  withTransaction,
  type DatabaseClient,
} from "@/infrastructure/db/prisma/transaction";

const graph = {
  rooms: {
    orderBy: { id: "asc" },
    include: { nights: { orderBy: { night: "asc" } } },
  },
  services: { orderBy: { kind: "asc" } },
} as const;
type Row = Prisma.ReservationGetPayload<{ include: typeof graph }>;
const date = (value: Date) => LocalDate.parse(value.toISOString().slice(0, 10));
const money = (value: number | null) =>
  value === null ? null : Money.create({ amountMinor: value, currency: "USD" });
const stay = (start: Date, end: Date) =>
  StayRange.create(date(start), date(end));

function map(row: Row): StoredReservation {
  return {
    id: row.id,
    reference: ReservationReference.parse(row.reference),
    branchId: row.branchId,
    source: row.source,
    status: row.status,
    stay: stay(row.checkIn, row.checkOut),
    guestId: row.guestId,
    contact: {
      fullName: row.guestName,
      email: row.guestEmail,
      phone: row.guestPhone,
      country: row.guestCountry,
      specialRequests: row.specialRequests,
    },
    internalNotes: row.internalNotes,
    externalReference: row.externalReference,
    snapshot:
      row.totalMinor === null
        ? null
        : {
            accommodationMinor: row.accommodationMinor!,
            servicesMinor: row.servicesMinor,
            subtotalMinor: row.subtotalMinor!,
            discountMinor: row.discountMinor,
            taxableMinor: row.taxableMinor!,
            vatRateBasisPoints: row.vatRateBasisPoints!,
            vatMinor: row.vatMinor!,
            totalMinor: row.totalMinor,
            couponValue:
              row.couponKind === null
                ? null
                : row.couponKind === "PERCENT"
                  ? { kind: "PERCENT", percentBasisPoints: row.couponValue! }
                  : {
                      kind: "FIXED",
                      amount: Money.create({
                        amountMinor: row.couponValue!,
                        currency: "USD",
                      }),
                    },
            serviceLines: row.services.map((line) => ({
              kind: line.kind,
              vehicles: line.vehicles,
              details: line.details,
              unit: line.priceUnit,
              priceMinor: line.priceMinor,
              childPriceMinor: line.childPriceMinor,
              adults: line.adults,
              children: line.children,
              nights: line.nights,
              adultQuantity: line.adultQuantity,
              childQuantity: line.childQuantity,
              amountMinor: line.amountMinor,
            })),
          },
    couponId: row.couponId,
    couponCode: row.couponCode,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    privacyNoticeVersion: row.privacyNoticeVersion,
    manageTokenHash: row.manageTokenHash,
    manageTokenExpiresAt: row.manageTokenExpiresAt,
    idempotencyKeyHash: row.idempotencyKeyHash,
    requestFingerprint: row.requestFingerprint,
    createdById: row.createdById,
    version: row.version,
    holdExpiresAt: row.holdExpiresAt,
    pmsEnteredAt: row.pmsEnteredAt,
    pmsEnteredById: row.pmsEnteredById,
    statusChangedAt: row.statusChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.rooms.map((line) => ({
      id: line.id,
      roomTypeId: line.roomTypeId,
      physicalRoomId: line.physicalRoomId,
      stay: stay(line.checkIn, line.checkOut),
      occupancy: Occupancy.create({
        adults: line.adults,
        children: line.children,
      }),
      consumesInventory: line.consumesInventory,
      subtotal: money(line.subtotalMinor),
      nights: line.nights.map((night) => ({
        night: date(night.night),
        amount: money(night.amountMinor),
        source: night.rateSource,
        periodId: night.ratePeriodId,
        label: night.label,
      })),
    })),
  };
}

/** Storage only. The caller must authorize and reserve inventory before inserting. */
export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly client: DatabaseClient) {}

  async findById(branchId: string, id: string) {
    const row = await this.client.reservation.findFirst({
      where: { id, branchId },
      include: graph,
    });
    return row ? map(row) : null;
  }

  async findByReference(branchId: string, reference: ReservationReference) {
    const row = await this.client.reservation.findFirst({
      where: { reference: reference.value, branchId },
      include: graph,
    });
    return row ? map(row) : null;
  }

  async findByIdempotencyKey(
    source: ReservationSource,
    createdById: string | null,
    keyHash: string,
  ) {
    const row = await this.client.reservation.findFirst({
      where: { source, createdById, idempotencyKeyHash: keyHash },
      include: graph,
    });
    return row ? map(row) : null;
  }

  async listPhoneBookings(phone: PhoneNumber) {
    const rows = await this.client.reservation.findMany({
      where: {
        // Through the unique guest phone, so the indexed guest id is used.
        guest: { phone: phone.value },
        source: "WEBSITE",
        status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] },
      },
      select: {
        id: true,
        source: true,
        status: true,
        paymentMethod: true,
        checkIn: true,
        holdExpiresAt: true,
        branch: { select: { timeZone: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      paymentMethod: row.paymentMethod,
      checkIn: date(row.checkIn),
      branchTimeZone: row.branch.timeZone,
      holdExpiresAt: row.holdExpiresAt,
    }));
  }

  async insert(input: ReservationInsert) {
    try {
      return await withTransaction(this.client, async (transaction) => {
        const snapshot = input.snapshot;
        const coupon = snapshot?.couponValue;
        const header = {
          id: input.id,
          reference: input.reference.value,
          branchId: input.branchId,
          source: input.source,
          status: input.status,
          checkIn: input.stay.checkIn.value,
          checkOut: input.stay.checkOut.value,
          guestId: input.guestId,
          guestName: input.contact.fullName,
          guestEmail: input.contact.email,
          guestPhone: input.contact.phone?.value ?? null,
          guestCountry: input.contact.country,
          specialRequests: input.contact.specialRequests,
          internalNotes: input.internalNotes,
          externalReference: input.externalReference,
          accommodationMinor: snapshot?.accommodationMinor ?? null,
          servicesMinor: snapshot?.servicesMinor ?? 0,
          subtotalMinor: snapshot?.subtotalMinor ?? null,
          discountMinor: snapshot?.discountMinor ?? 0,
          taxableMinor: snapshot?.taxableMinor ?? null,
          vatRateBasisPoints: snapshot?.vatRateBasisPoints ?? null,
          vatMinor: snapshot?.vatMinor ?? null,
          totalMinor: snapshot?.totalMinor ?? null,
          couponId: input.couponId,
          couponCode: input.couponCode,
          couponKind: coupon?.kind ?? null,
          couponValue: coupon
            ? coupon.kind === "PERCENT"
              ? coupon.percentBasisPoints
              : coupon.amount.amountMinor
            : null,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          privacyNoticeVersion: input.privacyNoticeVersion,
          manageTokenHash: input.manageTokenHash,
          manageTokenExpiresAt: input.manageTokenExpiresAt,
          idempotencyKeyHash: input.idempotencyKeyHash,
          requestFingerprint: input.requestFingerprint,
          createdById: input.createdById,
          statusChangedAt: input.at,
          createdAt: input.at,
          updatedAt: input.at,
        };
        // Keys are static identifiers above. Values always remain bound parameters.
        // Only a reference collision is suppressed. Other unique failures roll back.
        const columns = Object.keys(header).map((key) =>
          Prisma.raw('"' + key + '"'),
        );
        const inserted = await transaction.$queryRaw<
          Readonly<{ id: string }>[]
        >(Prisma.sql`
          INSERT INTO "Reservation" (${Prisma.join(columns)})
          VALUES (${Prisma.join(Object.values(header))})
          ON CONFLICT (reference) DO NOTHING RETURNING id
        `);
        if (inserted.length === 0) return success(null);
        await transaction.reservationRoom.createMany({
          data: input.lines.map((line) => ({
            id: line.id,
            reservationId: input.id,
            branchId: input.branchId,
            roomTypeId: line.roomTypeId,
            physicalRoomId: line.physicalRoomId,
            checkIn: new Date(input.stay.checkIn.value + "T00:00:00Z"),
            checkOut: new Date(input.stay.checkOut.value + "T00:00:00Z"),
            adults: line.occupancy.adults,
            children: line.occupancy.children,
            consumesInventory: consumesInventory(input.status),
            subtotalMinor: line.subtotal?.amountMinor ?? null,
          })),
        });
        await transaction.reservationNight.createMany({
          data: input.lines.flatMap((line) =>
            line.nights.map((night) => ({
              reservationRoomId: line.id,
              night: new Date(night.night.value + "T00:00:00Z"),
              amountMinor: night.amount?.amountMinor ?? null,
              rateSource: night.source,
              ratePeriodId: night.periodId,
              label: night.label,
            })),
          ),
        });
        if (snapshot?.serviceLines.length)
          await transaction.reservationService.createMany({
            data: snapshot.serviceLines.map((line) => ({
              reservationId: input.id,
              kind: serviceKind(line.kind),
              vehicles: line.vehicles,
              details: line.details,
              priceUnit: line.unit,
              priceMinor: line.priceMinor,
              childPriceMinor: line.childPriceMinor,
              adults: line.adults,
              children: line.children,
              nights: line.nights,
              adultQuantity: line.adultQuantity,
              childQuantity: line.childQuantity,
              amountMinor: line.amountMinor,
            })),
          });
        const stored = await new PrismaReservationRepository(
          transaction,
        ).findById(input.branchId, input.id);
        if (!stored)
          throw new Error("Reservation aggregate was not persisted.");
        return success(stored);
      });
    } catch (error) {
      const code = postgresErrorCode(error);
      if (
        code === "23505" ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002")
      )
        return failure(
          "CONFLICT",
          "A reservation with that unique value already exists.",
        );
      if (
        code === "23503" ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003")
      )
        return failure(
          "NOT_FOUND",
          "A reservation resource was not found in the branch.",
        );
      throw error;
    }
  }
}

// Quote service kinds are extensible strings. Persistence accepts the fixed domain list.
function serviceKind(value: string) {
  const kind = SERVICE_KINDS.find((candidate) => candidate === value);
  if (!kind) throw new Error("Unsupported reservation service kind.");
  return kind;
}
