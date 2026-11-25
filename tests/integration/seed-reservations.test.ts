import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  seedDemoCommercial,
  seedDemoInventory,
  seedDemoReservations,
} from "../../prisma/seed/demo";
import { seedWhatsAppSettings } from "../../prisma/seed/whatsapp";
import { parseWhatsAppTemplateInput } from "@/domain/notifications";
import { PrismaSyncCheckpointRepository } from "@/infrastructure/db/prisma/repositories/reservations/sync-checkpoint-repository";
import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

const client = createTestClient();
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await createBranch(client, { id: "demo", slug: "demo-giza" });
  await createRoom(client, { branchId: "demo", slug: "giza-garden-room" });
  await createRoom(client, { branchId: "demo", slug: "giza-family-apartment" });
  await seedDemoInventory(client);
  await seedDemoCommercial(client);
});
afterAll(() => client.$disconnect());
const snapshot = async () => ({
  reservations: await client.reservation.findMany({
    orderBy: { id: "asc" },
    include: {
      rooms: { include: { nights: true } },
      redemption: true,
      services: true,
      payments: { include: { events: true } },
      cancellationRequests: true,
    },
  }),
  guests: await client.guest.findMany({ orderBy: { id: "asc" } }),
  sync: await client.branchSyncCheckpoint.findMany({ orderBy: { id: "asc" } }),
  templates: await client.whatsAppTemplate.findMany({ orderBy: { id: "asc" } }),
  settings: await client.whatsAppSettings.findMany(),
});
describe("create only reservation seed", () => {
  it("restores missing settings without overwriting configured values or adding templates", async () => {
    await client.whatsAppSettings.deleteMany();
    await seedWhatsAppSettings(client);
    expect(await client.whatsAppSettings.findFirst()).toMatchObject({
      id: "default",
      businessPhoneNumber: null,
    });
    await client.whatsAppSettings.update({
      where: { id: "default" },
      data: {
        businessPhoneNumber: "+12025550109",
        providerPhoneNumberId: "staff-configured",
      },
    });
    const before = await snapshot();
    await seedWhatsAppSettings(client);
    expect(await snapshot()).toEqual(before);
    expect(await client.whatsAppTemplate.count()).toBe(0);
  });
  it("adds all M8 states, PMS markers, redemption, blocked guest and sync only in the demo branch", async () => {
    expect(await seedDemoReservations(client, "actor-admin")).toEqual({
      created: 8,
    });
    const state = await snapshot();
    expect(new Set(state.reservations.map((row) => row.status))).toEqual(
      new Set([
        "CONFIRMED",
        "CHECKED_IN",
        "CHECKED_OUT",
        "CANCELLED",
        "NO_SHOW",
        "PAYMENT_FAILED",
      ]),
    );
    expect(state.reservations.every((row) => row.branchId === "demo")).toBe(
      true,
    );
    expect(
      state.reservations.find((row) => row.status === "CHECKED_IN"),
    ).toMatchObject({
      checkIn: new Date("2027-03-04"),
      checkOut: new Date("2027-03-07"),
      accommodationMinor: 18_000,
      rooms: [
        {
          physicalRoomId: expect.any(String),
          nights: expect.arrayContaining(
            ["04", "05", "06"].map((day) =>
              expect.objectContaining({
                night: new Date(`2027-03-${day}`),
                amountMinor: 6000,
              }),
            ),
          ),
        },
      ],
    });
    for (const row of state.reservations)
      expect(row.reference).toMatch(
        /^RR-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/,
      );
    expect(
      state.reservations.find((row) => row.source === "EXTERNAL"),
    ).toMatchObject({
      externalChannel: "Fictional partner",
      externalReference: "FICTIONAL-EXT-1",
      totalMinor: null,
    });
    const websites = state.reservations.filter(
      (row) => row.source === "WEBSITE",
    );
    expect(
      websites
        .filter((row) => row.pmsEnteredAt === null)
        .map((row) => row.reference),
    ).toEqual(["RR-DEM00001", "RR-DEM00007", "RR-DEM00008"]);
    expect(websites.filter((row) => row.pmsEnteredAt !== null)).toHaveLength(1);
    expect(websites.find((row) => row.pmsEnteredAt !== null)).toMatchObject({
      servicesMinor: 3000,
      subtotalMinor: 9000,
      totalMinor: 10_350,
      services: [{ kind: "AIRPORT_TRANSFER", vehicles: 1, amountMinor: 3000 }],
    });
    expect(state.guests.filter((row) => row.blockedAt !== null)).toHaveLength(
      1,
    );
    expect(await client.couponRedemption.count()).toBe(1);
    expect(await client.reservationChange.count()).toBe(1);
    const demoChange = await client.reservationChange.findFirstOrThrow({
      include: { reservation: true },
    });
    expect(demoChange.oldTotalMinor).toBe(demoChange.reservation.totalMinor);
    expect((demoChange.before as { totalMinor: number }).totalMinor).toBe(
      demoChange.reservation.totalMinor,
    );
    expect(
      await client.reservation.count({
        where: { pmsUpdatePendingSince: { not: null } },
      }),
    ).toBe(1);
    expect(state.sync.map((row) => row.kind)).toEqual(["STARTED", "COMPLETED"]);
    const checkpoints = new PrismaSyncCheckpointRepository(client);
    const completedAt = new Date("2026-11-01T01:00:00Z");
    expect(await checkpoints.read("demo")).toEqual(completedAt);
    expect(await checkpoints.readStatus("demo")).toMatchObject({
      lastCompletedAt: completedAt,
      lastCompletedBy: "actor-admin",
      notEnteredInHotelSystem: 2,
    });
    expect(await checkpoints.read(TEST_BRANCH_ID)).toBeNull();
    expect(await checkpoints.readStatus(TEST_BRANCH_ID)).toMatchObject({
      lastCompletedAt: null,
      notEnteredInHotelSystem: 0,
      oldestNotEnteredAt: null,
    });
    expect(state.templates).toHaveLength(9);
    expect(state.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          purpose: "CHANGE_REQUEST_RECEIVED",
          active: false,
          variables: ["guestFirstName", "reference"],
        }),
        expect.objectContaining({
          purpose: "CHANGE_REQUEST_APPROVED",
          active: false,
          variables: ["reference", "checkIn", "checkOut", "total"],
        }),
        expect.objectContaining({
          purpose: "CHANGE_REQUEST_REJECTED",
          active: false,
          variables: ["reference", "reason"],
        }),
        expect.objectContaining({
          purpose: "RESERVATION_MODIFIED",
          active: false,
          variables: [
            "reference",
            "previousCheckIn",
            "previousCheckOut",
            "previousTotal",
            "checkIn",
            "checkOut",
            "total",
          ],
        }),
        expect.objectContaining({
          purpose: "MANAGE_LINK",
          active: false,
          variables: ["reference", "manageLink"],
        }),
      ]),
    );
    expect(state.templates).toContainEqual(
      expect.objectContaining({
        purpose: "CANCELLATION_RECEIVED",
        active: false,
        variables: ["guestFirstName", "reference"],
      }),
    );
    expect(state.templates).toContainEqual(
      expect.objectContaining({
        purpose: "PAYMENT_NOT_COMPLETED",
        active: false,
        variables: ["guestFirstName", "reference", "holdExpiresAt"],
      }),
    );
    expect(
      state.templates.every(
        (row) => !row.active && row.providerName.startsWith("fictional_demo_"),
      ),
    ).toBe(true);
    // M8-T4: demo templates satisfy the per purpose allowlist.
    for (const row of state.templates) {
      expect(
        parseWhatsAppTemplateInput({
          purpose: row.purpose,
          language: row.language,
          providerName: row.providerName,
          category: row.category,
          variables: row.variables,
          previewText: row.previewText,
          active: row.active,
        }).ok,
      ).toBe(true);
    }
    expect(
      await client.reservation.count({ where: { branchId: TEST_BRANCH_ID } }),
    ).toBe(0);
    expect(await client.notificationOutbox.count()).toBe(0);
    expect(state.settings[0]?.businessPhoneNumber).toBeNull();
    expect(await seedDemoReservations(client, "actor-admin")).toEqual({
      created: 0,
    });
    expect(await snapshot()).toEqual(state);
  });
  it("M9-T1 adds payment, event and cancellation examples only to the demo branch", async () => {
    await seedDemoReservations(client, "actor-admin");
    const state = await snapshot();
    const failed = state.reservations.find(
      (row) => row.reference === "RR-DEM00007",
    );
    const createdAt = new Date("2026-10-31T23:47:00Z");
    const expiredAt = new Date("2026-11-01T00:00:00Z");
    expect(failed).toMatchObject({
      branchId: "demo",
      status: "PAYMENT_FAILED",
      paymentMethod: "ONLINE",
      paymentStatus: "FAILED",
      createdAt,
      statusChangedAt: expiredAt,
      rooms: [{ consumesInventory: false }],
      payments: [
        {
          provider: "fake",
          amountMinor: failed?.totalMinor,
          currency: "USD",
          status: "EXPIRED",
          createdAt,
          expiresAt: expiredAt,
          events: [
            {
              outcome: "SESSION_CLOSED",
              result: "APPLIED",
              receivedAt: expiredAt,
            },
          ],
        },
      ],
    });
    expect(
      state.reservations.find((row) => row.reference === "RR-DEM00008"),
    ).toMatchObject({
      branchId: "demo",
      status: "CONFIRMED",
      cancellationRequests: [{ status: "OPEN", requestedBy: "GUEST" }],
    });
    expect(await client.notificationOutbox.count()).toBe(0);
    expect(
      await client.branch.count({ where: { onlinePaymentEnabled: true } }),
    ).toBe(0);
  });
  it("preserves edits to reservations, guests, templates, sync and configuration on rerun", async () => {
    await seedDemoReservations(client, "actor-admin");
    await client.reservation.updateMany({
      data: { internalNotes: "Edited by staff" },
    });
    await client.reservationService.updateMany({
      data: { details: "Edited pickup" },
    });
    await client.guest.updateMany({ data: { name: "Edited by staff" } });
    await client.whatsAppTemplate.updateMany({
      data: { providerName: "staff_name", active: true },
    });
    await client.branchSyncCheckpoint.updateMany({
      data: { note: "Edited by staff" },
    });
    await client.cancellationRequest.updateMany({
      data: { status: "CLOSED", closedReason: "STAFF_CANCELLED" },
    });
    const before = await snapshot();
    await seedDemoReservations(client, "actor-admin");
    expect(await snapshot()).toEqual(before);
  });
  it("rolls back all new fixtures on reference collision instead of adopting staff data", async () => {
    await client.reservation.create({
      data: {
        id: "staff",
        reference: "RR-DEM00003",
        branchId: "demo",
        source: "EXTERNAL",
        status: "CONFIRMED",
        externalReference: "STAFF-EXT",
        guestName: "Staff entry",
        checkIn: new Date("2027-01-01"),
        checkOut: new Date("2027-01-02"),
        statusChangedAt: new Date("2026-11-15"),
      },
    });
    const before = await snapshot();
    await expect(
      seedDemoReservations(client, "actor-admin"),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await snapshot()).toEqual(before);
  });
  it("writes nothing when a required demo listing is missing", async () => {
    await client.room.updateMany({
      where: { slug: "giza-garden-room" },
      data: { slug: "renamed" },
    });
    const before = await snapshot();
    await expect(
      seedDemoReservations(client, "actor-admin"),
    ).rejects.toMatchObject({ code: "P2025" });
    expect(await snapshot()).toEqual(before);
  });
});
