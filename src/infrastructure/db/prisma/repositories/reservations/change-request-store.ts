import "server-only";
import { z } from "zod";
import { serviceInputSchema } from "@/domain/services";

import type {
  ChangeRequestListItem,
  ChangeRequestReader,
  ChangeRequestRecord,
  ChangeRequestStore,
  RequestedGuestChange,
} from "@/application/reservations";
import type { Prisma } from "@/generated/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const guestSelect = {
  id: true,
  status: true,
  createdAt: true,
  decisionReason: true,
  closedReason: true,
  previewTotalMinor: true,
} as const;

type RecordRow = Prisma.ChangeRequestGetPayload<{
  select: typeof recordSelect;
}>;

const recordSelect = {
  ...guestSelect,
  reservationId: true,
  reservationVersion: true,
  oldTotalMinor: true,
  paidTotalMinor: true,
  requested: true,
  reservation: { select: { branchId: true } },
} as const;

const latest = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.ChangeRequestOrderByWithRelationInput[];

const unit = z.strictObject({
  roomTypeId: z.string().min(1),
  adults: z.number().int(),
  children: z.number().int(),
});
const summary = z.strictObject({
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  units: z.array(unit),
  services: z.array(
    z.strictObject({ kind: z.string(), vehicles: z.number().int().nullable() }),
  ),
  contactFieldsChanged: z.array(
    z.enum(["fullName", "email", "specialRequests"]),
  ),
});
const changePayload = z.strictObject({
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  lines: z.array(unit).min(1).max(5),
  services: z.array(serviceInputSchema).optional(),
  contact: z.strictObject({
    fullName: z.string().optional(),
    email: z.string().nullable().optional(),
    specialRequests: z.string().nullable().optional(),
  }),
});

function requestedChange(json: Prisma.JsonValue): RequestedGuestChange {
  const { contact, services, ...change } = changePayload.parse(json);
  const { fullName, email, specialRequests } = contact;
  return {
    ...change,
    ...(services === undefined ? {} : { services }),
    contact: {
      ...(fullName === undefined ? {} : { fullName }),
      ...(email === undefined ? {} : { email }),
      ...(specialRequests === undefined ? {} : { specialRequests }),
    },
  };
}

export class PrismaChangeRequestStore implements ChangeRequestStore {
  constructor(private readonly client: DatabaseClient) {}

  async findCurrent(reservationId: string) {
    const query = { select: guestSelect, orderBy: latest };
    return (
      (await this.client.changeRequest.findFirst({
        ...query,
        where: { reservationId, status: "OPEN" },
      })) ??
      this.client.changeRequest.findFirst({
        ...query,
        where: { reservationId },
      })
    );
  }

  async findById(id: string): Promise<ChangeRequestRecord | null> {
    const row: RecordRow | null = await this.client.changeRequest.findUnique({
      where: { id },
      select: recordSelect,
    });
    if (!row) return null;
    const { reservation, requested, ...record } = row;
    return { ...record, ...reservation, requested: requestedChange(requested) };
  }

  create(input: Parameters<ChangeRequestStore["create"]>[0]) {
    const { at, ...data } = input;
    return this.client.changeRequest.create({
      select: guestSelect,
      data: { ...data, createdAt: at, updatedAt: at },
    });
  }

  async recordConflict(id: string, code: string, at: Date) {
    await this.client.changeRequest.update({
      where: { id, status: "OPEN" },
      data: { lastConflict: code, updatedAt: at },
    });
  }

  decide(input: Parameters<ChangeRequestStore["decide"]>[0]) {
    return this.client.changeRequest.update({
      where: { id: input.id, status: "OPEN" },
      select: guestSelect,
      data: {
        status: input.status,
        decidedById: input.staffId,
        decidedAt: input.at,
        updatedAt: input.at,
        decisionReason: input.status === "REJECTED" ? input.reason : null,
        lastConflict: null,
      },
    });
  }

  async closeOpen(input: Parameters<ChangeRequestStore["closeOpen"]>[0]) {
    const [row] = await this.client.changeRequest.updateManyAndReturn({
      where: { reservationId: input.reservationId, status: "OPEN" },
      data: {
        status: "CLOSED",
        decidedById: input.staffId,
        decidedAt: input.at,
        updatedAt: input.at,
        closedReason: input.closedReason,
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

function scoped(scope: Parameters<ChangeRequestReader["list"]>[0]) {
  return scope === "ALL"
    ? {}
    : { reservation: { branchId: { in: [...scope] } } };
}

const day = (date: Date) => date.toISOString().slice(0, 10);

export class PrismaChangeRequestReader implements ChangeRequestReader {
  constructor(private readonly client: DatabaseClient) {}

  async locate(
    id: string,
    scope: Parameters<ChangeRequestReader["locate"]>[1],
  ) {
    const row = await this.client.changeRequest.findFirst({
      where: { id, ...scoped(scope) },
      select: {
        id: true,
        reservationId: true,
        requested: true,
        reservation: { select: { branchId: true } },
      },
    });
    return (
      row && {
        id: row.id,
        reservationId: row.reservationId,
        branchId: row.reservation.branchId,
        requestedListingIds: requestedChange(row.requested).lines.map(
          (line) => line.roomTypeId,
        ),
      }
    );
  }

  async list(
    scope: Parameters<ChangeRequestReader["list"]>[0],
    query: Parameters<ChangeRequestReader["list"]>[1],
  ) {
    const where = {
      ...scoped(scope),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.client.changeRequest.count({ where }),
      this.client.changeRequest.findMany({
        where,
        orderBy: latest,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          ...guestSelect,
          reservationId: true,
          oldTotalMinor: true,
          paidTotalMinor: true,
          requestedSummary: true,
          lastConflict: true,
          reservation: {
            select: {
              branchId: true,
              reference: true,
              checkIn: true,
              checkOut: true,
              paymentStatus: true,
              totalMinor: true,
              rooms: {
                select: { roomTypeId: true, adults: true, children: true },
                orderBy: { id: "asc" },
              },
              services: {
                select: { kind: true, vehicles: true },
                orderBy: { kind: "asc" },
              },
            },
          },
        },
      }),
    ]);
    const items: ChangeRequestListItem[] = rows.map(
      ({ reservation, requestedSummary, createdAt, ...row }) => ({
        ...row,
        createdAt: createdAt.toISOString(),
        branchId: reservation.branchId,
        reference: reservation.reference,
        current: {
          checkIn: day(reservation.checkIn),
          checkOut: day(reservation.checkOut),
          units: reservation.rooms,
          services: reservation.services,
          contactFieldsChanged: [],
        },
        requested: summary.parse(requestedSummary),
        currentTotalMinor: reservation.totalMinor,
        paymentStatus: reservation.paymentStatus,
      }),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
