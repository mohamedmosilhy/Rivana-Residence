import { spawnSync } from "node:child_process";
import { testDatabaseUrl } from "../support/test-database";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  DispatchOutbox,
  QueueReservationMessages,
  type ClaimedMessage,
  type WhatsAppSendResult,
} from "@/application/notifications";
import {
  expireReservationTokens,
  PrismaOutboxWorkerStore,
  PrismaReservationMessageStore,
} from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import type { Prisma } from "@/generated/prisma/client";
import { FAKE_EMAIL_REJECTED_ADDRESS } from "@/infrastructure/email/fake-reservation-email";
import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { withIndependentClients } from "./support/concurrency";

const db = createTestClient();
const store = new PrismaOutboxWorkerStore(db);
const at = new Date("2030-01-01T00:00:00Z");
const phone = "+12025550101";
const email = "guest@example.test";
const token = "sensitive-manage-token";
const clock = { now: () => at };
let seq = 0;
const ids = { next: () => `outbox-${++seq}` };
const writer = (tx: Prisma.TransactionClient) =>
  new QueueReservationMessages(
    new PrismaReservationMessageStore(tx),
    ids,
    clock,
    "https://hotel.example",
  );
const confirmation = {
  kind: "reservation.confirmed",
  notifyGuest: false,
  manageToken: token,
} as const;
const variables = {
  reference: "RR-00000001",
  branchName: "Hotel",
  manageLink: `https://hotel.example/reservations/manage#t=${token}`,
};
beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());

async function booking(
  tx: Prisma.TransactionClient,
  id: string,
  website = false,
) {
  if (website)
    await tx.guest.create({ data: { id, phone, name: "Example Guest" } });
  return tx.reservation.create({
    data: {
      id,
      reference: id,
      branchId: TEST_BRANCH_ID,
      source: website ? "WEBSITE" : "STAFF",
      status: "CONFIRMED",
      guestId: website ? id : null,
      guestName: "Example Guest",
      guestEmail: email,
      guestPhone: phone,
      statusChangedAt: at,
      checkIn: at,
      checkOut: new Date("2030-01-02"),
      accommodationMinor: 10000,
      subtotalMinor: 10000,
      taxableMinor: 10000,
      vatRateBasisPoints: 1500,
      vatMinor: 1500,
      totalMinor: 11500,
    },
  });
}

it("AC-4, T-NTF-1: independent worker sees the website event only after commit; rollback removes booking and messages", async () => {
  await db.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { email: "branch@example.test" },
  });
  const write = async (tx: Prisma.TransactionClient) => {
    await booking(tx, "RR-00000001", true);
    await expect(
      writer(tx).enqueue(TEST_BRANCH_ID, "RR-00000001", {
        kind: "reservation.confirmed",
        notifyGuest: true,
      }),
    ).rejects.toThrow("manage token");
    await writer(tx).enqueue(TEST_BRANCH_ID, "RR-00000001", confirmation);
    expect(await tx.notificationOutbox.count()).toBe(3);
    expect(await store.claim(at)).toBeNull();
  };
  await expect(
    db.$transaction(async (tx) => {
      await write(tx);
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await db.reservation.count()).toBe(0);
  expect(await db.notificationOutbox.count()).toBe(0);
  await db.$transaction(write);
  const rows = await db.notificationOutbox.findMany({ orderBy: { id: "asc" } });
  expect(rows.map((row) => [row.channel, row.kind, row.recipient])).toEqual([
    ["EMAIL", "reservation.confirmed", email],
    ["WHATSAPP", "reservation.confirmed", phone],
    ["EMAIL", "reservation.staff-alert", "branch@example.test"],
  ]);
  expect(rows[0]?.payload).toMatchObject({
    ...variables,
    branchName: "Rivana Residence",
    guestFirstName: "Example",
    total: "USD 115.00",
  });
  expect(rows[2]?.payload).toEqual({
    reference: variables.reference,
    branchName: "Rivana Residence",
  });
  const send = vi.fn(async () => ({
    ok: true as const,
    providerMessageId: "provider-id",
  }));
  const result = await new DispatchOutbox(
    store,
    { send },
    { send },
    clock,
  ).run();
  expect(result.sent).toBe(3);
  expect(send).toHaveBeenCalledTimes(3);
  expect(
    await db.notificationOutbox.count({
      where: { status: "SENT", sentAt: at },
    }),
  ).toBe(3);
  expect(JSON.stringify(await db.notificationOutbox.findMany())).not.toContain(
    token,
  );
});

it("honours staff send choice, branch scope and persisted event state", async () => {
  await db.$transaction(async (tx) => {
    const row = await booking(tx, "staff");
    const queue = writer(tx);
    await queue.enqueue(TEST_BRANCH_ID, row.id, confirmation);
    expect(await tx.notificationOutbox.count()).toBe(0);
    await queue.enqueue(TEST_BRANCH_ID, row.id, {
      ...confirmation,
      notifyGuest: true,
    });
    expect(await tx.notificationOutbox.count()).toBe(2);
    await tx.reservation.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
    });
    await queue.enqueue(TEST_BRANCH_ID, row.id, {
      ...confirmation,
      notifyGuest: true,
    });
    await queue.enqueue(TEST_BRANCH_ID, row.id, {
      kind: "reservation.cancelled",
      notifyGuest: false,
      reason: "closed",
    });
    expect(await tx.notificationOutbox.count()).toBe(2);
    await queue.enqueue(TEST_BRANCH_ID, row.id, {
      kind: "reservation.cancelled",
      notifyGuest: true,
      reason: "closed",
    });
    await queue.enqueue(TEST_BRANCH_ID, row.id, {
      kind: "reservation.manage-link",
      manageToken: token,
    });
    expect(await tx.notificationOutbox.count()).toBe(6);
  });
  await expect(
    db.$transaction((tx) => writer(tx).enqueue("other", "staff", confirmation)),
  ).rejects.toThrow();
  expect(await db.notificationOutbox.count()).toBe(6);
});

function pending(id: string) {
  return db.notificationOutbox.create({
    data: {
      id,
      channel: "WHATSAPP",
      kind: "reservation.manage-link",
      recipient: phone,
      payload: variables,
      availableAt: at,
    },
  });
}
it("T-NTF-2/3: retries at each due boundary, caps attempts and scrubs on final failure", async () => {
  await pending("retry");
  let now = at;
  const error: WhatsAppSendResult = {
    ok: false,
    code: "RATE_LIMITED",
    detail: `${phone} ${token}`,
    providerCode: 130429,
  };
  const send = vi.fn(async () => error);
  const dispatch = new DispatchOutbox(
    store,
    { send },
    { send },
    { now: () => now },
  );
  for (const delay of [1, 5, 15, 60, 240]) {
    expect((await dispatch.run()).retried).toBe(1);
    const expected = new Date(now.getTime() + delay * 60_000);
    expect(
      await db.notificationOutbox.findUniqueOrThrow({ where: { id: "retry" } }),
    ).toMatchObject({
      status: "PENDING",
      lastError: "RATE_LIMITED 130429",
      availableAt: expected,
      payload: variables,
    });
    now = new Date(expected.getTime() - 1);
    expect((await dispatch.run()).retried).toBe(0);
    now = expected;
  }
  expect((await dispatch.run()).failed).toBe(1);
  expect(send).toHaveBeenCalledTimes(6);
  expect(await db.notificationOutbox.findFirstOrThrow()).toMatchObject({
    status: "FAILED",
    attempts: 6,
    payload: {},
    lastError: "RATE_LIMITED 130429",
  });
});

it.each(["PROVIDER_REJECTED", "NOT_CONFIGURED", "TEMPLATE_MISSING"] as const)(
  "permanent %s scrubs immediately and discards provider text",
  async (code) => {
    await pending("permanent");
    const send = vi.fn(async () => ({
      ok: false as const,
      code,
      detail: `${phone} ${token} ${email}`,
    }));
    const result = await new DispatchOutbox(
      store,
      { send },
      { send },
      clock,
    ).run();
    expect(result.failed).toBe(1);
    expect(await db.notificationOutbox.findFirstOrThrow()).toMatchObject({
      attempts: 1,
      lastError: code,
      status: "FAILED",
      payload: {},
    });
  },
);

it("T-NTF-1: 20 held locks are skipped; reclaimed attempts fence stale completions across workers", async () => {
  await withIndependentClients(2, async ([first, second]) => {
    const worker = new PrismaOutboxWorkerStore(second!);
    for (let i = 0; i < 20; i++) {
      const id = `race-${i}`;
      await pending(id);
      const nextId = `unlocked-${i}`;
      await pending(nextId);
      await first!.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "NotificationOutbox" WHERE id=${id} FOR UPDATE`;
        const other = (await worker.claim(at)) as ClaimedMessage;
        expect(other.id).toBe(nextId);
        expect(
          await worker.complete(other, { status: "SENT", sentAt: at }),
        ).toBe(true);
        expect(await worker.claim(at)).toBeNull();
      });
      const original = (await worker.claim(at)) as ClaimedMessage;
      expect(original.attempts).toBe(1);
      expect(await store.claim(at)).toBeNull();
      const reclaimed = (await store.claim(
        new Date(at.getTime() + 120_000),
      )) as ClaimedMessage;
      expect(reclaimed.attempts).toBe(2);
      expect(
        await worker.complete(original, {
          status: "FAILED",
          lastError: "UNAVAILABLE",
        }),
      ).toBe(false);
      expect(
        await store.complete(reclaimed, { status: "SENT", sentAt: at }),
      ).toBe(true);
      expect(
        await db.notificationOutbox.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ status: "SENT", attempts: 2, payload: {} });
    }
  });
});

it("a crash on the last lease is terminal without a seventh send", async () => {
  await pending("crashed");
  await db.notificationOutbox.update({
    where: { id: "crashed" },
    data: { attempts: 5 },
  });
  expect(await store.claim(at)).toMatchObject({ attempts: 6 });
  const send = vi.fn();
  const result = await new DispatchOutbox(
    store,
    { send },
    { send },
    { now: () => new Date(at.getTime() + 120_000) },
  ).run();
  expect(result.failed).toBe(1);
  expect(send).not.toHaveBeenCalled();
  expect(await db.notificationOutbox.findFirstOrThrow()).toMatchObject({
    status: "FAILED",
    lastError: "DELIVERY_UNCONFIRMED",
    payload: {},
    attempts: 6,
  });
});

it("expires consumed or expired hashes only, retains admission history and is repeatable", async () => {
  const later = new Date(at.getTime() + 1);
  for (const [id, expiry, consumed] of [
    ["expired", at, null],
    ["used", later, at],
    ["live", later, null],
  ] as const) {
    await db.phoneVerification.create({
      data: {
        id,
        phone,
        purpose: "BOOKING",
        codeHash: "code-hash",
        clientKey: "client",
        expiresAt: at,
        tokenHash: id,
        tokenExpiresAt: expiry,
        consumedAt: consumed,
      },
    });
  }
  for (const [id, expiry] of [
    ["expired", at],
    ["live", later],
  ] as const) {
    await booking(db, id);
    await db.reservation.update({
      where: { id },
      data: { manageTokenHash: id, manageTokenExpiresAt: expiry },
    });
  }
  const original = await db.reservation.findUniqueOrThrow({
    where: { id: "expired" },
  });
  expect(await expireReservationTokens(db, at)).toEqual({
    verification: 2,
    manage: 1,
  });
  expect(await expireReservationTokens(db, at)).toEqual({
    verification: 0,
    manage: 0,
  });
  expect(await db.phoneVerification.count()).toBe(3);
  expect(
    await db.phoneVerification.findMany({
      where: { tokenHash: { not: null } },
      select: { id: true },
    }),
  ).toEqual([{ id: "live" }]);
  expect(
    await db.reservation.findUniqueOrThrow({ where: { id: "expired" } }),
  ).toEqual({ ...original, manageTokenHash: null });
  expect(
    await db.reservation.findUniqueOrThrow({ where: { id: "live" } }),
  ).toMatchObject({ manageTokenHash: "live" });
});

it("AC-9/10: the CLI dispatches through both fakes and exposes only counts", async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    WHATSAPP_PROVIDER: "fake",
    EMAIL_PROVIDER: "fake",
    CONTACT_DELIVERY: "none",
    DATABASE_URL: testDatabaseUrl().url,
    DIRECT_DATABASE_URL: testDatabaseUrl().url,
  };
  await db.whatsAppSettings.update({
    where: { id: "default" },
    data: { businessPhoneNumber: phone, providerPhoneNumberId: "123456" },
  });
  await db.whatsAppTemplate.create({
    data: {
      id: "template",
      purpose: "MANAGE_LINK",
      language: "en",
      providerName: "demo_link",
      category: "UTILITY",
      variables: ["manageLink"],
      previewText: "Manage",
    },
  });
  for (const [id, recipient] of [
    ["ok", phone],
    ["refused", "+12025550199"],
  ] as const) {
    await pending(id);
    await db.notificationOutbox.update({
      where: { id },
      data: { recipient, availableAt: new Date(0) },
    });
  }
  await db.notificationOutbox.createMany({
    data: [
      { id: "email-ok", recipient: email },
      { id: "email-refused", recipient: FAKE_EMAIL_REJECTED_ADDRESS },
    ].map((message) => ({
      ...message,
      channel: "EMAIL" as const,
      kind: "reservation.manage-link",
      payload: variables,
      availableAt: new Date(0),
    })),
  });
  await pending("held");
  await db.notificationOutbox.update({
    where: { id: "held" },
    data: { status: "HELD", availableAt: new Date(0) },
  });
  const run = (command: string) => {
    const { stdout, stderr, status } = spawnSync(
      "npm",
      ["run", "--silent", "reservations", "--", command],
      { env, encoding: "utf8" },
    );
    expect(status).toBe(0);
    expect(stderr).toBe("");
    return JSON.parse(stdout);
  };
  expect(run("outbox")).toEqual({ sent: 2, failed: 2, stale: 0, retried: 0 });
  for (const id of ["refused", "email-refused"])
    expect(
      await db.notificationOutbox.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      status: "FAILED",
      lastError: "PROVIDER_REJECTED",
      payload: {},
    });
  for (const id of ["ok", "email-ok"])
    expect(
      await db.notificationOutbox.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ status: "SENT", payload: {} });
  expect(
    await db.notificationOutbox.findUniqueOrThrow({ where: { id: "held" } }),
  ).toMatchObject({
    status: "HELD",
    attempts: 0,
    sentAt: null,
    payload: variables,
  });
  await db.phoneVerification.create({
    data: {
      id: "expired",
      phone,
      purpose: "GUEST_SESSION",
      codeHash: "hash",
      clientKey: "client",
      expiresAt: at,
      tokenHash: "expired",
      tokenExpiresAt: new Date(0),
    },
  });
  expect(run("expire-tokens")).toEqual({ verification: 1, manage: 0 });
  expect(run("expire-tokens")).toEqual({ verification: 0, manage: 0 });
}, 30000);

it("M8-T9: dispatches the modified and cancelled kinds to the right email kind and WhatsApp purpose with their variables", async () => {
  const stayVariables = {
    reference: "RR-00000001",
    branchName: "Hotel",
    guestFirstName: "Example",
    checkIn: "2030-01-01",
    checkOut: "2030-01-03",
  };
  const rows = [
    [
      "m-mail",
      "EMAIL",
      "reservation.modified",
      email,
      { ...stayVariables, total: "USD 100.00" },
    ],
    [
      "m-chat",
      "WHATSAPP",
      "reservation.modified",
      phone,
      { ...stayVariables, total: "USD 100.00" },
    ],
    [
      "c-mail",
      "EMAIL",
      "reservation.cancelled",
      email,
      { ...stayVariables, reason: "Cancelled by the hotel" },
    ],
    [
      "c-chat",
      "WHATSAPP",
      "reservation.cancelled",
      phone,
      { ...stayVariables, reason: "Cancelled by the hotel" },
    ],
  ] as const;
  for (const [id, channel, kind, recipient, payload] of rows)
    await db.notificationOutbox.create({
      data: { id, channel, kind, recipient, payload, availableAt: at },
    });
  const chat = vi.fn(async () => ({
    ok: true as const,
    providerMessageId: "p",
  }));
  const mail = vi.fn(async () => ({ ok: true as const }));
  const result = await new DispatchOutbox(
    store,
    { send: mail },
    { send: chat },
    clock,
  ).run();
  expect(result).toMatchObject({ sent: 4, failed: 0 });
  const calls = mail.mock.calls as unknown as unknown[][];
  expect(calls.map((call) => [call[1], call[2]]).sort()).toEqual([
    [email, "reservation.cancelled"],
    [email, "reservation.modified"],
  ]);
  const sent = (
    chat.mock.calls as unknown as {
      purpose: string;
      to: { value: string };
      variables: unknown;
    }[][]
  ).map(([message]) => message!);
  expect(sent.map((message) => message.purpose).sort()).toEqual([
    "CANCELLED_BY_HOTEL",
    "RESERVATION_MODIFIED",
  ]);
  expect(sent.every((message) => message.to.value === phone)).toBe(true);
  const modified = sent.find(
    (message) => message.purpose === "RESERVATION_MODIFIED",
  )!;
  expect(modified.variables).toEqual({ ...stayVariables, total: "USD 100.00" });
});
