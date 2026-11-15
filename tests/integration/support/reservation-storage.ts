import type { Client } from "pg";

import { TEST_BRANCH_ID } from "./database";

let sequence = 0;
export const storageId = () => `storage-${++sequence}`;

// SQL-only constraints must be tested through SQL as well as Prisma. Values
// are parameterized; table/column names below come only from test fixtures.
export async function insertStorage(
  db: Client,
  table: string,
  values: Record<string, unknown>,
) {
  const columns = Object.keys(values)
    .map((key) => `"${key}"`)
    .join(",");
  return db.query(
    `INSERT INTO "${table}" (${columns}) VALUES (${Object.keys(values)
      .map((_, i) => `$${i + 1}`)
      .join(",")}) RETURNING *`,
    Object.values(values),
  );
}

export function reservationData(overrides: Record<string, unknown> = {}) {
  const id = storageId();
  return {
    id,
    reference: id.toUpperCase(),
    branchId: TEST_BRANCH_ID,
    source: "STAFF",
    status: "CONFIRMED",
    checkIn: "2027-01-01",
    checkOut: "2027-01-03",
    guestName: "Fictional test guest",
    accommodationMinor: 100,
    servicesMinor: 0,
    subtotalMinor: 100,
    discountMinor: 0,
    taxableMinor: 100,
    vatRateBasisPoints: 1500,
    vatMinor: 15,
    totalMinor: 115,
    statusChangedAt: "2026-11-15T00:00:00Z",
    updatedAt: "2026-11-15T00:00:00Z",
    ...overrides,
  };
}

export function roomData(
  reservationId: string,
  roomTypeId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: storageId(),
    reservationId,
    branchId: TEST_BRANCH_ID,
    roomTypeId,
    checkIn: "2027-01-01",
    checkOut: "2027-01-03",
    adults: 2,
    consumesInventory: true,
    ...overrides,
  };
}
