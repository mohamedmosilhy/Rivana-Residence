import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "@/application/auth";
import type { AuditLog } from "@/application/audit";
import { ChangeGuestBlock } from "@/application/guests";
import {
  DispatchOutbox,
  TemplateWhatsAppSender,
  WhatsAppSetupReader,
} from "@/application/notifications";
import {
  CancelReservation,
  RecordFrontDeskTransition,
  RequestCancellation,
  UpdateReservationGuest,
  type RequestCancellationContext,
} from "@/application/reservations";
import {
  guestReservationReads,
  requestCancellation,
  requestCancellationContext,
  staffGuests,
} from "@/composition/guests";
import {
  cancelReservationContext,
  frontDeskTransitionContext,
  staffReservationCommands,
} from "@/composition/reservations";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import {
  PrismaAuditLog,
  PrismaGuestHistoryReader,
} from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaGuestDirectoryReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-directory-reader";
import { PrismaStaffReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/staff-reservation-reader";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaGuestReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-reservation-reader";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaOutboxWorkerStore } from "@/infrastructure/db/prisma/repositories/reservations/notifications/outbox";
import { PrismaWhatsAppTemplateRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-template-repository";
import { PrismaWhatsAppSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-settings-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { FakeReservationEmail } from "@/infrastructure/email/fake-reservation-email";
import { renderReservationEmail } from "@/infrastructure/email/reservation-email";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";
import { parseWhatsAppTemplateInput } from "@/domain/notifications";
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
  signed,
} from "./support/payment-callback";
import {
  bookingBody,
  configureWhatsApp,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

const client = createTestClient();
const clock = { now: () => NOW };
const atArrival = { now: () => new Date("2031-04-10T12:00:00.000Z") };
const deadline = new Date("2031-04-09T12:00:00.000Z");
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "session",
};
const reception: StaffPrincipal = {
  ...admin,
  role: "RECEPTIONIST",
  branchIds: [TEST_BRANCH_ID],
};
const cancelInput = { reason: "GUEST_REQUEST", notifyGuest: false } as const;
const requestKinds = ["cancellation-request.received", "request.staff-alert"];

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function book(online = false) {
  await createActor(client);
  await seedBookable(client, { units: 1 });
  if (online)
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlinePaymentEnabled: true },
    });
  const phone = phoneOf(1);
  const created = await websiteBooking(
    client,
    online
      ? {
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
        }
      : {},
  ).execute(
    bookingBody(
      phone,
      await issueToken(client, phone),
      online ? { paymentMethod: "ONLINE" } : {},
    ),
    "cancellation-booking-1",
  );
  if (!created.ok || !created.value.manageToken)
    throw new Error("Expected a booking with a manage link.");
  const reservation = await client.reservation.findUniqueOrThrow({
    where: { reference: created.value.reference },
    include: { rooms: true },
  });
  return {
    reservation,
    phone,
    access: { kind: "MANAGE_TOKEN", token: created.value.manageToken } as const,
  };
}

async function guestSession(phone: string, reference: string) {
  const crypto = new NodeBookingCrypto();
  const token = crypto.generateToken();
  await client.phoneVerification.create({
    data: {
      id: "cancellation-session",
      purpose: "GUEST_SESSION",
      phone,
      codeHash: "0".repeat(64),
      verifiedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 600_000),
      tokenHash: crypto.sha256(token),
      tokenExpiresAt: new Date(NOW.getTime() + 1_800_000),
      clientKey: "test",
    },
  });
  return { kind: "GUEST_SESSION", token, reference } as const;
}

function requestWithContext(
  db: PrismaClient,
  wrap: (context: RequestCancellationContext) => RequestCancellationContext,
) {
  return new RequestCancellation({
    reader: new PrismaGuestReservationReader(db),
    guests: new PrismaGuestRepository(db),
    verifications: new PrismaPhoneVerificationRepository(db),
    ids: new Cuid2IdGenerator(),
    crypto: new NodeBookingCrypto(),
    clock,
    unitOfWork: new PrismaReservationUnitOfWork(db, (transaction) =>
      wrap(requestCancellationContext(transaction)),
    ),
  });
}

const queue = (reservationId: string) =>
  client.notificationOutbox.findMany({
    where: { reservationId, kind: { in: requestKinds } },
    orderBy: [{ kind: "asc" }, { channel: "asc" }],
  });
const requestAudits = (action: "created" | "closed") =>
  client.auditEvent.findMany({
    where: { action: `cancellation-request.${action}` },
  });

describe("Cancellation request data and messages (AC-6 and AC-16)", () => {
  it("reports a receipt template that needs a manage link and delivers with a compatible template", async () => {
    const { reservation, access } = await book();
    await configureWhatsApp(client);
    const template = {
      purpose: "CANCELLATION_RECEIVED",
      language: "en",
      category: "UTILITY",
      providerName: "fictional_old_cancel_receipt",
      variables: ["reference", "manageLink"],
      previewText: "Fictional template",
      active: true,
    } as const;
    expect(
      parseWhatsAppTemplateInput({
        ...template,
        variables: [...template.variables],
      }).ok,
    ).toBe(false);
    await client.whatsAppTemplate.create({
      data: {
        ...template,
        variables: [...template.variables],
        id: "legacy-receipt-template",
      },
    });
    const settings = new PrismaWhatsAppSettingsRepository(client);
    const templates = new PrismaWhatsAppTemplateRepository(client);
    const setup = new WhatsAppSetupReader({
      settings,
      templates,
      accessTokenConfigured: true,
    });
    expect(await setup.read()).toMatchObject({
      configured: true,
      setupGaps: expect.arrayContaining([
        { purpose: "CANCELLATION_RECEIVED", language: "en", blocking: false },
      ]),
    });
    const useCase = requestCancellation({ client, clock });
    expect((await useCase.execute(access, {})).ok).toBe(true);
    await client.notificationOutbox.deleteMany({
      where: { kind: { notIn: requestKinds } },
    });
    const fake = new FakeWhatsAppTransport();
    const dispatch = new DispatchOutbox(
      new PrismaOutboxWorkerStore(client),
      new FakeReservationEmail(),
      new TemplateWhatsAppSender({
        settings,
        templates,
        transport: fake,
        accessTokenConfigured: true,
      }),
      { now: () => new Date("2040-01-01") },
    );
    expect(await dispatch.run()).toEqual({
      sent: 2,
      failed: 1,
      retried: 0,
      stale: 0,
    });
    expect(fake.deliveries).toEqual([]);
    expect(await queue(reservation.id)).toContainEqual(
      expect.objectContaining({
        channel: "WHATSAPP",
        status: "FAILED",
        lastError: "TEMPLATE_MISSING",
      }),
    );
    await client.whatsAppTemplate.update({
      where: { id: "legacy-receipt-template" },
      data: {
        providerName: "fictional_cancel_receipt_v2",
        variables: ["reference"],
      },
    });
    expect(
      (await setup.read()).setupGaps.some(
        ({ purpose }) => purpose === "CANCELLATION_RECEIVED",
      ),
    ).toBe(false);
    await client.cancellationRequest.updateMany({
      where: { reservationId: reservation.id },
      data: { status: "REJECTED" },
    });
    expect((await useCase.execute(access, {})).ok).toBe(true);
    expect(await dispatch.run()).toEqual({
      sent: 3,
      failed: 0,
      retried: 0,
      stale: 0,
    });
    expect(fake.deliveries).toEqual([
      expect.objectContaining({
        templateName: "fictional_cancel_receipt_v2",
        parameters: [reservation.reference],
      }),
    ]);
  });

  it("opens strictly before the branch deadline and returns the branch contact at and after it", async () => {
    const { access } = await book();
    for (const delta of [0, 1]) {
      const result = await requestCancellation({
        client,
        clock: { now: () => new Date(deadline.getTime() + delta) },
      }).execute(access, {});
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "CANCELLATION_WINDOW_CLOSED",
          context: {
            deadline: deadline.toISOString(),
            branch: { slug: "new-cairo", email: "front@example.test" },
          },
        },
      });
    }
    expect(
      await guestReservationReads({
        client,
        clock: { now: () => deadline },
      }).view.execute(access.token),
    ).toMatchObject({
      ok: true,
      value: { status: "CONFIRMED", allowedActions: [] },
    });
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { checkInTime: null },
    });
    expect(
      await requestCancellation({ client, clock }).execute(access, {}),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CANCELLATION_WINDOW_CLOSED",
        context: { deadline: null },
      },
    });
    expect(await client.cancellationRequest.count()).toBe(0);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { checkInTime: "14:00" },
    });
    const justBefore = { now: () => new Date(deadline.getTime() - 1) };
    expect(
      await requestCancellation({ client, clock: justBefore }).execute(
        access,
        {},
      ),
    ).toMatchObject({ ok: true, value: { status: "OPEN" } });
  });

  it("rejects an unpaid hold and leaves a paid booking, its unit and its payment untouched after a request", async () => {
    const { reservation, access } = await book(true);
    const useCase = requestCancellation({ client, clock });
    expect(await useCase.execute(access, {})).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        context: { status: "AWAITING_PAYMENT" },
      },
    });
    const payment = await client.payment.findFirstOrThrow({
      where: { reservationId: reservation.id },
    });
    expect(
      (
        await paymentCallback(client).useCase.execute(
          signed(callbackEvent(payment)),
        )
      ).ok,
    ).toBe(true);
    const storedPayment = await client.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const storedReservation = await client.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { rooms: true },
    });
    expect(storedReservation).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
    });
    expect(storedReservation.rooms[0]?.consumesInventory).toBe(true);
    await client.reservation.update({
      where: { id: reservation.id },
      data: {
        paymentStatus: "REFUND_PENDING",
        updatedAt: storedReservation.updatedAt,
      },
    });
    expect(await useCase.execute(access, {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION", context: { status: "CONFIRMED" } },
    });
    expect(
      await guestReservationReads({ client, clock }).view.execute(access.token),
    ).toMatchObject({
      ok: true,
      value: { allowedActions: [] },
    });
    expect(await client.cancellationRequest.count()).toBe(0);
    expect(await requestAudits("created")).toEqual([]);
    expect(await queue(reservation.id)).toEqual([]);
    await client.reservation.update({
      where: { id: reservation.id },
      data: { paymentStatus: "PAID", updatedAt: storedReservation.updatedAt },
    });
    expect(await useCase.execute(access, {})).toMatchObject({
      ok: true,
      value: { status: "OPEN" },
    });
    expect(
      await client.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toEqual(storedPayment);
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
        include: { rooms: true },
      }),
    ).toEqual(storedReservation);
  });

  it.each(["APPROVED", "REFUND_PENDING", "REFUND_FAILED"] as const)(
    "also refuses a duplicate while an active request is %s",
    async (status) => {
      const { reservation, access } = await book();
      await client.cancellationRequest.create({
        data: {
          id: "active-request",
          reservationId: reservation.id,
          requestedBy: "GUEST",
          status,
        },
      });
      await client.cancellationRequest.create({
        data: {
          id: "finished-request",
          reservationId: reservation.id,
          requestedBy: "GUEST",
          status: "REJECTED",
          createdAt: new Date("2031-04-01"),
        },
      });
      const view = await guestReservationReads({ client, clock }).view.execute(
        access.token,
      );
      expect(view).toMatchObject({
        ok: true,
        value: {
          currentCancellationRequest: { id: "active-request", status },
          allowedActions: [],
        },
      });
      expect(
        await requestCancellation({ client, clock }).execute(access, {}),
      ).toMatchObject({
        ok: false,
        error: { code: "CANCELLATION_REQUEST_EXISTS" },
      });
      await client.cancellationRequest.update({
        where: { id: "active-request" },
        data: { status: "REJECTED" },
      });
      expect(
        await requestCancellation({ client, clock }).execute(access, {}),
      ).toMatchObject({ ok: true });
    },
  );

  it.each([true, false])(
    "queues only the intended recipients and reports a missing branch inbox (has inbox %s)",
    async (hasInbox) => {
      const { reservation, access, phone } = await book();
      if (!hasInbox)
        await client.branch.update({
          where: { id: TEST_BRANCH_ID },
          data: { email: null },
        });
      expect(
        await requestCancellation({ client, clock }).execute(access, {
          reason: "Private guest note",
        }),
      ).toMatchObject({ ok: true });
      expect(await requestAudits("created")).toEqual([
        expect.objectContaining({
          branchId: TEST_BRANCH_ID,
          actorType: "GUEST",
          actorId: reservation.guestId,
          reason: null,
          changes: {
            reservationId: reservation.id,
            access: "MANAGE_TOKEN",
            actorIdentity: "GUEST_PROFILE",
            reasonProvided: true,
          },
        }),
      ]);
      const rows = await queue(reservation.id);
      expect(
        rows.map(({ kind, channel, recipient }) => [kind, channel, recipient]),
      ).toEqual([
        ["cancellation-request.received", "EMAIL", "amina@example.test"],
        ["cancellation-request.received", "WHATSAPP", phone],
        ["request.staff-alert", "EMAIL", hasInbox ? "front@example.test" : ""],
      ]);
      expect(rows[2]?.payload).toEqual({
        reference: reservation.reference,
        branchName: expect.any(String),
      });
      expect(JSON.stringify(rows)).not.toContain("Private guest note");
      expect(JSON.stringify(rows)).not.toContain(access.token);
      await client.notificationOutbox.deleteMany({
        where: { kind: { notIn: requestKinds } },
      });
      const email = new FakeReservationEmail();
      const whatsAppPurposes: string[] = [];
      const dispatch = new DispatchOutbox(
        new PrismaOutboxWorkerStore(client),
        email,
        {
          async send(message) {
            whatsAppPurposes.push(message.purpose);
            return { ok: true, providerMessageId: "test-message" };
          },
        },
        { now: () => new Date("2040-01-01") },
      );
      expect(await dispatch.run()).toEqual({
        sent: hasInbox ? 3 : 2,
        failed: hasInbox ? 0 : 1,
        retried: 0,
        stale: 0,
      });
      expect(whatsAppPurposes).toEqual(["CANCELLATION_RECEIVED"]);
      expect(email.deliveries.map((delivery) => delivery.to).sort()).toEqual(
        hasInbox
          ? ["amina@example.test", "front@example.test"]
          : ["amina@example.test"],
      );
      const receipt = email.deliveries.find(
        (delivery) => delivery.kind === "cancellation-request.received",
      );
      expect(
        receipt && renderReservationEmail(receipt.kind, receipt.variables).text,
      ).toContain("We received your cancellation request");
      expect(await queue(reservation.id)).toContainEqual(
        expect.objectContaining({
          kind: "request.staff-alert",
          status: hasInbox ? "SENT" : "FAILED",
          lastError: hasInbox ? null : "INVALID_MESSAGE",
        }),
      );
    },
  );

  it.each(["audit", "second queue write"] as const)(
    "rolls back the request and messages on a failed %s",
    async (fault) => {
      const { reservation, access } = await book();
      const useCase = requestWithContext(client, (context) => ({
        ...context,
        audit:
          fault === "audit"
            ? {
                async append() {
                  throw new Error("injected failure");
                },
              }
            : context.audit,
        messages: {
          async enqueue(branch, id, event) {
            if (
              fault === "second queue write" &&
              event.kind === "request.staff-alert"
            )
              throw new Error("injected failure");
            await context.messages.enqueue(branch, id, event);
          },
        },
      }));
      await expect(useCase.execute(access, {})).rejects.toThrow(
        "injected failure",
      );
      expect(await client.cancellationRequest.count()).toBe(0);
      expect(await requestAudits("created")).toEqual([]);
      expect(await queue(reservation.id)).toEqual([]);
    },
  );
});

describe("Staff closure (AC-15 and Q-96)", () => {
  it("does not disclose guest detail if a block revokes the session before the detail snapshot", async () => {
    const { reservation, access, phone } = await book();
    if (!reservation.guestId) throw new Error("Expected a linked guest.");
    const session = await guestSession(phone, reservation.reference);
    expect(
      (await requestCancellation({ client, clock }).execute(access, {})).ok,
    ).toBe(true);
    await withIndependentClients(2, async ([reader, writer]) => {
      const reached = deferred();
      const release = deferred();
      const find = PrismaGuestReservationReader.prototype.findForPhone;
      const pause = vi
        .spyOn(PrismaGuestReservationReader.prototype, "findForPhone")
        .mockImplementationOnce(async function (
          this: PrismaGuestReservationReader,
          phone,
          reference,
        ) {
          reached.resolve();
          await release.promise;
          return find.call(this, phone, reference);
        });
      const view = guestReservationReads({
        client: reader!,
        clock,
      }).viewBySession;
      const reading = view.execute(session.token, session.reference);
      try {
        await Promise.race([
          reached.promise,
          reading.then(() => {
            throw new Error("Guest detail did not reach its read barrier.");
          }),
        ]);
        expect(
          (
            await staffGuests({ client: writer!, clock }).block.execute(
              admin,
              reservation.guestId!,
              "Test block",
            )
          ).ok,
        ).toBe(true);
        expect(
          (
            await staffReservationCommands({
              client: writer!,
              clock,
            }).cancel.execute(
              admin,
              reservation.id,
              reservation.version,
              cancelInput,
            )
          ).ok,
        ).toBe(true);
      } finally {
        release.resolve();
        await Promise.allSettled([reading]);
        pause.mockRestore();
      }
      expect(await reading).toMatchObject({
        ok: false,
        error: { code: "PHONE_NOT_VERIFIED" },
      });
    });
  });

  it("reads a coherent guest view when staff close the request between guest queries", async () => {
    const { reservation, access } = await book();
    expect(
      (await requestCancellation({ client, clock }).execute(access, {})).ok,
    ).toBe(true);
    await withIndependentClients(2, async ([reader, writer]) => {
      const reached = deferred();
      const release = deferred();
      const find = PrismaReservationRepository.prototype.findById;
      const pause = vi
        .spyOn(PrismaReservationRepository.prototype, "findById")
        .mockImplementationOnce(async function (
          this: PrismaReservationRepository,
          branchId,
          id,
        ) {
          const row = await find.call(this, branchId, id);
          reached.resolve();
          await release.promise;
          return row;
        });
      const view = guestReservationReads({ client: reader!, clock }).view;
      const reading = view.execute(access.token);
      try {
        await Promise.race([
          reached.promise,
          reading.then(() => {
            throw new Error("Guest read reached no snapshot barrier.");
          }),
        ]);
        expect(
          (
            await staffReservationCommands({
              client: writer!,
              clock,
            }).cancel.execute(
              reception,
              reservation.id,
              reservation.version,
              cancelInput,
            )
          ).ok,
        ).toBe(true);
      } finally {
        release.resolve();
        await Promise.allSettled([reading]);
        pause.mockRestore();
      }
      expect(await reading).toMatchObject({
        ok: true,
        value: {
          status: "CONFIRMED",
          currentCancellationRequest: { status: "OPEN" },
          allowedActions: [],
        },
      });
      expect(await view.execute(access.token)).toMatchObject({
        ok: true,
        value: {
          status: "CANCELLED",
          currentCancellationRequest: { status: "CLOSED" },
          allowedActions: [],
        },
      });
    });
  });

  it.each([
    ["cancel", "CANCELLED", "STAFF_CANCELLED"],
    ["markNoShow", "NO_SHOW", "NO_SHOW"],
    ["checkIn", "CHECKED_IN", "CHECKED_IN"],
  ] as const)(
    "%s closes an open request, with the staff member and reason",
    async (action, status, closedReason) => {
      const { reservation, access } = await book();
      expect(
        await requestCancellation({ client, clock }).execute(access, {}),
      ).toMatchObject({ ok: true });
      const before = await client.cancellationRequest.findFirstOrThrow();
      const staff = staffReservationCommands({ client, clock: atArrival });
      let version = reservation.version;
      if (action === "checkIn") {
        const assigned = await staff.assignRoom.execute(
          reception,
          reservation.id,
          reservation.rooms[0]!.id,
          version,
          "garden-unit-0",
        );
        expect(assigned.ok).toBe(true);
        version = (
          await client.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).version;
      }
      const result =
        action === "cancel"
          ? await staff.cancel.execute(
              reception,
              reservation.id,
              version,
              cancelInput,
            )
          : await staff[action].execute(reception, reservation.id, version);
      expect(result.ok).toBe(true);
      expect(
        await client.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
        }),
      ).toMatchObject({ status });
      expect(
        await client.cancellationRequest.findUniqueOrThrow({
          where: { id: before.id },
        }),
      ).toMatchObject({
        status: "CLOSED",
        closedReason,
        decidedById: reception.id,
        decidedAt: atArrival.now(),
      });
      expect(await requestAudits("closed")).toEqual([
        expect.objectContaining({
          entityId: before.id,
          actorId: reception.id,
          reason: closedReason,
          branchId: TEST_BRANCH_ID,
        }),
      ]);
      expect(
        await guestReservationReads({ client, clock: atArrival }).view.execute(
          access.token,
        ),
      ).toMatchObject({
        ok: true,
        value: {
          currentCancellationRequest: {
            id: before.id,
            status: "CLOSED",
            decisionReason: null,
          },
          allowedActions: [],
        },
      });
      expect(await queue(reservation.id)).toHaveLength(3);
    },
  );

  it("preserves an open request on unauthorised, foreign, stale and invalid staff actions", async () => {
    const { reservation, access } = await book();
    expect(
      (await requestCancellation({ client, clock }).execute(access, {})).ok,
    ).toBe(true);
    const staff = staffReservationCommands({ client, clock });
    for (const [principal, expected] of [
      [null, "UNAUTHENTICATED"],
      [{ ...admin, role: "EDITOR" }, "FORBIDDEN"],
      [{ ...reception, branchIds: ["different-branch"] }, "NOT_FOUND"],
    ] as const)
      expect(
        await staff.cancel.execute(
          principal,
          reservation.id,
          reservation.version,
          cancelInput,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: expected },
      });
    expect(
      await staff.cancel.execute(
        reception,
        reservation.id,
        reservation.version + 1,
        cancelInput,
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_VERSION" } });
    expect(
      await staff.checkIn.execute(
        reception,
        reservation.id,
        reservation.version,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(await client.cancellationRequest.findFirstOrThrow()).toMatchObject({
      status: "OPEN",
    });
    expect(await requestAudits("closed")).toEqual([]);
  });

  it("rolls back the booking and request when the closure audit fails", async () => {
    const { reservation, access } = await book();
    expect(
      (await requestCancellation({ client, clock }).execute(access, {})).ok,
    ).toBe(true);
    const failing = new CancelReservation({
      paid: {
        execute: async () => {
          throw new Error("unpaid path only");
        },
      },
      reads: new PrismaStaffReservationReader(client),
      clock,
      ids: new Cuid2IdGenerator(),
      unitOfWork: new PrismaReservationUnitOfWork(client, (transaction) => ({
        ...cancelReservationContext(transaction),
        audit: {
          async append() {
            throw new Error("closure audit failed");
          },
        },
      })),
    });
    await expect(
      failing.execute(
        reception,
        reservation.id,
        reservation.version,
        cancelInput,
      ),
    ).rejects.toThrow("closure audit failed");
    expect(await client.cancellationRequest.findFirstOrThrow()).toMatchObject({
      status: "OPEN",
      decidedById: null,
      closedReason: null,
    });
    expect(
      await client.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      }),
    ).toMatchObject({ status: "CONFIRMED", version: reservation.version });
    expect(await requestAudits("closed")).toEqual([]);
  });
});

/** Pause a successful request while its locks are held so a second writer must wait. */
function pausedRequest(db: PrismaClient) {
  const paused = pauseAuditWrite();
  const useCase = requestWithContext(db, (context) => ({
    ...context,
    audit: paused.wrap(context.audit),
  }));
  return {
    useCase,
    reached: paused.reached,
    release: paused.release,
  };
}

function pauseAuditWrite() {
  const reached = deferred();
  const release = deferred();
  return {
    reached: reached.promise,
    release: () => release.resolve(),
    wrap: (audit: AuditLog): AuditLog => ({
      async append(event) {
        await audit.append(event);
        reached.resolve();
        await release.promise;
      },
    }),
  };
}

async function waitAtAudit(
  reached: Promise<void>,
  operation: Promise<unknown>,
) {
  await Promise.race([
    reached,
    operation.then((result) => {
      throw new Error(
        `Staff action completed before the audit barrier: ${JSON.stringify(result)}`,
      );
    }),
  ]);
}

describe("Concurrent cancellation requests (20 rounds per race)", () => {
  it.each(["cancel", "no-show"] as const)(
    "refuses a request that waits on a staff %s",
    async (action) => {
      for (let round = 0; round < 20; round++) {
        if (round > 0) await resetDatabase(client);
        const { reservation, access } = await book();
        await withIndependentClients(2, async ([first, second]) => {
          const paused = pauseAuditWrite();
          const staffClock = action === "cancel" ? clock : atArrival;
          const reads = new PrismaStaffReservationReader(first!);
          const staff =
            action === "cancel"
              ? new CancelReservation({
                  paid: {
                    execute: async () => {
                      throw new Error("unpaid path only");
                    },
                  },
                  clock: staffClock,
                  reads,
                  ids: new Cuid2IdGenerator(),
                  unitOfWork: new PrismaReservationUnitOfWork(first!, (tx) => {
                    const context = cancelReservationContext(tx);
                    return { ...context, audit: paused.wrap(context.audit) };
                  }),
                }).execute(
                  reception,
                  reservation.id,
                  reservation.version,
                  cancelInput,
                )
              : new RecordFrontDeskTransition(
                  {
                    clock: staffClock,
                    reads,
                    unitOfWork: new PrismaReservationUnitOfWork(
                      first!,
                      (tx) => {
                        const context = frontDeskTransitionContext(tx);
                        return {
                          ...context,
                          audit: paused.wrap(context.audit),
                        };
                      },
                    ),
                  },
                  "MARK_NO_SHOW",
                ).execute(reception, reservation.id, reservation.version);
          await waitAtAudit(paused.reached, staff);
          const waiting = requestCancellation({
            client: second!,
            clock: staffClock,
          }).execute(access, {});
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            paused.release();
            await Promise.allSettled([staff, waiting]);
          }
          expect((await staff).ok).toBe(true);
          expect(await waiting).toMatchObject({
            ok: false,
            error: {
              code: "INVALID_TRANSITION",
              context: {
                status: action === "cancel" ? "CANCELLED" : "NO_SHOW",
              },
            },
          });
        });
        expect(await client.cancellationRequest.count()).toBe(0);
        expect(await requestAudits("closed")).toEqual([]);
        expect(await requestAudits("created")).toEqual([]);
        expect(await queue(reservation.id)).toEqual([]);
      }
    },
  );

  it("refuses the old manage link and old session after staff reassign the reservation", async () => {
    for (let round = 0; round < 20; round++) {
      if (round > 0) await resetDatabase(client);
      const { reservation, access, phone } = await book();
      // S5 can change the phone on an external booking, which may also have a manage link.
      await client.reservation.update({
        where: { id: reservation.id },
        data: {
          source: "EXTERNAL",
          externalReference: "REASSIGNMENT-EXTERNAL",
          createdById: admin.id,
          // Only website bookings record a verification channel (M9-T12a CHECK).
          verificationChannel: null,
        },
      });
      const sessionAccess = await guestSession(phone, reservation.reference);
      await withIndependentClients(3, async ([first, g2, g4]) => {
        const paused = pauseAuditWrite();
        const reassignment = new UpdateReservationGuest({
          clock,
          reads: new PrismaStaffReservationReader(first!),
          ids: new Cuid2IdGenerator(),
          unitOfWork: new PrismaReservationUnitOfWork(first!, (tx) => {
            const context = frontDeskTransitionContext(tx);
            return { ...context, audit: paused.wrap(context.audit) };
          }),
        }).execute(reception, reservation.id, reservation.version, {
          guest: { phone: phoneOf(2) },
        });
        await waitAtAudit(paused.reached, reassignment);
        const withLink = requestCancellation({ client: g2!, clock }).execute(
          access,
          {},
        );
        const withSession = requestCancellation({ client: g4!, clock }).execute(
          sessionAccess,
          {},
        );
        try {
          await waitForLockWaiters(client, 2);
        } finally {
          paused.release();
          await Promise.allSettled([reassignment, withLink, withSession]);
        }
        expect((await reassignment).ok).toBe(true);
        expect(await withLink).toMatchObject({
          ok: false,
          error: { code: "UNAUTHENTICATED" },
        });
        expect(await withSession).toMatchObject({
          ok: false,
          error: { code: "NOT_FOUND" },
        });
      });
      expect(await client.cancellationRequest.count()).toBe(0);
      expect(await requestAudits("created")).toEqual([]);
      expect(await queue(reservation.id)).toEqual([]);
    }
  });

  it("rechecks and refuses a session invalidated by a real staff block while the request waits", async () => {
    for (let round = 0; round < 20; round++) {
      if (round > 0) await resetDatabase(client);
      const { reservation, phone } = await book();
      if (!reservation.guestId) throw new Error("Expected a linked guest.");
      const access = await guestSession(phone, reservation.reference);
      await withIndependentClients(2, async ([first, second]) => {
        const paused = pauseAuditWrite();
        const blocking = new ChangeGuestBlock(
          {
            clock,
            reader: new PrismaGuestDirectoryReader(first!),
            history: new PrismaGuestHistoryReader(first!),
            unitOfWork: new PrismaReservationUnitOfWork(first!, (tx) => ({
              guests: new PrismaGuestRepository(tx),
              verifications: new PrismaPhoneVerificationRepository(tx),
              audit: paused.wrap(new PrismaAuditLog(tx)),
            })),
          },
          "BLOCK",
        ).execute(admin, reservation.guestId!, "Test block");
        await waitAtAudit(paused.reached, blocking);
        const waiting = requestCancellation({ client: second!, clock }).execute(
          access,
          {},
        );
        try {
          await waitForLockWaiters(client, 1);
        } finally {
          paused.release();
          await Promise.allSettled([blocking, waiting]);
        }
        expect((await blocking).ok).toBe(true);
        expect(await waiting).toMatchObject({
          ok: false,
          error: { code: "PHONE_NOT_VERIFIED" },
        });
      });
      expect(await client.cancellationRequest.count()).toBe(0);
      expect(await requestAudits("created")).toEqual([]);
      expect(await queue(reservation.id)).toEqual([]);
    }
  });

  it.each(["duplicate", "staff cancellation"] as const)(
    "serializes a request against %s",
    async (rival) => {
      for (let round = 0; round < 20; round++) {
        if (round > 0) await resetDatabase(client);
        const { reservation, access } = await book();
        await withIndependentClients(2, async ([first, second]) => {
          const paused = pausedRequest(first!);
          const firstRequest = paused.useCase.execute(access, {});
          await Promise.race([
            paused.reached,
            firstRequest.then(() => {
              throw new Error("Request completed before its audit barrier.");
            }),
          ]);
          const waiting =
            rival === "duplicate"
              ? requestCancellation({ client: second!, clock }).execute(
                  access,
                  {},
                )
              : staffReservationCommands({
                  client: second!,
                  clock,
                }).cancel.execute(
                  reception,
                  reservation.id,
                  reservation.version,
                  cancelInput,
                );
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            paused.release();
            await Promise.allSettled([firstRequest, waiting]);
          }
          expect((await firstRequest).ok).toBe(true);
          expect(await waiting).toMatchObject(
            rival === "duplicate"
              ? { ok: false, error: { code: "CANCELLATION_REQUEST_EXISTS" } }
              : { ok: true },
          );
        });
        expect(await client.cancellationRequest.findMany()).toEqual([
          expect.objectContaining({
            status: rival === "duplicate" ? "OPEN" : "CLOSED",
          }),
        ]);
        expect(await requestAudits("created")).toHaveLength(1);
        expect(await requestAudits("closed")).toHaveLength(
          rival === "duplicate" ? 0 : 1,
        );
        expect(await queue(reservation.id)).toHaveLength(3);
      }
    },
  );

  it.each(["link rotation", "guest block"] as const)(
    "rechecks access after waiting for a %s to commit",
    async (change) => {
      for (let round = 0; round < 20; round++) {
        if (round > 0) await resetDatabase(client);
        const { reservation, access } = await book();
        await withIndependentClients(2, async ([first, second]) => {
          const modified = deferred();
          const release = deferred();
          const changeAccess = first!.$transaction(async (transaction) => {
            if (change === "link rotation")
              await transaction.reservation.update({
                where: { id: reservation.id },
                data: { manageTokenHash: "a".repeat(64) },
              });
            else
              await transaction.guest.update({
                where: { id: reservation.guestId! },
                data: {
                  blockedAt: NOW,
                  blockedById: admin.id,
                  blockReason: "Test block",
                },
              });
            modified.resolve();
            await release.promise;
          });
          await Promise.race([
            modified.promise,
            changeAccess.then(() => {
              throw new Error("Access change completed before its barrier.");
            }),
          ]);
          const waiting = requestCancellation({
            client: second!,
            clock,
          }).execute(access, {});
          try {
            await waitForLockWaiters(client, 1);
          } finally {
            release.resolve();
            await Promise.allSettled([changeAccess, waiting]);
          }
          await changeAccess;
          expect(await waiting).toMatchObject({
            ok: false,
            error: {
              code:
                change === "link rotation"
                  ? "UNAUTHENTICATED"
                  : "PHONE_BLOCKED",
            },
          });
        });
        expect(await client.cancellationRequest.count()).toBe(0);
        expect(await requestAudits("created")).toEqual([]);
        expect(await queue(reservation.id)).toEqual([]);
      }
    },
  );
});

it("leaves an existing booking viewable by the link after staff block its phone", async () => {
  const { reservation, access } = await book();
  if (!reservation.guestId) throw new Error("Expected a linked guest.");
  expect(
    (
      await staffGuests({ client, clock }).block.execute(
        admin,
        reservation.guestId,
        "Test block",
      )
    ).ok,
  ).toBe(true);
  expect(
    await guestReservationReads({ client, clock }).view.execute(access.token),
  ).toMatchObject({
    ok: true,
    value: { reference: reservation.reference, allowedActions: [] },
  });
  expect(
    await requestCancellation({ client, clock }).execute(access, {}),
  ).toMatchObject({ ok: false, error: { code: "PHONE_BLOCKED" } });
});

it("checks the stored phone on a legacy unlinked booking and distinguishes a link actor in audit", async () => {
  const { reservation, access } = await book();
  if (!reservation.guestId) throw new Error("Expected a linked guest.");
  const staff = staffGuests({ client, clock });
  expect(
    (await staff.block.execute(admin, reservation.guestId, "Test block")).ok,
  ).toBe(true);
  await client.reservation.update({
    where: { id: reservation.id },
    data: {
      guestId: null,
      source: "EXTERNAL",
      externalReference: "LEGACY-EXTERNAL",
      verificationChannel: null,
    },
  });
  const view = guestReservationReads({ client, clock }).view;
  const request = requestCancellation({ client, clock });
  expect(await view.execute(access.token)).toMatchObject({
    ok: true,
    value: { allowedActions: [] },
  });
  expect(await request.execute(access, {})).toMatchObject({
    ok: false,
    error: { code: "PHONE_BLOCKED" },
  });
  expect(await client.cancellationRequest.count()).toBe(0);
  expect(
    (await staff.unblock.execute(admin, reservation.guestId, "Test unblock"))
      .ok,
  ).toBe(true);
  expect(await view.execute(access.token)).toMatchObject({
    ok: true,
    value: { allowedActions: ["REQUEST_CANCELLATION", "CHANGE_RESERVATION"] },
  });
  expect((await request.execute(access, {})).ok).toBe(true);
  expect(await requestAudits("created")).toEqual([
    expect.objectContaining({
      actorId: reservation.id,
      changes: {
        reservationId: reservation.id,
        access: "MANAGE_TOKEN",
        reasonProvided: false,
        actorIdentity: "RESERVATION_LINK",
      },
    }),
  ]);
});
