import "server-only";

import type {
  CancellationRequestListItem,
  CancellationRequestReader,
  CancellationRequestRecord,
  CancellationRequestStore,
} from "@/application/reservations";
import { ACTIVE_CANCELLATION_REQUEST_STATUSES } from "@/domain/reservations";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const recordSelect = {
  id: true,
  reservationId: true,
  requestedBy: true,
  status: true,
  decisionReason: true,
  cancelReason: true,
  notifyGuest: true,
  decidedById: true,
  createdAt: true,
  reservation: { select: { branchId: true } },
} as const;

type RecordRow = {
  id: string;
  reservationId: string;
  requestedBy: "GUEST" | "STAFF";
  status: CancellationRequestRecord["status"];
  decisionReason: string | null;
  cancelReason: string | null;
  notifyGuest: boolean | null;
  decidedById: string | null;
  createdAt: Date;
  reservation: { branchId: string };
};

const toRecord = ({
  reservation,
  ...row
}: RecordRow): CancellationRequestRecord => ({
  ...row,
  branchId: reservation.branchId,
});

const requestView = {
  id: true,
  status: true,
  createdAt: true,
  decisionReason: true,
} as const;

export class PrismaCancellationRequestStore
  implements CancellationRequestStore
{
  constructor(private readonly client: DatabaseClient) {}

  async findCurrent(reservationId: string) {
    const requests = this.client.cancellationRequest;
    const query = {
      select: requestView,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    };
    const active = await requests.findFirst({
      ...query,
      where: {
        reservationId,
        requestedBy: "GUEST",
        status: { in: [...ACTIVE_CANCELLATION_REQUEST_STATUSES] },
      },
    });
    // Staff created requests are internal: the guest only sees their own.
    return (
      active ??
      requests.findFirst({
        ...query,
        where: { reservationId, requestedBy: "GUEST" },
      })
    );
  }

  create(input: Parameters<CancellationRequestStore["create"]>[0]) {
    return this.client.cancellationRequest.create({
      select: requestView,
      data: {
        id: input.id,
        reservationId: input.reservationId,
        guestReason: input.guestReason,
        createdAt: input.at,
        requestedBy: "GUEST",
        status: "OPEN",
      },
    });
  }

  async findById(id: string) {
    const row = await this.client.cancellationRequest.findUnique({
      where: { id },
      select: recordSelect,
    });
    return row ? toRecord(row) : null;
  }

  async findActive(reservationId: string) {
    const row = await this.client.cancellationRequest.findFirst({
      where: {
        reservationId,
        status: { in: [...ACTIVE_CANCELLATION_REQUEST_STATUSES] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: recordSelect,
    });
    return row ? toRecord(row) : null;
  }

  async findLegacyCancelReason(id: string) {
    const event = await this.client.auditEvent.findFirst({
      where: {
        entityType: "CancellationRequest",
        entityId: id,
        action: "cancellation-request.approved",
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { changes: true },
    });
    const changes = event?.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes))
      return null;
    return typeof changes.cancelReason === "string"
      ? changes.cancelReason
      : null;
  }

  async transition(
    input: Parameters<CancellationRequestStore["transition"]>[0],
  ) {
    const moved = await this.client.cancellationRequest.updateMany({
      where: { id: input.id, status: input.from },
      data: {
        status: input.to,
        updatedAt: input.at,
        ...(input.decidedById !== undefined
          ? { decidedById: input.decidedById, decidedAt: input.at }
          : {}),
        ...(input.decisionReason !== undefined
          ? { decisionReason: input.decisionReason }
          : {}),
      },
    });
    return moved.count === 1;
  }

  async createApproved(
    input: Parameters<CancellationRequestStore["createApproved"]>[0],
  ) {
    const row = await this.client.cancellationRequest.create({
      select: recordSelect,
      data: {
        id: input.id,
        reservationId: input.reservationId,
        requestedBy: "STAFF",
        status: "APPROVED",
        decidedById: input.staffId,
        decidedAt: input.at,
        cancelReason: input.cancelReason,
        notifyGuest: input.notifyGuest,
        decisionReason: input.legacyDecisionReason,
        createdAt: input.at,
      },
    });
    return toRecord(row);
  }

  async closeOpen(input: Parameters<CancellationRequestStore["closeOpen"]>[0]) {
    const [closed] = await this.client.cancellationRequest.updateManyAndReturn({
      where: { reservationId: input.reservationId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedReason: input.closedReason,
        decidedById: input.staffId,
        decidedAt: input.at,
      },
      select: { id: true },
    });
    return closed?.id ?? null;
  }
}

/** Pool reads for the staff queue (S17) and the unlocked lookup before a decision. */
export class PrismaCancellationRequestReader
  implements CancellationRequestReader
{
  constructor(private readonly client: DatabaseClient) {}

  async findById(id: string) {
    const row = await this.client.cancellationRequest.findUnique({
      where: { id },
      select: recordSelect,
    });
    return row ? toRecord(row) : null;
  }

  async list(
    scope: "ALL" | readonly string[],
    query: Parameters<CancellationRequestReader["list"]>[1],
  ) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(scope === "ALL"
        ? {}
        : { reservation: { branchId: { in: [...scope] } } }),
    };
    const [total, rows] = await Promise.all([
      this.client.cancellationRequest.count({ where }),
      this.client.cancellationRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          reservationId: true,
          requestedBy: true,
          status: true,
          guestReason: true,
          decisionReason: true,
          createdAt: true,
          reservation: {
            select: {
              branchId: true,
              reference: true,
              checkIn: true,
              paymentMethod: true,
              paymentStatus: true,
              totalMinor: true,
            },
          },
        },
      }),
    ]);
    const items: CancellationRequestListItem[] = rows.map(
      ({ reservation, createdAt, ...row }) => ({
        ...row,
        branchId: reservation.branchId,
        reference: reservation.reference,
        checkIn: reservation.checkIn.toISOString().slice(0, 10),
        paymentMethod: reservation.paymentMethod,
        paymentStatus: reservation.paymentStatus,
        totalMinor: reservation.totalMinor,
        createdAt: createdAt.toISOString(),
      }),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
