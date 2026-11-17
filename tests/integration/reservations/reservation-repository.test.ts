import { format } from "node:util";
import { QuoteCalculator, type QuoteCouponValue } from "@/domain/pricing";
import { Money } from "@/domain/shared/money";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reservationUnitOfWork } from "@/composition/reservations";
import { failure, success } from "@/application/shared/result";
import { PhoneNumber } from "@/domain/guests";
import { auditEvent } from "@/domain/audit";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import {
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  at,
  local,
  reservationInput,
} from "./support/reservation-repositories";

const client = createTestClient();
const repository = new PrismaReservationRepository(client);
let roomId: string;
beforeEach(async () => {
  await resetDatabase(client);
  roomId = (await createRoom(client)).id;
});
afterAll(async () => {
  await client.$disconnect();
  await getPrisma().$disconnect();
});

const event = () =>
  auditEvent({
    occurredAt: at,
    actorType: "SYSTEM",
    actorId: null,
    action: "branch.created",
    entityType: "Branch",
    entityId: TEST_BRANCH_ID,
    branchId: TEST_BRANCH_ID,
    reason: null,
    changes: {
      name: "Foundation transaction",
      slug: "new-cairo",
      status: "ACTIVE",
    },
  });

describe("reservation aggregate storage", () => {
  it("round trips header, contact, room dates, money and nightly provenance", async () => {
    const input = reservationInput(roomId, {
      manageTokenHash: "a".repeat(64),
      manageTokenExpiresAt: at,
      idempotencyKeyHash: "key",
      requestFingerprint: "b".repeat(64),
    });
    const result = await repository.insert(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: input.id,
        reference: input.reference,
        version: 1,
        contact: {
          fullName: input.contact.fullName,
          phone: input.contact.phone?.value,
        },
        snapshot: input.snapshot,
        createdAt: at,
        updatedAt: at,
        manageTokenHash: input.manageTokenHash,
        lines: [
          { ...input.lines[0], stay: input.stay, consumesInventory: true },
        ],
      },
    });
    expect(
      await repository.findByReference(TEST_BRANCH_ID, input.reference),
    ).toEqual(result.ok ? result.value : undefined);
  });

  it("stores several room lines and a service price snapshot with details", async () => {
    const input = reservationInput(roomId);
    const snapshot = {
      accommodationMinor: 400,
      servicesMinor: 100,
      subtotalMinor: 500,
      discountMinor: 0,
      taxableMinor: 500,
      vatRateBasisPoints: 1500,
      vatMinor: 75,
      totalMinor: 575,
      couponValue: null,
      serviceLines: [
        {
          kind: "AIRPORT_TRANSFER",
          unit: "PER_BOOKING" as const,
          priceMinor: 100,
          childPriceMinor: null,
          adults: 4,
          children: 0,
          nights: 2,
          adultQuantity: 1,
          childQuantity: 0,
          amountMinor: 100,
          details: "Flight TEST123",
        },
      ],
    };
    const result = await repository.insert({
      ...input,
      snapshot,
      lines: [
        input.lines[0]!,
        { ...input.lines[0]!, id: input.id + "-second" },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        snapshot,
        lines: [{ consumesInventory: true }, { consumesInventory: true }],
      },
    });
    expect(await client.reservationNight.count()).toBe(4);
  });

  it("preserves an entirely unpriced external snapshot and null amounts", async () => {
    const input = reservationInput(roomId, {
      source: "EXTERNAL",
      externalReference: "PMS-123",
      snapshot: null,
    });
    const result = await repository.insert({
      ...input,
      lines: input.lines.map((line) => ({
        ...line,
        subtotal: null,
        nights: line.nights.map((night) => ({
          ...night,
          amount: null,
          source: null,
        })),
      })),
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        snapshot: null,
        externalReference: "PMS-123",
        lines: [
          {
            subtotal: null,
            nights: [
              { amount: null, source: null },
              { amount: null, source: null },
            ],
          },
        ],
      },
    });
  });

  it("hides a missing or foreign branch reservation by id and reference", async () => {
    const input = reservationInput(roomId);
    expect((await repository.insert(input)).ok).toBe(true);
    await createBranch(client, { id: "other", slug: "other" });
    expect(await repository.findById("other", input.id)).toBeNull();
    expect(
      await repository.findByReference("other", input.reference),
    ).toBeNull();
    expect(await repository.findById(TEST_BRANCH_ID, "missing")).toBeNull();
  });

  it("reports reference collision without poisoning the transaction and allows retry", async () => {
    const first = reservationInput(roomId);
    expect((await repository.insert(first)).ok).toBe(true);
    const retry = reservationInput(roomId);
    const result = await reservationUnitOfWork().run(
      async ({ reservations }) => {
        expect(
          await reservations.insert({ ...retry, reference: first.reference }),
        ).toEqual(success(null));
        return reservations.insert(retry);
      },
    );
    expect(result).toMatchObject({ ok: true, value: { id: retry.id } });
    expect(await client.reservation.count()).toBe(2);
  });

  it("rolls back the header when a child belongs to another branch", async () => {
    await createBranch(client, { id: "other", slug: "other" });
    const foreign = await createRoom(client, { branchId: "other" });
    const input = reservationInput(foreign.id);
    expect(await repository.insert(input)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await client.reservation.count()).toBe(0);
    expect(await client.reservationNight.count()).toBe(0);
  });

  it("returns conflict for duplicate idempotency keys and leaves no partial aggregate", async () => {
    expect(
      (
        await repository.insert(
          reservationInput(roomId, {
            idempotencyKeyHash: "shared-key",
            requestFingerprint: "a".repeat(64),
          }),
        )
      ).ok,
    ).toBe(true);
    expect(
      await repository.insert(
        reservationInput(roomId, {
          idempotencyKeyHash: "shared-key",
          requestFingerprint: "a".repeat(64),
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await client.reservation.count()).toBe(1);
    expect(await client.reservationRoom.count()).toBe(1);
  });

  it.each(["CANCELLED", "NO_SHOW", "PAYMENT_FAILED"] as const)(
    "derives released room consumption for %s",
    async (status) => {
      const result = await repository.insert(
        reservationInput(roomId, { status }),
      );
      expect(result).toMatchObject({
        ok: true,
        value: { lines: [{ consumesInventory: false }] },
      });
    },
  );

  it.each(["commit", "failed result", "exception"])(
    "binds guest, reservation, inventory and audit to one transaction: %s",
    async (outcome) => {
      const input = reservationInput(roomId);
      const operation = () =>
        reservationUnitOfWork().run(
          async ({ guests, reservations, consumption, audit }) => {
            const identity = await guests.ensureExists({
              id: "guest-transaction",
              phone: PhoneNumber.parse("+201001234567"),
              name: "Fictional Guest",
              email: null,
              at,
            });
            expect(
              (await guests.lockByPhone(PhoneNumber.parse(identity.phone))).ok,
            ).toBe(true);
            const inserted = await reservations.insert({
              ...input,
              guestId: identity.id,
            });
            if (!inserted.ok) return inserted;
            expect(
              await consumption.readSoldOnDates({
                branchId: TEST_BRANCH_ID,
                roomTypeIds: [roomId],
                nights: [local("2031-07-04")],
              }),
            ).toMatchObject([{ sold: 1 }]);
            // An independent connection cannot see any uncommitted writes.
            expect(await client.reservation.count()).toBe(0);
            expect(await client.guest.count()).toBe(0);
            await audit.append(event());
            if (outcome === "exception") throw new Error("injected failure");
            return outcome === "failed result"
              ? failure("CONFLICT", "Injected refusal")
              : success(input.id);
          },
        );
      if (outcome === "exception")
        await expect(operation()).rejects.toThrow("injected failure");
      else expect((await operation()).ok).toBe(outcome === "commit");
      const expected = outcome === "commit" ? 1 : 0;
      expect(await client.reservation.count()).toBe(expected);
      expect(await client.reservationRoom.count()).toBe(expected);
      expect(await client.reservationNight.count()).toBe(expected * 2);
      expect(await client.guest.count()).toBe(expected);
      expect(await client.auditEvent.count()).toBe(expected);
    },
  );
});

it.each(["PERCENT", "FIXED"] as const)(
  "round trips %s coupon money and keeps the snapshot after coupon edits",
  async (kind) => {
    const couponId = "repo-coupon";
    const code = "SNAPSHOT";
    const couponValue: QuoteCouponValue =
      kind === "PERCENT"
        ? { kind, percentBasisPoints: 1250 }
        : { kind, amount: Money.create({ amountMinor: 500, currency: "USD" }) };
    await client.coupon.create({
      data: {
        id: couponId,
        code,
        kind,
        allBranches: true,
        percentBasisPoints: kind === "PERCENT" ? 1250 : null,
        amountMinor: kind === "FIXED" ? 500 : null,
      },
    });
    const input = reservationInput(roomId, { couponId, couponCode: code });
    const quote = QuoteCalculator.compute({
      lines: input.lines.map((line) => ({
        nights: line.nights.map(({ night, amount }) => ({
          night,
          amount,
          source: null,
          periodId: null,
          label: null,
        })),
      })),
      guests: { adults: 2, children: 0 },
      services: [],
      coupon: couponValue,
      vatRateBasisPoints: 1500,
    });
    const snapshot = { ...quote, couponValue, serviceLines: [] };
    const inserted = await repository.insert({ ...input, snapshot });
    expect(inserted).toMatchObject({
      ok: true,
      value: {
        couponId,
        couponCode: code,
        snapshot: {
          couponValue,
          discountMinor: kind === "PERCENT" ? 25 : 200,
          taxableMinor: kind === "PERCENT" ? 175 : 0,
          vatMinor: kind === "PERCENT" ? 26 : 0,
          totalMinor: kind === "PERCENT" ? 201 : 0,
        },
      },
    });
    const stored = await client.reservation.findUniqueOrThrow({
      where: { id: input.id },
    });
    expect(stored).toMatchObject({
      couponKind: kind,
      couponValue: kind === "PERCENT" ? 1250 : 500,
      couponId,
      couponCode: code,
    });
    await client.coupon.update({
      where: { id: couponId },
      data: {
        code: "EDITED",
        active: false,
        ...(kind === "PERCENT"
          ? { percentBasisPoints: 9999 }
          : { amountMinor: 1 }),
      },
    });
    const read = await repository.findById(TEST_BRANCH_ID, input.id);
    expect(read?.snapshot).toEqual(
      inserted.ok ? inserted.value?.snapshot : undefined,
    );
    expect(read?.couponCode).toBe(code);
    expect(await client.couponRedemption.count()).toBe(0);
  },
);

it("keeps guest data and token hashes out of captured storage output and conflict messages", async () => {
  const phone = PhoneNumber.parse("+201009876543");
  const input = reservationInput(roomId, {
    contact: {
      fullName: "Distinct Fictional Guest",
      email: "distinct-storage@example.test",
      phone,
      country: "EG",
      specialRequests: "Distinct private request",
    },
    manageTokenHash: "c".repeat(64),
    idempotencyKeyHash: "distinct-storage-key",
    requestFingerprint: "d".repeat(64),
  });
  const spies = (["log", "info", "warn", "error", "debug"] as const).map(
    (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
  );
  try {
    const inserted = await reservationUnitOfWork().run(
      async ({ guests, reservations }) => {
        const guest = await guests.ensureExists({
          id: "output-guest",
          phone,
          name: input.contact.fullName,
          email: input.contact.email,
          at,
        });
        const locked = await guests.lockByPhone(phone);
        if (!locked.ok) return locked;
        await guests.updateContact({
          id: guest.id,
          name: input.contact.fullName,
          email: input.contact.email,
          at,
        });
        return reservations.insert({ ...input, guestId: guest.id });
      },
    );
    expect(inserted).toMatchObject({ ok: true, value: { id: input.id } });
    const conflict = await repository.insert({
      ...reservationInput(roomId),
      contact: input.contact,
      manageTokenHash: input.manageTokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestFingerprint: input.requestFingerprint,
    });
    expect(conflict).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const captured = spies
      .flatMap((spy) => spy.mock.calls.map((args) => format(...args)))
      .join("\n");
    const exposed = captured + JSON.stringify(conflict);
    for (const value of [
      input.contact.fullName,
      input.contact.email!,
      phone.value,
      input.contact.specialRequests!,
      input.manageTokenHash!,
      input.idempotencyKeyHash!,
      input.requestFingerprint!,
    ])
      expect(exposed).not.toContain(value);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
