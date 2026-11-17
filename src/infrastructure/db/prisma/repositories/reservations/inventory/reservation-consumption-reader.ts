import "server-only";

import type {
  AssignmentWindow,
  ReservationConsumptionReader,
  SoldNightContribution,
} from "@/application/inventory";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import { Prisma } from "@/generated/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

type SoldRow = Readonly<{ roomTypeId: string; night: string; sold: number }>;
function mapSold(rows: readonly SoldRow[]): readonly SoldNightContribution[] {
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.sold) || row.sold <= 0)
      throw new Error("Invalid persisted sold inventory count.");
    return {
      roomTypeId: row.roomTypeId,
      night: LocalDate.parse(row.night),
      sold: row.sold,
    };
  });
}

/** Operational room stays, never financial night snapshots, determine occupancy. */
export class PrismaReservationConsumptionReader
  implements ReservationConsumptionReader
{
  constructor(private readonly client: DatabaseClient) {}

  async readSoldOnDates(
    input: Parameters<ReservationConsumptionReader["readSoldOnDates"]>[0],
  ) {
    const ids = [...new Set(input.roomTypeIds)].sort();
    const nights = [
      ...new Set(input.nights.map((night) => night.value)),
    ].sort();
    if (!ids.length || !nights.length) return [];
    const rows = await this.client.$queryRaw<SoldRow[]>(Prisma.sql`
      WITH requested(night) AS (VALUES ${Prisma.join(nights.map((night) => Prisma.sql`(${night}::date)`))})
      SELECT line."roomTypeId", to_char(requested.night, 'YYYY-MM-DD') AS night, count(*)::int AS sold
      FROM "ReservationRoom" line JOIN requested
        ON line."checkIn" <= requested.night AND line."checkOut" > requested.night
      WHERE line."branchId" = ${input.branchId} AND line."consumesInventory"
        AND line."roomTypeId" IN (${Prisma.join(ids)})
      GROUP BY line."roomTypeId", requested.night ORDER BY line."roomTypeId", requested.night
    `);
    return mapSold(rows);
  }

  async readFutureSold(
    input: Parameters<ReservationConsumptionReader["readFutureSold"]>[0],
  ) {
    // Expand occupied ranges only. Long empty gaps and the public horizon play no part.
    const rows = await this.client.$queryRaw<SoldRow[]>(Prisma.sql`
      SELECT line."roomTypeId", to_char(occupied.night, 'YYYY-MM-DD') AS night, count(*)::int AS sold
      FROM "ReservationRoom" line
      CROSS JOIN LATERAL generate_series(
        greatest(line."checkIn", ${input.from.value}::date)::timestamp,
        (line."checkOut" - 1)::timestamp, interval '1 day'
      ) AS occupied(night)
      WHERE line."branchId" = ${input.branchId} AND line."roomTypeId" = ${input.roomTypeId}
        AND line."consumesInventory" AND line."checkOut" > ${input.from.value}::date
      GROUP BY line."roomTypeId", occupied.night ORDER BY line."roomTypeId", occupied.night
    `);
    return mapSold(rows);
  }

  async readAssignments(input: {
    branchId: string;
    physicalRoomId: string;
    window: AssignmentWindow;
  }) {
    const window =
      input.window.kind === "FROM"
        ? { checkOut: { gt: new Date(input.window.from.value + "T00:00:00Z") } }
        : {
            checkIn: {
              lt: new Date(input.window.range.checkOut.value + "T00:00:00Z"),
            },
            checkOut: {
              gt: new Date(input.window.range.checkIn.value + "T00:00:00Z"),
            },
          };
    const rows = await this.client.reservationRoom.findMany({
      where: {
        branchId: input.branchId,
        physicalRoomId: input.physicalRoomId,
        consumesInventory: true,
        ...window,
      },
      select: { checkIn: true, checkOut: true },
      orderBy: [{ checkIn: "asc" }, { checkOut: "asc" }, { id: "asc" }],
    });
    return rows.map((row) =>
      StayRange.create(
        LocalDate.parse(row.checkIn.toISOString().slice(0, 10)),
        LocalDate.parse(row.checkOut.toISOString().slice(0, 10)),
      ),
    );
  }
}
