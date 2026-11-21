import "server-only";

import type {
  ReservationChangeInsert,
  ReservationInsert,
  ReservationRepository,
  StayReplacement,
  StoredReservation,
  StoredReservationSnapshot,
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
  branch: { select: { timeZone: true } },
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
    branchTimeZone: row.branch.timeZone,
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
    externalChannel: row.externalChannel,
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
              occupancyEffectiveFrom: line.occupancyEffectiveFrom
                ? date(line.occupancyEffectiveFrom)
                : null,
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
    changeSeq: row.changeSeq,
    pmsUpdatePendingSince: row.pmsUpdatePendingSince,
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

  async findVisible(id: string, scope: "ALL" | readonly string[]) {
    const row = await this.client.reservation.findFirst({
      where: {
        id,
        ...(scope === "ALL" ? {} : { branchId: { in: [...scope] } }),
      },
      include: graph,
    });
    return row ? map(row) : null;
  }

  async exists(branchId: string, reference: string) {
    return (
      (await this.client.reservation.findUnique({
        where: {
          branchId_externalReference: {
            branchId,
            externalReference: reference,
          },
        },
        select: { id: true },
      })) !== null
    );
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

  async lockById(branchId: string, id: string) {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "Reservation"
        WHERE id = ${id} AND "branchId" = ${branchId} FOR UPDATE
      `;
      if (locked.length === 0) return success(null);
      return success(await this.findById(branchId, id));
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure(
          "TRY_AGAIN",
          "This reservation is busy. Try again shortly.",
        );
      throw error;
    }
  }

  async replaceStay(input: StayReplacement) {
    const snapshot = input.snapshot;
    const coupon = snapshot.couponValue;
    const checkIn = new Date(input.stay.checkIn.value + "T00:00:00Z");
    const checkOut = new Date(input.stay.checkOut.value + "T00:00:00Z");
    const { reservationId, branchId } = input;
    const client = this.client;
    const previous = await client.reservation.findFirstOrThrow({
      where: { id: reservationId, branchId },
      select: { status: true, pmsUpdatePendingSince: true },
    });
    // Service-only changes leave room and night rows untouched.
    if (input.lines) {
      await client.reservationRoom.deleteMany({ where: { reservationId } });
      await client.reservationRoom.createMany({
        data: input.lines.map((line) => ({
          id: line.id,
          reservationId,
          branchId,
          roomTypeId: line.roomTypeId,
          physicalRoomId: line.physicalRoomId,
          checkIn,
          checkOut,
          adults: line.occupancy.adults,
          children: line.occupancy.children,
          consumesInventory: consumesInventory(previous.status),
          subtotalMinor: line.subtotal?.amountMinor ?? null,
        })),
      });
      await client.reservationNight.createMany({
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
    }
    const services = await client.reservationService.findMany({
      where: { reservationId },
    });
    const nextKinds = new Set(snapshot.serviceLines.map((line) => line.kind));
    if (nextKinds.size !== snapshot.serviceLines.length)
      throw new Error("A reservation can have only one service per kind.");
    const removed = services.filter((row) => !nextKinds.has(row.kind));
    if (removed.length)
      await client.reservationService.deleteMany({
        where: { reservationId, kind: { in: removed.map((row) => row.kind) } },
      });
    for (const line of snapshot.serviceLines) {
      const kind = serviceKind(line.kind);
      const row = services.find((candidate) => candidate.kind === kind);
      const { price, mutable, occupancyEffectiveFrom } = serviceData(line);
      if (!row) {
        await client.reservationService.create({
          data: {
            reservationId,
            kind,
            ...price,
            ...mutable,
            occupancyEffectiveFrom,
          },
        });
        continue;
      }
      if (
        row.priceUnit !== price.priceUnit ||
        row.priceMinor !== price.priceMinor ||
        row.childPriceMinor !== price.childPriceMinor
      )
        throw new Error("A change cannot alter a retained service price.");
      if (
        row.occupancyEffectiveFrom?.getTime() !==
          occupancyEffectiveFrom?.getTime() ||
        (Object.keys(mutable) as (keyof typeof mutable)[]).some(
          (key) => row[key] !== mutable[key],
        )
      )
        await client.reservationService.update({
          where: { reservationId_kind: { reservationId, kind } },
          data: { ...mutable, occupancyEffectiveFrom },
        });
    }
    await client.reservation.update({
      where: { id: reservationId },
      data: {
        checkIn,
        checkOut,
        accommodationMinor: snapshot.accommodationMinor,
        servicesMinor: snapshot.servicesMinor,
        subtotalMinor: snapshot.subtotalMinor,
        discountMinor: snapshot.discountMinor,
        taxableMinor: snapshot.taxableMinor,
        vatRateBasisPoints: snapshot.vatRateBasisPoints,
        vatMinor: snapshot.vatMinor,
        totalMinor: snapshot.totalMinor,
        couponKind: coupon?.kind ?? null,
        couponValue: coupon
          ? coupon.kind === "PERCENT"
            ? coupon.percentBasisPoints
            : coupon.amount.amountMinor
          : null,
        version: { increment: 1 },
        changeSeq: { increment: 1 },
        updatedAt: input.at,
        // The flag keeps its first date across further changes (its age matters
        // to the front desk); only S55 clears it.
        ...(input.flagPmsUpdate && previous.pmsUpdatePendingSince === null
          ? { pmsUpdatePendingSince: input.at }
          : {}),
      },
    });
    const stored = await this.findById(branchId, reservationId);
    if (!stored) throw new Error("Reservation aggregate was not persisted.");
    return stored;
  }

  async appendChange(input: ReservationChangeInsert) {
    const current = await this.client.reservation.findFirstOrThrow({
      where: { id: input.reservationId, branchId: input.branchId },
      select: { changeSeq: true },
    });
    await this.client.reservationChange.create({
      data: {
        id: input.id,
        reservationId: input.reservationId,
        branchId: input.branchId,
        seq: current.changeSeq,
        kind: input.kind,
        actorType: input.actorType,
        actorId: input.actorId,
        before: input.before,
        after: input.after,
        oldTotalMinor: input.oldTotalMinor,
        newTotalMinor: input.newTotalMinor,
        overrideFromMinor: input.override?.fromMinor ?? null,
        overrideToMinor: input.override?.toMinor ?? null,
        overrideReason: input.override?.reason ?? null,
        createdAt: input.at,
      },
    });
  }

  async unitFree(
    branchId: string,
    physicalRoomId: string,
    roomTypeId: string,
    stay: StayRange,
    exceptReservationId: string,
  ) {
    const checkIn = new Date(stay.checkIn.value + "T00:00:00Z");
    const checkOut = new Date(stay.checkOut.value + "T00:00:00Z");
    const unit = await this.client.physicalRoom.findFirst({
      where: { id: physicalRoomId, branchId, roomTypeId, active: true },
      select: { id: true },
    });
    if (!unit) return false;
    const held = await this.client.reservationRoom.findFirst({
      where: {
        physicalRoomId,
        consumesInventory: true,
        reservationId: { not: exceptReservationId },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
      select: { id: true },
    });
    if (held) return false;
    const blocked = await this.client.inventoryBlock.findFirst({
      where: {
        physicalRoomId,
        cancelledAt: null,
        startDate: { lt: checkOut },
        endDate: { gt: checkIn },
      },
      select: { id: true },
    });
    return blocked === null;
  }

  async markCancelled(
    branchId: string,
    id: string,
    at: Date,
    flagPmsUpdate: boolean,
  ) {
    const previous = await this.client.reservation.findFirstOrThrow({
      where: { id, branchId },
      select: { pmsUpdatePendingSince: true },
    });
    await this.client.reservationRoom.updateMany({
      where: { reservationId: id, branchId },
      data: { consumesInventory: consumesInventory("CANCELLED") },
    });
    await this.client.reservation.update({
      where: { id },
      data: {
        status: "CANCELLED",
        statusChangedAt: at,
        updatedAt: at,
        version: { increment: 1 },
        ...(flagPmsUpdate
          ? {
              changeSeq: { increment: 1 },
              ...(previous.pmsUpdatePendingSince === null
                ? { pmsUpdatePendingSince: at }
                : {}),
            }
          : {}),
      },
    });
    const stored = await this.findById(branchId, id);
    if (!stored) throw new Error("Reservation aggregate was not persisted.");
    return stored;
  }

  async clearPmsUpdate(branchId: string, id: string, at: Date) {
    await this.client.reservation.update({
      where: { id },
      data: {
        pmsUpdatePendingSince: null,
        updatedAt: at,
        version: { increment: 1 },
      },
    });
    const stored = await this.findById(branchId, id);
    if (!stored) throw new Error("Reservation aggregate was not persisted.");
    return stored;
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
          externalChannel: input.externalChannel ?? null,
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
            data: snapshot.serviceLines.map((line) => {
              const { price, mutable, occupancyEffectiveFrom } =
                serviceData(line);
              return {
                reservationId: input.id,
                kind: serviceKind(line.kind),
                ...price,
                ...mutable,
                occupancyEffectiveFrom,
              };
            }),
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

function serviceData(line: StoredReservationSnapshot["serviceLines"][number]) {
  const effectiveFrom = line.occupancyEffectiveFrom?.value;
  return {
    price: {
      priceUnit: line.unit,
      priceMinor: line.priceMinor,
      childPriceMinor: line.childPriceMinor,
    },
    mutable: {
      adults: line.adults,
      children: line.children,
      nights: line.nights,
      adultQuantity: line.adultQuantity,
      childQuantity: line.childQuantity,
      amountMinor: line.amountMinor,
      vehicles: line.vehicles,
      details: line.details,
    },
    occupancyEffectiveFrom: effectiveFrom
      ? new Date(effectiveFrom + "T00:00:00Z")
      : null,
  };
}

// Quote service kinds are extensible strings. Persistence accepts the fixed domain list.
function serviceKind(value: string) {
  const kind = SERVICE_KINDS.find((candidate) => candidate === value);
  if (!kind) throw new Error("Unsupported reservation service kind.");
  return kind;
}
