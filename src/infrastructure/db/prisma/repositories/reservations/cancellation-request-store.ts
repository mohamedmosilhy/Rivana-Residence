import "server-only";

import type { CancellationRequestStore } from "@/application/reservations";
import { ACTIVE_CANCELLATION_REQUEST_STATUSES } from "@/domain/reservations";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

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
        status: { in: [...ACTIVE_CANCELLATION_REQUEST_STATUSES] },
      },
    });
    return active ?? requests.findFirst({ ...query, where: { reservationId } });
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
