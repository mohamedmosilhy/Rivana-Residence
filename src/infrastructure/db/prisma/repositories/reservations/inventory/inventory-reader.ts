import "server-only";

import type {
  InventoryNightRecord,
  InventoryReader,
  ReservationConsumptionReader,
} from "@/application/inventory";
import { failure, success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Prisma } from "@/generated/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

type CapacityRow = Readonly<{
  roomTypeId: string;
  night: string;
  capacity: number;
  blocked: number;
}>;

function uniqueSorted<T>(values: readonly T[], key: (value: T) => string) {
  return [...new Map(values.map((value) => [key(value), value])).values()].sort(
    (left, right) => key(left).localeCompare(key(right)),
  );
}

function checkedCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label} inventory count returned by PostgreSQL.`);
  }
  return value;
}

export class PrismaInventoryReader implements InventoryReader {
  constructor(
    private readonly client: DatabaseClient,
    private readonly consumption: ReservationConsumptionReader,
  ) {}

  async readNights(input: {
    branchId: string;
    roomTypeIds: readonly string[];
    nights: readonly LocalDate[];
  }) {
    const roomTypeIds = [...new Set(input.roomTypeIds)].sort();
    const nights = uniqueSorted(input.nights, (night) => night.value);
    if (roomTypeIds.length === 0 || nights.length === 0) return success([]);

    const rows = await this.client.$queryRaw<CapacityRow[]>(
      Prisma.sql`
        WITH requested_room("roomTypeId") AS (
          VALUES ${Prisma.join(roomTypeIds.map((id) => Prisma.sql`(${id})`))}
        ),
        requested_night(night) AS (
          VALUES ${Prisma.join(
            nights.map((night) => Prisma.sql`(${night.value}::date)`),
          )}
        )
        SELECT room.id AS "roomTypeId",
               to_char(requested_night.night, 'YYYY-MM-DD') AS night,
               count(unit.id) FILTER (
                 WHERE unit.id IS NOT NULL AND NOT EXISTS (
                   SELECT 1
                   FROM "InventoryBlock" block
                   WHERE block."physicalRoomId" = unit.id
                     AND block."cancelledAt" IS NULL
                     AND block."startDate" <= requested_night.night
                     AND block."endDate" > requested_night.night
                 )
               )::int AS capacity,
               count(unit.id) FILTER (
                 WHERE unit.id IS NOT NULL AND EXISTS (
                   SELECT 1
                   FROM "InventoryBlock" block
                   WHERE block."physicalRoomId" = unit.id
                     AND block."cancelledAt" IS NULL
                     AND block."startDate" <= requested_night.night
                     AND block."endDate" > requested_night.night
                 )
               )::int AS blocked
        FROM requested_room
        JOIN "Room" room
          ON room.id = requested_room."roomTypeId"
         AND room."branchId" = ${input.branchId}
        CROSS JOIN requested_night
        LEFT JOIN "PhysicalRoom" unit
          ON unit."roomTypeId" = room.id
         AND unit."branchId" = room."branchId"
         AND unit.active
        GROUP BY room.id, requested_night.night
        ORDER BY room.id, requested_night.night
      `,
    );

    const foundIds = new Set(rows.map((row) => row.roomTypeId));
    if (roomTypeIds.some((id) => !foundIds.has(id))) {
      return failure("NOT_FOUND", "The requested listing was not found.");
    }

    const soldRows = await this.consumption.readSoldOnDates({
      branchId: input.branchId,
      roomTypeIds,
      nights,
    });
    const expectedNights = new Set(nights.map((night) => night.value));
    const sold = new Map<string, number>();
    for (const row of soldRows) {
      if (
        !foundIds.has(row.roomTypeId) ||
        !expectedNights.has(row.night.value) ||
        !Number.isSafeInteger(row.sold) ||
        row.sold <= 0
      ) {
        throw new Error("Reservation consumption returned an invalid row.");
      }
      const key = `${row.roomTypeId}\u0000${row.night.value}`;
      if (sold.has(key)) {
        throw new Error("Reservation consumption returned a duplicate row.");
      }
      sold.set(key, row.sold);
    }

    return success(
      rows.map((row): InventoryNightRecord => {
        const night = LocalDate.parse(row.night);
        return Object.freeze({
          roomTypeId: row.roomTypeId,
          night,
          capacity: checkedCount(row.capacity, "capacity"),
          blocked: checkedCount(row.blocked, "blocked"),
          sold: checkedCount(
            sold.get(`${row.roomTypeId}\u0000${night.value}`) ?? 0,
            "sold",
          ),
        });
      }),
    );
  }
}
