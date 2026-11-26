import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "@/application/auth";
import {
  DispatchOutbox,
  type WhatsAppSender,
} from "@/application/notifications";
import {
  ApplyGuestChange,
  DecideChangeRequest,
  type GuestChangeContext,
} from "@/application/reservations";
import { success } from "@/application/shared/result";
import {
  guestChangeContext,
  guestReservationChanges,
  guestReservationReads,
  requestCancellation,
} from "@/composition/guests";
import {
  changeRequestDecisionContext,
  staffReservationCommands,
  staffReservationQueries,
} from "@/composition/reservations";
import { StaffChangeRequestList } from "@/contracts/api/v1/change-requests";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import { PrismaChangeRequestReader } from "@/infrastructure/db/prisma/repositories/reservations/change-request-store";
import { PrismaGuestReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-reservation-reader";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaAvailabilityCatalog } from "@/infrastructure/db/prisma/repositories/reservations/inventory/availability-catalog";
import { PrismaOutboxWorkerStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { FakeReservationEmail } from "@/infrastructure/email/fake-reservation-email";
import { renderReservationEmail } from "@/infrastructure/email/reservation-email";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred, withIndependentClients } from "./support/concurrency";
import {
  callbackEvent,
  paymentCallback,
  PROVIDER,
  refundCommands,
  signed,
} from "./support/payment-callback";
import {
  bookingBody,
  issueToken,
  NOW,
  pausedAudit,
  phoneOf,
  seasonalRate,
  seedBookable,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

const client = createTestClient();
const clock = { now: () => NOW };
const crypto = new NodeBookingCrypto();
const ids = new Cuid2IdGenerator();
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff",
};
const manager = {
  ...admin,
  role: "MANAGER",
  branchIds: [TEST_BRANCH_ID],
} as const;
const reception = { ...manager, role: "RECEPTIONIST" } as const;
const foreign = { ...manager, branchIds: ["other-branch"] };
const changedStay = { checkIn: "2031-04-10", checkOut: "2031-04-14" };
const paid = 34_500;
const longer = 46_000;
const money = (amountMinor: number) => ({
  currency: "USD" as const,
  amountMinor,
});
const longerChange = { stay: changedStay, expectedTotal: money(longer) };

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function book() {
  await createActor(client);
  const listing = await seedBookable(client, { units: 1 });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true, timeZone: "Africa/Cairo" },
  });
  const phone = phoneOf(27);
  const before = await websiteBooking(client, {
    checkout: {
      provider: PROVIDER,
      appUrl: "https://hotel.example",
      gateway: {
        createCheckout: async () => ({
          ok: true,
          checkoutUrl: "https://gateway.example.test/checkout",
          providerOrderId: "order-1",
        }),
      },
    },
  }).execute(
    bookingBody(phone, await issueToken(client, phone), {
      paymentMethod: "ONLINE",
    }),
    "paid-change-booking",
  );
  if (!before.ok || !before.value.manageToken)
    throw new Error("Expected a paid booking fixture.");
  const reservation = await client.reservation.findUniqueOrThrow({
    where: { reference: before.value.reference },
  });
  const payment = await client.payment.findFirstOrThrow({
    where: { reservationId: reservation.id },
  });
  const captured = await paymentCallback(client).useCase.execute(
    signed(callbackEvent(payment)),
  );
  expect(captured.ok).toBe(true);
  const row = await client.reservation.findUniqueOrThrow({
    where: { id: reservation.id },
  });
  expect(row).toMatchObject({
    status: "CONFIRMED",
    paymentStatus: "PAID",
    totalMinor: paid,
  });
  await client.notificationOutbox.deleteMany({
    where: { reservationId: row.id },
  });
  return {
    row,
    listing,
    payment,
    phone,
    access: { kind: "MANAGE_TOKEN", token: before.value.manageToken } as const,
  };
}

function commands(db = client, now = NOW) {
  return staffReservationCommands({ client: db, clock: { now: () => now } });
}

function changes(db = client) {
  return guestReservationChanges({ client: db, clock });
}

async function submit(fixture: Awaited<ReturnType<typeof book>>) {
  const result = await changes().apply.execute(
    fixture.access,
    fixture.row.version,
    success(longerChange),
  );
  if (!result.ok || result.value.kind !== "REQUESTED")
    throw new Error(`Expected a request: ${JSON.stringify(result)}`);
  return result.value.request;
}

function withApprovalAudit(
  db: PrismaClient,
  wrap: ReturnType<typeof pausedAudit>["audit"],
) {
  return new DecideChangeRequest({
    reader: new PrismaChangeRequestReader(db),
    reservations: new PrismaReservationRepository(db),
    clock,
    crypto,
    ids,
    unitOfWork: new PrismaReservationUnitOfWork(db, (transaction) => {
      const context = changeRequestDecisionContext(transaction);
      return { ...context, audit: wrap(context.audit) };
    }),
  });
}

function withRequestAudit(
  db: PrismaClient,
  wrap: (context: GuestChangeContext["audit"]) => GuestChangeContext["audit"],
) {
  return new ApplyGuestChange({
    reader: new PrismaGuestReservationReader(db),
    guests: new PrismaGuestRepository(db),
    verifications: new PrismaPhoneVerificationRepository(db),
    catalog: new PrismaAvailabilityCatalog(db),
    ids,
    crypto,
    clock,
    unitOfWork: new PrismaReservationUnitOfWork(db, (transaction) => {
      const context = guestChangeContext(transaction);
      return { ...context, audit: wrap(context.audit) };
    }),
  });
}

describe("Paid change requests (AC-12, AC-15, AC-16, T-GCHG-9 through 12)", () => {
  it("previews and immediately applies a same-total change via a verified session", async () => {
    const { row, phone } = await book();
    const token = crypto.generateToken();
    await client.phoneVerification.create({
      data: {
        id: ids.next(),
        purpose: "GUEST_SESSION",
        phone,
        codeHash: "0".repeat(64),
        verifiedAt: NOW,
        expiresAt: new Date(+NOW + 600_000),
        tokenHash: crypto.sha256(token),
        tokenExpiresAt: new Date(+NOW + 1_800_000),
        clientKey: "test",
      },
    });
    const access = {
      kind: "GUEST_SESSION",
      token,
      reference: row.reference,
    } as const;
    const input = { guest: { fullName: "Updated Guest" } };
    expect(
      await changes().preview.execute(access, success(input)),
    ).toMatchObject({
      ok: true,
      value: {
        version: row.version,
        preview: { outcome: "APPLIES_NOW", proposed: { total: money(paid) } },
      },
    });
    expect(
      await changes().apply.execute(
        access,
        row.version,
        success({ ...input, expectedTotal: money(paid) }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        kind: "APPLIED",
        version: row.version + 1,
        reservation: { contact: { fullName: "Updated Guest" } },
      },
    });
    expect(await client.changeRequest.count()).toBe(0);
    expect(await client.payment.findFirstOrThrow()).toMatchObject({
      amountMinor: paid,
      status: "SUCCEEDED",
    });
  });

  it("opens a request through an email session and records the session channel (M9-T12b)", async () => {
    const f = await book();
    const token = crypto.generateToken();
    await client.phoneVerification.create({
      data: {
        id: ids.next(),
        purpose: "GUEST_SESSION",
        // An email session from another phone, for the booking's contact email.
        phone: phoneOf(28),
        channel: "EMAIL",
        email: "amina@example.test",
        codeHash: "0".repeat(64),
        verifiedAt: NOW,
        expiresAt: new Date(+NOW + 600_000),
        tokenHash: crypto.sha256(token),
        tokenExpiresAt: new Date(+NOW + 1_800_000),
        clientKey: "test",
      },
    });
    const result = await changes().apply.execute(
      { kind: "GUEST_SESSION", token, reference: f.row.reference },
      f.row.version,
      success(longerChange),
    );
    expect(result).toMatchObject({ ok: true, value: { kind: "REQUESTED" } });
    expect(
      (
        await client.auditEvent.findFirstOrThrow({
          where: { action: "change-request.created" },
        })
      ).changes,
    ).toMatchObject({ access: "GUEST_SESSION", sessionChannel: "EMAIL" });
  });

  it("opens one request, alerts the branch once, protects contact values, and writes no booking or inventory changes", async () => {
    const f = await book();
    const input = {
      ...longerChange,
      guest: {
        email: "new-address@example.test",
        specialRequests: "private request",
      },
    };
    expect(
      await changes().preview.execute(f.access, success(input)),
    ).toMatchObject({
      ok: true,
      value: {
        preview: {
          outcome: "NEEDS_APPROVAL",
          proposed: { total: money(longer) },
        },
      },
    });
    const before = await client.reservationRoom.findMany();
    const result = await changes().apply.execute(
      f.access,
      f.row.version,
      success(input),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "REQUESTED",
        version: f.row.version,
        request: { status: "OPEN", previewTotalMinor: longer },
      },
    });
    expect(
      await client.reservation.findUnique({ where: { id: f.row.id } }),
    ).toEqual(f.row);
    expect(await client.reservationRoom.findMany()).toEqual(before);
    expect(await client.reservationChange.count()).toBe(0);
    const records = await client.notificationOutbox.findMany();
    expect(records).toHaveLength(3);
    expect(
      records.filter((row) => row.kind === "request.staff-alert"),
    ).toMatchObject([
      {
        channel: "EMAIL",
        recipient: "front@example.test",
        payload: { requestKind: "CHANGE" },
      },
    ]);
    expect(
      records.filter((row) => row.kind === "change-request.received"),
    ).toMatchObject([
      { kind: "change-request.received" },
      { kind: "change-request.received" },
    ]);
    for (const record of records)
      expect(JSON.stringify(record)).not.toMatch(
        /new-address|private request|manageLink/,
      );
    const list = await staffReservationQueries({
      client,
    }).changeRequests.execute(manager, {
      page: 1,
      pageSize: 1,
      status: "OPEN",
    });
    expect(list).toMatchObject({
      ok: true,
      value: {
        total: 1,
        items: [
          {
            current: { checkOut: "2031-04-13" },
            requested: {
              checkOut: "2031-04-14",
              contactFieldsChanged: ["email", "specialRequests"],
            },
            oldTotalMinor: paid,
            currentTotalMinor: paid,
            paidTotalMinor: paid,
            previewTotalMinor: longer,
            lastConflict: null,
          },
        ],
      },
    });
    if (!list.ok) throw new Error("Expected a list.");
    expect(StaffChangeRequestList.safeParse(list.value).success).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/new-address|private request/);
    expect(
      JSON.stringify(
        await client.auditEvent.findMany({
          where: { entityType: "ChangeRequest" },
        }),
      ),
    ).not.toMatch(/new-address|private request/);
    expect(
      await guestReservationReads({ client, clock }).view.execute(
        f.access.token,
      ),
    ).toMatchObject({
      ok: true,
      value: { allowedActions: [], currentChangeRequest: { status: "OPEN" } },
    });
    expect(
      await requestCancellation({ client, clock }).execute(f.access, {}),
    ).toMatchObject({
      ok: false,
      error: { code: "CANCELLATION_REQUEST_EXISTS" },
    });
    expect(
      await changes().apply.execute(f.access, f.row.version, success(input)),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "REQUEST_OPEN" },
      },
    });
  });

  it("approves after the guest cutoff, links history, and preserves the captured amount through later changes", async () => {
    const f = await book();
    await client.reservation.update({
      where: { id: f.row.id },
      data: { pmsEnteredAt: NOW },
    });
    const request = await submit(f);
    const approve = commands(
      client,
      new Date("2031-04-09T12:00:00Z"),
    ).decideChange;
    const note = "Desk follow-up approved by duty manager.";
    const result = await approve.approve(manager, request.id, { note });
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: f.row.version + 1,
        snapshot: { totalMinor: longer },
        paymentStatus: "PAID",
        pmsUpdatePendingSince: expect.any(Date),
      },
    });
    expect(await client.reservationChange.findFirstOrThrow()).toMatchObject({
      changeRequestId: request.id,
      actorType: "STAFF",
      actorId: manager.id,
      newTotalMinor: longer,
    });
    expect(
      await client.payment.findUnique({ where: { id: f.payment.id } }),
    ).toMatchObject({
      amountMinor: paid,
      status: "SUCCEEDED",
      refundAttempt: 0,
    });
    expect(
      await client.changeRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({
      status: "APPROVED",
      decidedById: manager.id,
      lastConflict: null,
    });
    expect(
      await client.auditEvent.findFirst({
        where: { entityId: request.id, action: "change-request.approved" },
      }),
    ).toMatchObject({ reason: note, changes: { noteProvided: true } });
    const queue = await staffReservationQueries({
      client,
    }).changeRequests.execute(manager, { page: 1, pageSize: 25 });
    const detail = await guestReservationReads({ client, clock }).view.execute(
      f.access.token,
    );
    const outbox = await client.notificationOutbox.findMany();
    const history = await staffReservationQueries({ client }).history.execute(
      manager,
      f.row.id,
    );
    expect(history.ok).toBe(true);
    expect(JSON.stringify({ queue, detail, outbox, history })).not.toContain(
      note,
    );
    expect(await approve.approve(manager, request.id, {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      await changes().preview.execute(
        f.access,
        success({ guest: { fullName: "New Name" } }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        preview: {
          outcome: "NEEDS_APPROVAL",
          proposed: { total: money(longer) },
        },
      },
    });
    expect(
      await changes().preview.execute(
        f.access,
        success({ stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" } }),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        preview: { outcome: "APPLIES_NOW", proposed: { total: money(paid) } },
      },
    });
  });

  it("requests and approves a new night priced from a stored seasonal rate (S57)", async () => {
    const f = await book();
    await seasonalRate(client, f.listing.id, "2031-04-13", 12_000);
    const total = 48_300;
    const submitted = await changes().apply.execute(
      f.access,
      f.row.version,
      success({ stay: changedStay, expectedTotal: money(total) }),
    );
    if (!submitted.ok || submitted.value.kind !== "REQUESTED")
      throw new Error(`Expected a request: ${JSON.stringify(submitted)}`);
    expect(
      await commands().decideChange.approve(
        manager,
        submitted.value.request.id,
        {},
      ),
    ).toMatchObject({
      ok: true,
      value: { snapshot: { totalMinor: total } },
    });
    expect(
      await client.reservationNight.findFirstOrThrow({
        where: { night: new Date("2031-04-13T00:00:00Z") },
      }),
    ).toMatchObject({ amountMinor: 12_000, rateSource: "PERIOD" });
  });

  it("records a lower price conflict without applying it, then lets staff reject with a guest reason", async () => {
    const f = await book();
    const request = await submit(f);
    await client.roomBaseRate.update({
      where: { roomTypeId: f.listing.id },
      data: { amountMinor: 9_000 },
    });
    const decision = commands().decideChange;
    expect(await decision.approve(admin, request.id, {})).toMatchObject({
      ok: false,
      error: {
        code: "PRICE_CHANGED",
        context: { quote: { totalMinor: 44_850 } },
      },
    });
    expect(
      await client.changeRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({ status: "OPEN", lastConflict: "PRICE_CHANGED" });
    expect(
      await client.reservation.findUnique({ where: { id: f.row.id } }),
    ).toEqual(f.row);
    expect(await client.reservationChange.count()).toBe(0);
    expect(
      await decision.reject(admin, request.id, {
        reason: "Please confirm a fresh quote.",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        request: {
          status: "REJECTED",
          decisionReason: "Please confirm a fresh quote.",
        },
      },
    });
    const email = new FakeReservationEmail();
    const send = vi.fn<WhatsAppSender["send"]>(async () => ({
      ok: true,
      providerMessageId: "fake",
    }));
    const dispatch = new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      email,
      { send },
      { now: () => new Date() },
    );
    expect(await dispatch.run()).toMatchObject({ sent: 5, failed: 0 });
    expect(send.mock.calls.map(([message]) => message.purpose)).toEqual(
      expect.arrayContaining([
        "CHANGE_REQUEST_RECEIVED",
        "CHANGE_REQUEST_REJECTED",
      ]),
    );
    for (const message of email.deliveries)
      expect(
        renderReservationEmail(message.kind, message.variables).text,
      ).not.toContain("https://");
    const alert = email.deliveries.find(
      (message) => message.kind === "request.staff-alert",
    )!;
    expect(
      renderReservationEmail(alert.kind, alert.variables).subject,
    ).toContain("New reservation change request");
  });

  it("keeps the request open when an added service is withdrawn", async () => {
    const f = await book();
    const service = await client.serviceOffering.create({
      data: {
        id: "request-breakfast",
        branchId: TEST_BRANCH_ID,
        kind: "BREAKFAST",
        active: true,
        priceUnit: "PER_PERSON_PER_NIGHT",
        priceMinor: 500,
      },
    });
    const input = { services: ["BREAKFAST"] };
    const preview = await changes().preview.execute(f.access, success(input));
    if (!preview.ok || !preview.value.preview.proposed)
      throw new Error("Expected the breakfast quote.");
    const submitted = await changes().apply.execute(
      f.access,
      f.row.version,
      success({
        ...input,
        expectedTotal: preview.value.preview.proposed.total,
      }),
    );
    if (!submitted.ok || submitted.value.kind !== "REQUESTED")
      throw new Error("Expected a request including breakfast.");
    const { request } = submitted.value;
    await client.serviceOffering.update({
      where: { id: service.id },
      data: { active: false },
    });
    expect(
      await commands().decideChange.approve(manager, request.id, {}),
    ).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect(
      await client.changeRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({ status: "OPEN", lastConflict: "SERVICE_UNAVAILABLE" });
    expect(
      await client.reservation.findUnique({ where: { id: f.row.id } }),
    ).toEqual(f.row);
    expect(await client.reservationChange.count()).toBe(0);
  });

  it.each([
    ["STALE_VERSION", "CONFLICT"],
    ["INVALID_TRANSITION", "INVALID_TRANSITION"],
  ] as const)(
    "records the %s conflict for staff",
    async (lastConflict, code) => {
      const f = await book();
      const request = await submit(f);
      if (lastConflict === "STALE_VERSION") {
        await client.reservation.update({
          where: { id: f.row.id },
          data: { version: { increment: 1 } },
        });
      }
      const now =
        lastConflict === "INVALID_TRANSITION"
          ? new Date("2031-04-10T12:00:00Z")
          : NOW;
      expect(
        await commands(client, now).decideChange.approve(
          manager,
          request.id,
          {},
        ),
      ).toMatchObject({ ok: false, error: { code } });
      expect(
        await client.changeRequest.findUnique({ where: { id: request.id } }),
      ).toMatchObject({ status: "OPEN", lastConflict });
      expect(await client.reservationChange.count()).toBe(0);
    },
  );

  it("denies staff without the capability and hides request IDs from another branch", async () => {
    const f = await book();
    const request = await submit(f);
    const list = staffReservationQueries({ client }).changeRequests;
    const query = { page: 1, pageSize: 25 };
    for (const [actor, code] of [
      [null, "UNAUTHENTICATED"],
      [reception, "FORBIDDEN"],
      [foreign, "NOT_FOUND"],
    ] as const) {
      expect(
        await commands().decideChange.approve(actor, request.id, {}),
      ).toMatchObject({ ok: false, error: { code } });
      expect(
        await commands().decideChange.reject(actor, request.id, {
          reason: "No room",
        }),
      ).toMatchObject({ ok: false, error: { code } });
    }
    expect(await list.execute(reception, query)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await list.execute(foreign, query)).toMatchObject({
      ok: true,
      value: { total: 0 },
    });
    expect(
      await list.execute(foreign, { ...query, branchId: TEST_BRANCH_ID }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it.each(["CHECKED_IN", "NO_SHOW"] as const)(
    "closes a request on %s in the same transaction",
    async (status) => {
      const f = await book();
      const request = await submit(f);
      await client.reservationRoom.updateMany({
        where: { reservationId: f.row.id },
        data: { physicalRoomId: "garden-unit-0" },
      });
      const ops = commands(
        client,
        new Date(
          status === "NO_SHOW"
            ? "2031-04-11T10:00:00Z"
            : "2031-04-10T10:00:00Z",
        ),
      );
      const transition = status === "NO_SHOW" ? ops.markNoShow : ops.checkIn;
      expect(
        await transition.execute(reception, f.row.id, f.row.version),
      ).toMatchObject({ ok: true, value: { reservation: { status } } });
      expect(
        await client.changeRequest.findUnique({ where: { id: request.id } }),
      ).toMatchObject({
        status: "CLOSED",
        closedReason: status,
        decidedById: reception.id,
      });
      expect(
        await client.auditEvent.findFirst({
          where: { action: "change-request.closed" },
        }),
      ).toMatchObject({
        entityId: request.id,
        actorId: reception.id,
        reason: status,
      });
      expect(
        await ops.decideChange.reject(manager, request.id, {
          reason: "Closed",
        }),
      ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    },
  );

  it("closes the change at paid cancellation start and preserves the choice after a failed refund", async () => {
    const f = await book();
    const request = await submit(f);
    let closedAtDispatch = false;
    const refunds = refundCommands(client, {
      refund: async () => {
        closedAtDispatch =
          (
            await client.changeRequest.findUniqueOrThrow({
              where: { id: request.id },
            })
          ).status === "CLOSED";
        return { status: "FAILED" };
      },
    });
    const cancelled = await refunds.cancel.execute(
      admin,
      f.row.id,
      f.row.version,
      { reason: "INVALID_DETAILS", notifyGuest: false },
    );
    expect(cancelled.ok).toBe(true);
    expect(closedAtDispatch).toBe(true);
    expect(
      await client.changeRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({ status: "CLOSED", closedReason: "STAFF_CANCELLED" });
    expect(await client.cancellationRequest.findFirst()).toMatchObject({
      status: "REFUND_FAILED",
      notifyGuest: false,
      cancelReason: "INVALID_DETAILS",
    });
    expect(
      await changes().apply.execute(
        f.access,
        f.row.version + 2,
        success(longerChange),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHANGE_NOT_ALLOWED",
        context: { reason: "REQUEST_OPEN" },
      },
    });
  });

  it("rolls back request creation and approval when a write fails", async () => {
    const f = await book();
    const rejecting =
      (action: string) => (audit: GuestChangeContext["audit"]) => ({
        append: async (event: Parameters<typeof audit.append>[0]) => {
          if (event.action === action)
            throw new Error("injected audit failure");
          return audit.append(event);
        },
      });
    await expect(
      withRequestAudit(client, rejecting("change-request.created")).execute(
        f.access,
        f.row.version,
        success(longerChange),
      ),
    ).rejects.toThrow("injected audit failure");
    expect(await client.changeRequest.count()).toBe(0);
    expect(await client.notificationOutbox.count()).toBe(0);
    const request = await submit(f);
    await expect(
      withApprovalAudit(client, rejecting("change-request.approved")).approve(
        admin,
        request.id,
        {},
      ),
    ).rejects.toThrow("injected audit failure");
    expect(
      await client.reservation.findUnique({ where: { id: f.row.id } }),
    ).toEqual(f.row);
    expect(await client.reservationChange.count()).toBe(0);
    expect(
      await client.changeRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({ status: "OPEN" });
    expect(await client.notificationOutbox.count()).toBe(3);
  });
});

describe("Concurrent paid change requests (C-17)", () => {
  it("opens a request while another transaction holds the listing lock, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      if (round) await resetDatabase(client);
      const f = await book();
      await withIndependentClients(2, async ([blocker, guest]) => {
        const locked = deferred();
        const release = deferred();
        const hold = blocker!.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${f.listing.id} FOR NO KEY UPDATE`;
          locked.resolve();
          await release.promise;
        });
        await Promise.race([
          locked.promise,
          hold.then(() => {
            throw new Error("Listing lock was released too early.");
          }),
        ]);
        try {
          const apply = changes(guest!).apply;
          const wrongTotal = await apply.execute(
            f.access,
            f.row.version,
            success({
              ...longerChange,
              expectedTotal: money(longer + 1),
            }),
          );
          expect(wrongTotal).toMatchObject({
            ok: false,
            error: { code: "PRICE_CHANGED" },
          });
          expect(await client.changeRequest.count()).toBe(0);
          expect(
            await apply.execute(f.access, f.row.version, success(longerChange)),
          ).toMatchObject({
            ok: true,
            value: { kind: "REQUESTED", request: { status: "OPEN" } },
          });
        } finally {
          release.resolve();
          await hold;
        }
      });
      expect(
        await client.reservation.findUnique({ where: { id: f.row.id } }),
      ).toEqual(f.row);
    }
  }, 90_000);

  it.each(["booking", "approval"] as const)(
    "%s wins the last room, 20 observed rounds",
    async (winner) => {
      for (let round = 0; round < 20; round++) {
        if (round) await resetDatabase(client);
        const f = await book();
        const request = await submit(f);
        const rivalPhone = phoneOf(28);
        const body = bookingBody(
          rivalPhone,
          await issueToken(client, rivalPhone),
          {
            stay: { checkIn: "2031-04-13", checkOut: "2031-04-14" },
            expectedTotal: money(11_500),
          },
        );
        await withIndependentClients(2, async ([a, b]) => {
          const pause = pausedAudit();
          const create = () =>
            websiteBooking(
              a!,
              winner === "booking" ? { audit: pause.audit } : {},
            ).execute(body, "rival-last-room");
          const approve = () =>
            (winner === "approval"
              ? withApprovalAudit(b!, pause.audit)
              : commands(b!).decideChange
            ).approve(admin, request.id, {});
          const lead = winner === "booking" ? create() : approve();
          await Promise.race([
            pause.reached,
            lead.then((result) => {
              throw new Error(
                `Expected the winner to reach its audit: ${JSON.stringify(result)}`,
              );
            }),
          ]);
          const trailing = winner === "booking" ? approve() : create();
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            pause.release();
          }
          expect((await lead).ok).toBe(true);
          expect(await trailing).toMatchObject({
            ok: false,
            error: { code: "INVENTORY_UNAVAILABLE" },
          });
        });
        expect(
          await client.reservationRoom.count({
            where: {
              roomTypeId: f.listing.id,
              consumesInventory: true,
              checkIn: { lte: new Date("2031-04-13") },
              checkOut: { gt: new Date("2031-04-13") },
            },
          }),
        ).toBe(1);
        expect(
          await client.changeRequest.findUniqueOrThrow({
            where: { id: request.id },
          }),
        ).toMatchObject(
          winner === "approval"
            ? { status: "APPROVED", lastConflict: null }
            : { status: "OPEN", lastConflict: "INVENTORY_UNAVAILABLE" },
        );
      }
    },
    90_000,
  );

  it.each(["cancellation", "change"] as const)(
    "%s wins competing guest requests, 20 observed rounds",
    async (winner) => {
      for (let round = 0; round < 20; round++) {
        if (round) await resetDatabase(client);
        const f = await book();
        await withIndependentClients(3, async ([a, b, blocker]) => {
          const pause = pausedAudit();
          const request = () =>
            (winner === "change"
              ? withRequestAudit(a!, pause.audit)
              : changes(a!).apply
            ).execute(f.access, f.row.version, success(longerChange));
          const cancellation = () => {
            const current = requestCancellation({ client: b!, clock });
            return current.execute(f.access, {});
          };
          // For the cancellation winner, let the normal cancellation commit
          // behind a held row lock and queue the change after that lock wait.
          if (winner === "cancellation") {
            const locked = deferred();
            const release = deferred();
            const hold = blocker!.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${f.row.id} FOR UPDATE`;
              locked.resolve();
              await release.promise;
            });
            await Promise.race([locked.promise, hold]);
            const first = cancellation();
            let second;
            try {
              await waitForLockWaiters(client, 1);
              second = request();
              await waitForLockWaiters(client, 2);
            } finally {
              release.resolve();
            }
            await hold;
            expect((await first).ok).toBe(true);
            expect(await second).toMatchObject({
              ok: false,
              error: { code: "CHANGE_NOT_ALLOWED" },
            });
            return;
          }
          const first = request();
          await Promise.race([
            pause.reached,
            first.then(() => {
              throw new Error("Expected the change to reach its audit.");
            }),
          ]);
          const second = cancellation();
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            pause.release();
          }
          expect((await first).ok).toBe(true);
          expect(await second).toMatchObject({
            ok: false,
            error: { code: "CANCELLATION_REQUEST_EXISTS" },
          });
        });
        expect(
          await client.changeRequest.count({ where: { status: "OPEN" } }),
        ).toBe(winner === "change" ? 1 : 0);
        expect(
          await client.cancellationRequest.count({ where: { status: "OPEN" } }),
        ).toBe(winner === "cancellation" ? 1 : 0);
      }
    },
    90_000,
  );
});
