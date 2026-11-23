import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  insertStorage,
  reservationData,
  storageId,
} from "../support/reservation-storage";
import { testDatabaseUrl } from "../support/test-database";
import { waitForDatabaseLock } from "./support/concurrency";

const postgres = () => new Client({ connectionString: testDatabaseUrl().url });
const observer = createTestClient();
const db = postgres();
const clock = "2026-11-23T00:00:00Z";

beforeAll(() => db.connect());
beforeEach(() => resetDatabase(observer));
afterAll(async () => {
  await Promise.all([db.end(), observer.$disconnect()]);
});

async function reservation(overrides: Record<string, unknown> = {}) {
  const row = reservationData(overrides);
  await insertStorage(db, "Reservation", row);
  return row.id;
}

const payment = (
  reservationId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: storageId(),
  reservationId,
  provider: "fake",
  amountMinor: 115,
  currency: "USD",
  expiresAt: clock,
  updatedAt: clock,
  ...overrides,
});
const request = (
  reservationId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: storageId(),
  reservationId,
  requestedBy: "GUEST",
  updatedAt: clock,
  ...overrides,
});

it("AC-14 defaults a new branch to online payments off", async () => {
  expect(
    await observer.branch.findUnique({ where: { id: TEST_BRANCH_ID } }),
  ).toMatchObject({ onlinePaymentEnabled: false });
});

it("checks positive USD payments and protects transaction IDs and reservation history", async () => {
  const id = await reservation();
  for (const invalid of [
    { amountMinor: 0 },
    { amountMinor: -1 },
    { currency: "EUR" },
  ]) {
    await expect(
      insertStorage(db, "Payment", payment(id, invalid)),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "Payment_positive_usd_check",
    });
  }
  await expect(
    insertStorage(db, "Payment", payment("missing")),
  ).rejects.toMatchObject({ code: "23503" });
  const first = payment(id, { providerTransactionId: "unique-transaction" });
  await insertStorage(db, "Payment", first);
  expect(
    await observer.payment.findUnique({ where: { id: first.id } }),
  ).toMatchObject({
    status: "INITIATED",
    refundAttempt: 0,
    checkoutUrl: null,
    refundRequestedAt: null,
  });
  await expect(
    insertStorage(
      db,
      "Payment",
      payment(id, {
        status: "FAILED",
        providerTransactionId: "unique-transaction",
      }),
    ),
  ).rejects.toMatchObject({
    code: "23505",
    constraint: "Payment_providerTransactionId_key",
  });
  await expect(
    db.query('DELETE FROM "Reservation" WHERE id = $1', [id]),
  ).rejects.toMatchObject({ constraint: "Payment_reservationId_fkey" });
  await db.query("UPDATE \"Payment\" SET status = 'EXPIRED' WHERE id = $1", [
    first.id,
  ]);
  await insertStorage(db, "Payment", payment(id));
});

it("stores normalized unknown and known events with unique provider event IDs", async () => {
  const event = {
    id: storageId(),
    providerEventId: "event-1",
    kind: "TRANSACTION",
    outcome: "SUCCEEDED",
    result: "IGNORED_UNKNOWN",
    amountMinor: 999,
    currency: "EUR",
  };
  await insertStorage(db, "PaymentEvent", event);
  expect(
    await observer.paymentEvent.findUnique({ where: { id: event.id } }),
  ).toMatchObject({
    paymentId: null,
    result: "IGNORED_UNKNOWN",
    currency: "EUR",
  });
  const first = payment(await reservation());
  await insertStorage(db, "Payment", first);
  await expect(
    insertStorage(db, "PaymentEvent", {
      ...event,
      id: storageId(),
      paymentId: first.id,
    }),
  ).rejects.toMatchObject({
    code: "23505",
    constraint: "PaymentEvent_providerEventId_key",
  });
  await insertStorage(db, "PaymentEvent", {
    ...event,
    id: storageId(),
    providerEventId: "event-2",
    paymentId: first.id,
    result: "IGNORED_MISMATCH",
  });
  await expect(
    db.query('DELETE FROM "Payment" WHERE id = $1', [first.id]),
  ).rejects.toMatchObject({ constraint: "PaymentEvent_paymentId_fkey" });
});

it("AC-6 and AC-15 preserve a closed request and allow a new open request afterwards", async () => {
  await createActor(observer);
  const id = await reservation();
  await expect(
    insertStorage(
      db,
      "CancellationRequest",
      request(id, { closedReason: "CHECKED_IN" }),
    ),
  ).rejects.toMatchObject({
    code: "23514",
    constraint: "CancellationRequest_closed_reason_check",
  });
  const first = request(id);
  await insertStorage(db, "CancellationRequest", first);
  await observer.cancellationRequest.update({
    where: { id: first.id },
    data: {
      status: "CLOSED",
      closedReason: "CHECKED_IN",
      decidedById: "actor-admin",
      decidedAt: new Date(clock),
    },
  });
  await insertStorage(db, "CancellationRequest", request(id));
  expect(
    await observer.cancellationRequest.findUnique({ where: { id: first.id } }),
  ).toMatchObject({
    status: "CLOSED",
    closedReason: "CHECKED_IN",
    decidedById: "actor-admin",
    decidedAt: new Date(clock),
  });
  await expect(
    db.query('DELETE FROM "Reservation" WHERE id = $1', [id]),
  ).rejects.toMatchObject({
    constraint: "CancellationRequest_reservationId_fkey",
  });
});

it.each([
  { table: "Payment", fixture: payment, constraint: "Payment_one_initiated" },
  {
    table: "CancellationRequest",
    fixture: request,
    constraint: "CancellationRequest_one_open",
  },
])(
  "$constraint allows one winner under competing inserts, 20 observed races",
  async ({ table, fixture, constraint }) => {
    const contender = postgres();
    await contender.connect();
    try {
      const {
        rows: [backend],
      } = await contender.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      if (!backend) throw new Error("The contender has no backend PID.");
      for (let round = 0; round < 20; round++) {
        const id = await reservation();
        const first = fixture(id);
        await db.query("BEGIN");
        let competing: Promise<unknown> | undefined;
        try {
          await insertStorage(db, table, first);
          competing = insertStorage(contender, table, fixture(id)).catch(
            (error: unknown) => error,
          );
          await waitForDatabaseLock(observer, backend.pid);
        } finally {
          await db.query("COMMIT");
          if (competing) await competing;
        }
        expect(await competing).toMatchObject({ code: "23505", constraint });
        const rows = await db.query(
          `SELECT id FROM "${table}" WHERE "reservationId" = $1`,
          [id],
        );
        expect(rows.rows).toEqual([{ id: first.id }]);
      }
    } finally {
      await contender.end();
    }
  },
);
