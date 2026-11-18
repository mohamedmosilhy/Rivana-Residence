import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  seedDemoCommercial,
  seedDemoInventory,
  seedDemoReservations,
} from "../../prisma/seed/demo";
import { seedWhatsAppSettings } from "../../prisma/seed/whatsapp";
import { parseWhatsAppTemplateInput } from "@/domain/notifications";
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
    include: { rooms: { include: { nights: true } }, redemption: true },
  }),
  guests: await client.guest.findMany({ orderBy: { id: "asc" } }),
  sync: await client.branchSyncCheckpoint.findMany({ orderBy: { id: "asc" } }),
  templates: await client.whatsAppTemplate.findMany({ orderBy: { id: "asc" } }),
  settings: await client.whatsAppSettings.findMany(),
});
describe("M8 create only seed", () => {
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
      created: 6,
    });
    const state = await snapshot();
    expect(new Set(state.reservations.map((row) => row.status))).toEqual(
      new Set([
        "CONFIRMED",
        "CHECKED_IN",
        "CHECKED_OUT",
        "CANCELLED",
        "NO_SHOW",
      ]),
    );
    expect(state.reservations.every((row) => row.branchId === "demo")).toBe(
      true,
    );
    for (const row of state.reservations)
      expect(row.reference).toMatch(
        /^RR-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/,
      );
    const websites = state.reservations.filter(
      (row) => row.source === "WEBSITE",
    );
    expect(websites.filter((row) => row.pmsEnteredAt === null)).toHaveLength(1);
    expect(websites.filter((row) => row.pmsEnteredAt !== null)).toHaveLength(1);
    expect(state.guests.filter((row) => row.blockedAt !== null)).toHaveLength(
      1,
    );
    expect(await client.couponRedemption.count()).toBe(1);
    expect(state.sync.map((row) => row.kind)).toEqual(["STARTED", "COMPLETED"]);
    expect(state.templates).toHaveLength(2);
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
  it("preserves edits to reservations, guests, templates, sync and configuration on rerun", async () => {
    await seedDemoReservations(client, "actor-admin");
    await client.reservation.updateMany({
      data: { internalNotes: "Edited by staff" },
    });
    await client.guest.updateMany({ data: { name: "Edited by staff" } });
    await client.whatsAppTemplate.updateMany({
      data: { providerName: "staff_name", active: true },
    });
    await client.branchSyncCheckpoint.updateMany({
      data: { note: "Edited by staff" },
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
