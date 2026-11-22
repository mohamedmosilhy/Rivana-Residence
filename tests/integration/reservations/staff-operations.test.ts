import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import {
  staffReservationCommands,
  staffReservationQueries,
} from "@/composition/reservations";
import { StaffReservationDetail } from "@/contracts/api/v1/reservations";
import { LocalDate } from "@/domain/shared/local-date";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { failure } from "@/application/shared/result";
import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { blockUseCase } from "./support/blocks";
import { deferred, withIndependentClients } from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
  seedBranch,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

const principals = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    principals.get(headers.get("x-test-staff") ?? "") ?? null,
  throttleKeys: () => new HmacThrottleKeys("test-staff-operation-hmac"),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));

const { PATCH: edit } = await import(
  "@/app/api/v1/staff/reservations/[id]/route"
);
const { PUT: assign } = await import(
  "@/app/api/v1/staff/reservations/[id]/rooms/[lineId]/assignment/route"
);
const { POST: checkIn } = await import(
  "@/app/api/v1/staff/reservations/[id]/check-in/route"
);
const { POST: checkOut } = await import(
  "@/app/api/v1/staff/reservations/[id]/check-out/route"
);
const { POST: noShow } = await import(
  "@/app/api/v1/staff/reservations/[id]/no-show/route"
);
const { POST: resend } = await import(
  "@/app/api/v1/staff/reservations/[id]/manage-link/route"
);
const { POST: enter } = await import(
  "@/app/api/v1/staff/reservations/[id]/pms-entry/route"
);
const { GET: history } = await import(
  "@/app/api/v1/staff/reservations/[id]/history/route"
);

const client = createTestClient();
const origin = process.env.APP_URL ?? "http://localhost:3000";
const stay = { checkIn: "2031-04-10", checkOut: "2031-04-13" };
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff-session",
};
const name = "Confidential Operations Guest";
const email = "operations-secret@example.test";
const clock = { now: () => NOW };
const commands = () => staffReservationCommands({ client, clock });
const sha256 = (token: string) =>
  createHash("sha256").update(token).digest("hex");

let counter = 0;
async function book(
  roomTypeId: string,
  options: {
    units?: number;
    stay?: typeof stay;
    noEmail?: boolean;
    external?: boolean;
  } = {},
) {
  counter++;
  const input = {
    branchId: TEST_BRANCH_ID,
    stay: options.stay ?? stay,
    lines: Array.from({ length: options.units ?? 1 }, () => ({
      roomTypeId,
      occupancy: { adults: 2, children: 0 },
    })),
    guest: { fullName: name, phone: phoneOf(counter % 100) },
  };
  const key = `operation-test-${counter}`;
  const created = options.external
    ? await commands().recordExternal.execute(
        admin,
        {
          ...input,
          guest: { ...input.guest, email },
          externalReference: key,
        },
        key,
      )
    : await commands().create.execute(
        admin,
        {
          ...input,
          guest: { ...input.guest, ...(options.noEmail ? {} : { email }) },
          sendConfirmation: false,
        },
        key,
      );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return created.value.reservation;
}

async function website() {
  const phone = phoneOf(99);
  const created = await websiteBooking(client).execute(
    bookingBody(phone, await issueToken(client, phone)),
    "operations-website-booking",
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return client.reservation.findUniqueOrThrow({
    where: { reference: created.value.reference },
  });
}

function call(
  handler: typeof edit,
  id: string,
  method: string,
  options: {
    staff?: string;
    version?: number | null;
    body?: unknown;
    lineId?: string;
    suffix?: string;
    requestOrigin?: string;
  } = {},
) {
  const {
    body,
    staff = "admin",
    version = 1,
    lineId,
    suffix = "",
    requestOrigin = origin,
  } = options;
  return handler(
    new Request(new URL(`/api/v1/staff/reservations/${id}${suffix}`, origin), {
      method,
      headers: {
        origin: requestOrigin,
        "x-test-staff": staff,
        ...(version === null ? {} : { "if-match": `"v${version}"` }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id, lineId }) },
  );
}

async function problem(
  response: Promise<Response>,
  status: number,
  code: string,
) {
  const result = await response;
  expect(result.status).toBe(status);
  expect(await result.json()).toMatchObject({ code });
}

const stored = (id: string) =>
  client.reservation.findUniqueOrThrow({
    where: { id },
    include: { rooms: { include: { nights: true } }, services: true },
  });
const outbox = (id: string) =>
  client.notificationOutbox.findMany({
    where: { reservationId: id, kind: "reservation.manage-link" },
  });
const tokenFrom = (payload: unknown) =>
  new URLSearchParams(
    new URL((payload as { manageLink: string }).manageLink).hash.slice(1),
  ).get("t")!;

beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  principals.clear();
  principals.set("admin", admin);
  principals.set("editor", { ...admin, role: "EDITOR" });
  principals.set("unassigned", { ...admin, role: "RECEPTIONIST" });
  principals.set("foreign", {
    ...admin,
    role: "MANAGER",
    branchIds: ["different-branch"],
  });
  principals.set("manager", {
    ...admin,
    role: "MANAGER",
    branchIds: [TEST_BRANCH_ID],
  });
  principals.set("reception", {
    ...admin,
    role: "RECEPTIONIST",
    branchIds: [TEST_BRANCH_ID],
  });
});
afterAll(() => client.$disconnect());

describe("staff operations on PostgreSQL", () => {
  it("S5 patches only supplied fields and redacts contact data from audit, history and logs (AC-8)", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id);
    const note = "Confidential operations note";
    const privateRequest = "Confidential guest request";
    const logs = [
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    try {
      const response = await call(edit, booking.id, "PATCH", {
        staff: "reception",
        body: {
          guest: { email: "CORRECTED@example.test", country: "eg" },
          internalNotes: note,
          specialRequests: privateRequest,
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBe('"v2"');
      expect(StaffReservationDetail.parse(await response.json())).toMatchObject(
        {
          guest: {
            fullName: name,
            email: "corrected@example.test",
            country: "EG",
            specialRequests: privateRequest,
          },
          internalNotes: note,
        },
      );
      const audit = await client.auditEvent.findFirstOrThrow({
        where: { action: "reservation.contact-edited" },
      });
      expect(audit).toMatchObject({
        reason: null,
        changes: {
          email: true,
          country: true,
          specialRequests: true,
          internalNotes: true,
        },
      });
      const responseHistory = await call(history, booking.id, "GET");
      const redacted = await responseHistory.json();
      expect(redacted.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "reservation.contact-edited",
            changes: audit.changes,
          }),
        ]),
      );
      const observed = JSON.stringify([
        redacted,
        audit,
        ...logs.flatMap((log) => log.mock.calls),
      ]);
      for (const privateValue of [
        name,
        email,
        "corrected@example.test",
        note,
        privateRequest,
        booking.contact!.phone!,
      ])
        expect(observed).not.toContain(privateValue);
      await problem(
        call(edit, booking.id, "PATCH", {
          body: { guest: { fullName: "Stale edit" } },
        }),
        412,
        "STALE_VERSION",
      );
      await problem(
        call(edit, booking.id, "PATCH", {
          version: 2,
          body: { specialRequests: "One", guest: { specialRequests: "Two" } },
        }),
        422,
        "VALIDATION",
      );
      const cleared = await call(edit, booking.id, "PATCH", {
        version: 2,
        body: {
          internalNotes: null,
          specialRequests: "",
          guest: { email: null, country: null },
        },
      });
      expect(await cleared.json()).toMatchObject({
        guest: { email: null, country: null, specialRequests: null },
        internalNotes: null,
      });
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  it.each([false, true])(
    "S5 relinks a manual booking to the normalized destination phone (external: %s)",
    async (external) => {
      const listing = await seedBookable(client);
      const booking = await book(listing.id, { external });
      const before = await stored(booking.id);
      expect(
        await commands().resendManageLink.execute(admin, booking.id),
      ).toMatchObject({ ok: true });
      const destination = phoneOf(87);
      if (external) {
        await client.guest.create({
          data: {
            id: "existing-destination",
            phone: destination,
            name: "Prior Guest",
            phoneVerifiedAt: NOW,
            marketingOptInAt: NOW,
            marketingConsentVersion: "prior",
          },
        });
      }
      const response = await call(edit, booking.id, "PATCH", {
        version: 2,
        body: { guest: { phone: destination.replace("+1", "+1 ") } },
      });
      expect(response.status).toBe(200);
      const updated = await stored(booking.id);
      expect(updated).toMatchObject({
        guestPhone: destination,
        manageTokenHash: null,
        manageTokenExpiresAt: null,
        version: 3,
      });
      expect(updated.guestId).not.toBe(before.guestId);
      const profile = await client.guest.findUniqueOrThrow({
        where: { id: updated.guestId! },
      });
      expect(profile.phone).toBe(destination);
      if (external)
        expect(profile).toMatchObject({
          id: "existing-destination",
          name: "Prior Guest",
          phoneVerifiedAt: NOW,
          marketingConsentVersion: "prior",
        });
      else expect(profile.phoneVerifiedAt).toBeNull();
      expect(
        await client.guest.findUnique({ where: { id: before.guestId! } }),
      ).toMatchObject({ phone: before.guestPhone });
    },
  );

  it.each(["replacement@example.test", null])(
    "S5 revokes a link issued to a changed or cleared email (%s)",
    async (newEmail) => {
      const listing = await seedBookable(client);
      const booking = await book(listing.id);
      expect(
        await commands().resendManageLink.execute(admin, booking.id),
      ).toMatchObject({ ok: true });
      const before = await stored(booking.id);
      const messages = await outbox(booking.id);
      const originalHash = sha256(tokenFrom(messages[0]!.payload));
      expect(before.manageTokenHash).toBe(originalHash);
      const patch = (email: string | null) =>
        call(edit, booking.id, "PATCH", {
          version: 2,
          body: { guest: { email } },
        });
      const sameEmail = await patch(email.toUpperCase());
      expect(sameEmail.status).toBe(200);
      expect(sameEmail.headers.get("etag")).toBe('"v2"');
      expect((await stored(booking.id)).manageTokenHash).toBe(originalHash);

      const changed = await patch(newEmail);
      expect(changed.status).toBe(200);
      expect(changed.headers.get("etag")).toBe('"v3"');
      expect(await stored(booking.id)).toMatchObject({
        guestId: before.guestId,
        guestEmail: newEmail,
        manageTokenHash: null,
        manageTokenExpiresAt: null,
      });
      expect(
        await client.reservation.count({
          where: { manageTokenHash: originalHash },
        }),
      ).toBe(0);
      expect(await outbox(booking.id)).toHaveLength(messages.length);
    },
  );

  it("S5 refuses a website phone change and rolls back a new profile on audit failure", async () => {
    const listing = await seedBookable(client);
    const online = await website();
    await problem(
      call(edit, online.id, "PATCH", {
        body: { guest: { phone: phoneOf(88) } },
      }),
      422,
      "VALIDATION",
    );
    expect(await stored(online.id)).toMatchObject({
      guestId: online.guestId,
      guestPhone: online.guestPhone,
      version: 1,
    });
    expect(await client.guest.count({ where: { phone: phoneOf(88) } })).toBe(0);
    const manual = await book(listing.id, {
      stay: { checkIn: "2031-04-20", checkOut: "2031-04-21" },
    });
    await client.$executeRaw`ALTER TABLE "AuditEvent" ADD CONSTRAINT "test_reject_ops_audit" CHECK (action <> 'reservation.contact-edited')`;
    try {
      await problem(
        call(edit, manual.id, "PATCH", {
          body: { guest: { phone: phoneOf(88) } },
        }),
        500,
        "INTERNAL",
      );
      expect(await stored(manual.id)).toMatchObject({ version: 1 });
      expect(await client.guest.count({ where: { phone: phoneOf(88) } })).toBe(
        0,
      );
    } finally {
      await client.$executeRaw`ALTER TABLE "AuditEvent" DROP CONSTRAINT "test_reject_ops_audit"`;
    }
  });

  it("S10 assigns and unassigns, checking sibling lines, other listings, branches, inactive units and adjacent stays", async () => {
    const listing = await seedBookable(client);
    await seedBookable(client, { slug: "second" });
    await seedBranch(client, { id: "different-branch", slug: "different" });
    await seedBookable(client, {
      branchId: "different-branch",
      slug: "foreign",
    });
    const booking = await book(listing.id, { units: 2 });
    const first = booking.lines[0]!;
    const second = booking.lines[1]!;
    const write = (
      lineId: string,
      physicalRoomId: string | null,
      version: number,
    ) =>
      call(assign, booking.id, "PUT", {
        staff: "manager",
        version,
        lineId,
        body: { physicalRoomId },
      });
    await client.physicalRoom.update({
      where: { id: "garden-unit-1" },
      data: { active: false },
    });
    for (const room of ["second-unit-0", "foreign-unit-0", "garden-unit-1"])
      await problem(write(first.id, room, 1), 404, "NOT_FOUND");
    await problem(write("missing-line", "garden-unit-0", 1), 404, "NOT_FOUND");
    const assigned = await write(first.id, "garden-unit-0", 1);
    expect(assigned.status).toBe(200);
    expect(assigned.headers.get("etag")).toBe('"v2"');
    await problem(
      write(second.id, "garden-unit-0", 2),
      409,
      "ROOM_ALREADY_ASSIGNED",
    );
    const adjacent = await book(listing.id, {
      stay: { checkIn: stay.checkOut, checkOut: "2031-04-14" },
    });
    expect(
      await commands().assignRoom.execute(
        admin,
        adjacent.id,
        adjacent.lines[0]!.id,
        1,
        "garden-unit-0",
      ),
    ).toMatchObject({ ok: true });
    expect((await write(first.id, null, 2)).status).toBe(200);
    expect(
      (await stored(booking.id)).rooms.every(
        (line) => line.physicalRoomId === null,
      ),
    ).toBe(true);
  });

  it("S11/S12 use branch dates and release checkout nights without changing priced nights or totals", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id, { units: 2 });
    const first = booking.lines[0]!;
    const second = booking.lines[1]!;
    const at = (date: string) =>
      staffReservationCommands({
        client,
        clock: { now: () => new Date(date) },
      });
    const arrival = at("2031-04-09T22:30:00Z"); // Just after midnight in Africa/Cairo.
    await problem(call(checkIn, booking.id, "POST"), 409, "INVALID_TRANSITION");
    expect(
      await commands().assignRoom.execute(
        admin,
        booking.id,
        first.id,
        1,
        "garden-unit-0",
      ),
    ).toMatchObject({ ok: true });
    expect(await arrival.checkIn.execute(admin, booking.id, 2)).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      await commands().assignRoom.execute(
        admin,
        booking.id,
        second.id,
        2,
        "garden-unit-1",
      ),
    ).toMatchObject({ ok: true });
    expect(
      await at("2031-04-09T21:30:00Z").checkIn.execute(admin, booking.id, 3),
    ).toMatchObject({ error: { code: "INVALID_TRANSITION" } });
    expect(await arrival.checkIn.execute(admin, booking.id, 3)).toMatchObject({
      ok: true,
      value: { reservation: { status: "CHECKED_IN", version: 4 } },
    });
    expect(await arrival.checkOut.execute(admin, booking.id, 4)).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      await arrival.resendManageLink.execute(admin, booking.id),
    ).toMatchObject({ ok: true });
    const before = await stored(booking.id);
    expect(before).toMatchObject({
      manageTokenHash: expect.any(String),
      manageTokenExpiresAt: new Date("2031-05-13"),
    });
    const early = at("2031-04-10T22:30:00Z");
    expect(await early.checkOut.execute(admin, booking.id, 5)).toMatchObject({
      ok: true,
      value: { reservation: { status: "CHECKED_OUT", version: 6 } },
    });
    const after = await stored(booking.id);
    expect(after).toMatchObject({
      totalMinor: before.totalMinor,
      accommodationMinor: before.accommodationMinor,
      checkOut: new Date("2031-04-11"),
      manageTokenHash: before.manageTokenHash,
      manageTokenExpiresAt: new Date("2031-05-11"),
      status: "CHECKED_OUT",
      statusChangedAt: new Date("2031-04-10T22:30:00Z"),
    });
    for (const line of after.rooms) {
      expect(line).toMatchObject({
        checkOut: after.checkOut,
        consumesInventory: true,
        nights: before.rooms.find((prior) => prior.id === line.id)!.nights,
      });
    }
    const sold = await new PrismaReservationConsumptionReader(
      client,
    ).readSoldOnDates({
      branchId: TEST_BRANCH_ID,
      roomTypeIds: [listing.id],
      nights: ["2031-04-10", "2031-04-11", "2031-04-12"].map(LocalDate.parse),
    });
    expect(sold.map(({ night, sold }) => [night.value, sold])).toEqual([
      ["2031-04-10", 2],
    ]);
    await problem(
      call(checkOut, booking.id, "POST", { version: 6 }),
      409,
      "INVALID_TRANSITION",
    );
  });

  it("S10 distinguishes a block from the database exclusion conflict", async () => {
    const listing = await seedBookable(client, { units: 3 });
    const first = await book(listing.id);
    const second = await book(listing.id);
    expect(
      await blockUseCase(client, { clock: () => NOW }).create(
        admin,
        TEST_BRANCH_ID,
        {
          physicalRoomId: "garden-unit-2",
          startDate: stay.checkIn,
          endDate: stay.checkOut,
          reason: "MAINTENANCE",
        },
      ),
    ).toMatchObject({ ok: true });
    await problem(
      call(assign, first.id, "PUT", {
        lineId: first.lines[0]!.id,
        body: { physicalRoomId: "garden-unit-2" },
      }),
      409,
      "ROOM_BLOCKED",
    );
    expect(
      await commands().assignRoom.execute(
        admin,
        first.id,
        first.lines[0]!.id,
        1,
        "garden-unit-0",
      ),
    ).toMatchObject({ ok: true });
    // Exercise the constraint path directly, after the precheck tested above.
    const store = new PrismaReservationUnitOfWork(
      client,
      (tx) => new PrismaReservationRepository(tx),
    );
    const result = await store.run(async (repository) => {
      const locked = await repository.lockById(TEST_BRANCH_ID, second.id);
      if (!locked.ok) return locked;
      if (!locked.value)
        return failure("NOT_FOUND", "The fixture was not found.");
      return repository.assignRoom(
        locked.value,
        second.lines[0]!.id,
        "garden-unit-0",
        NOW,
      );
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ROOM_ALREADY_ASSIGNED" },
    });
    expect(await stored(second.id)).toMatchObject({
      version: 1,
      rooms: [{ physicalRoomId: null }],
    });
  });

  it("S13 releases inventory from the branch arrival day and keeps the note out of history", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id);
    expect(
      await commands().markNoShow.execute(admin, booking.id, 1),
    ).toMatchObject({ error: { code: "INVALID_TRANSITION" } });
    const assigned = await commands().assignRoom.execute(
      admin,
      booking.id,
      booking.lines[0]!.id,
      1,
      "garden-unit-0",
    );
    expect(assigned.ok).toBe(true);
    const due = staffReservationCommands({
      client,
      clock: { now: () => new Date("2031-04-09T22:30:00Z") },
    });
    const note = "Private no-show note";
    expect(
      await due.markNoShow.execute(admin, booking.id, 2, note),
    ).toMatchObject({
      ok: true,
      value: { reservation: { status: "NO_SHOW", version: 3 } },
    });
    const saved = await stored(booking.id);
    expect(saved.rooms[0]).toMatchObject({
      consumesInventory: false,
      physicalRoomId: "garden-unit-0",
    });
    const result = await (await call(history, booking.id, "GET")).json();
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reservation.no-show",
          changes: { noteProvided: true },
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(note);
    await problem(
      call(edit, booking.id, "PATCH", {
        version: 3,
        body: { internalNotes: "late edit" },
      }),
      409,
      "INVALID_TRANSITION",
    );
    await problem(call(resend, booking.id, "POST"), 409, "INVALID_TRANSITION");
  });

  it("S16 sets the manual entry once, with the authenticated actor (AC-5, T-PMS-1…2)", async () => {
    const listing = await seedBookable(client);
    const online = await website();
    const manual = await book(listing.id, { external: true });
    await problem(call(enter, manual.id, "POST"), 409, "INVALID_TRANSITION");
    await problem(
      call(enter, online.id, "POST", { staff: "foreign" }),
      404,
      "NOT_FOUND",
    );
    const marked = await call(enter, online.id, "POST", {
      staff: "reception",
      body: { note: "Manual acknowledgement" },
    });
    expect(marked.status).toBe(200);
    expect(marked.headers.get("etag")).toBe('"v2"');
    const result = StaffReservationDetail.parse(await marked.json());
    expect(result).toMatchObject({
      pmsEnteredAt: expect.any(String),
      pmsEnteredById: admin.id,
    });
    expect(result.allowedActions).not.toContain("MARK_ENTERED_IN_HOTEL_SYSTEM");
    await problem(
      call(enter, online.id, "POST", { version: 2 }),
      409,
      "CONFLICT",
    );
    await problem(call(enter, online.id, "POST"), 412, "STALE_VERSION");
    expect(await stored(online.id)).toMatchObject({
      pmsEnteredAt: new Date(result.pmsEnteredAt!),
      pmsEnteredById: admin.id,
      version: 2,
    });
    expect(
      await client.auditEvent.count({
        where: { entityId: online.id, action: "reservation.pms-entered" },
      }),
    ).toBe(1);
  });

  it.each(["CHECKED_IN", "NO_SHOW"] as const)(
    "S16 permits first entry only while the website reservation is operational (%s)",
    async (status) => {
      await seedBookable(client);
      const booking = await website();
      const atArrival = staffReservationCommands({
        client,
        clock: {
          now: () => new Date("2031-04-10T10:00:00Z"),
        },
      });
      if (status === "CHECKED_IN") {
        const firstLine = (await stored(booking.id)).rooms[0]!;
        expect(
          await atArrival.assignRoom.execute(
            admin,
            booking.id,
            firstLine.id,
            1,
            "garden-unit-0",
          ),
        ).toMatchObject({ ok: true });
        expect(
          await atArrival.checkIn.execute(admin, booking.id, 2),
        ).toMatchObject({ ok: true });
        expect(
          (await call(enter, booking.id, "POST", { version: 3 })).status,
        ).toBe(200);
        expect(await stored(booking.id)).toMatchObject({
          status,
          pmsEnteredById: admin.id,
        });
      } else {
        expect(
          await atArrival.markNoShow.execute(admin, booking.id, 1),
        ).toMatchObject({ ok: true });
        await problem(
          call(enter, booking.id, "POST", { version: 2 }),
          409,
          "INVALID_TRANSITION",
        );
        expect(await stored(booking.id)).toMatchObject({
          status,
          pmsEnteredAt: null,
          pmsEnteredById: null,
        });
      }
    },
  );

  it("S14 rotates once per request, queues available channels and exposes no token (AC-8)", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id);
    const logs = [
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    try {
      const send = () => call(resend, booking.id, "POST", { version: null });
      const first = await send();
      expect(first.status).toBe(202);
      expect(await first.text()).toBe("");
      const initial = await outbox(booking.id);
      expect(initial.map((row) => row.channel).sort()).toEqual([
        "EMAIL",
        "WHATSAPP",
      ]);
      const oldToken = tokenFrom(initial[0]!.payload);
      expect(await stored(booking.id)).toMatchObject({
        manageTokenHash: sha256(oldToken),
        manageTokenExpiresAt: new Date("2031-05-13"),
        version: 2,
      });
      expect((await send()).status).toBe(202);
      const added = (await outbox(booking.id)).filter(
        (row) => !initial.some((message) => message.id === row.id),
      );
      expect(added).toHaveLength(2);
      const token = tokenFrom(added[0]!.payload);
      expect(token).not.toBe(oldToken);
      expect(
        await client.reservation.count({
          where: { manageTokenHash: sha256(oldToken) },
        }),
      ).toBe(0);
      expect(await stored(booking.id)).toMatchObject({
        manageTokenHash: sha256(token),
        version: 3,
      });
      const audits = await client.auditEvent.findMany({
        where: {
          entityId: booking.id,
          action: "reservation.manage-link-resent",
        },
      });
      expect(audits).toHaveLength(2);
      const observed = JSON.stringify([
        audits,
        ...logs.flatMap((log) => log.mock.calls),
      ]);
      for (const secret of [
        token,
        oldToken,
        sha256(token),
        name,
        email,
        booking.contact!.phone!,
      ])
        expect(observed).not.toContain(secret);
      const single = await book(listing.id, { noEmail: true });
      expect((await call(resend, single.id, "POST")).status).toBe(202);
      expect((await outbox(single.id)).map((row) => row.channel)).toEqual([
        "WHATSAPP",
      ]);
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  it.each(["outbox", "audit"])(
    "S14 restores the old link when the %s write fails",
    async (adapter) => {
      const listing = await seedBookable(client);
      const booking = await book(listing.id);
      expect((await call(resend, booking.id, "POST")).status).toBe(202);
      const before = await stored(booking.id);
      const messages = await outbox(booking.id);
      const table =
        adapter === "outbox" ? '"NotificationOutbox"' : '"AuditEvent"';
      const check =
        adapter === "outbox"
          ? "kind <> 'reservation.manage-link'"
          : "action <> 'reservation.manage-link-resent'";
      await client.$executeRawUnsafe(
        `ALTER TABLE ${table} ADD CONSTRAINT "test_reject_link_rotation" CHECK (${check}) NOT VALID`,
      );
      try {
        await problem(call(resend, booking.id, "POST"), 500, "INTERNAL");
        expect(await stored(booking.id)).toEqual(before);
        expect(await outbox(booking.id)).toEqual(messages);
        expect(
          await client.auditEvent.count({
            where: {
              entityId: booking.id,
              action: "reservation.manage-link-resent",
            },
          }),
        ).toBe(1);
      } finally {
        await client.$executeRawUnsafe(
          `ALTER TABLE ${table} DROP CONSTRAINT "test_reject_link_rotation"`,
        );
      }
    },
  );

  it("S14 refuses an expired confirmed stay and S2 hides the action at the cutoff", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id);
    expect(
      await commands().resendManageLink.execute(admin, booking.id),
    ).toMatchObject({ ok: true });
    const before = await stored(booking.id);
    const messages = await outbox(booking.id);
    const clock = { now: () => new Date("2031-05-13T00:00:00Z") };
    const result = await staffReservationQueries({ client, clock }).get.execute(
      admin,
      booking.id,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { reservation: { status: "CONFIRMED" } },
    });
    if (!result.ok)
      throw new Error("Could not read the historical reservation.");
    expect(result.value.reservation.allowedActions).not.toContain(
      "SEND_MANAGE_LINK",
    );
    expect(
      await staffReservationCommands({
        client,
        clock,
      }).resendManageLink.execute(admin, booking.id),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(await stored(booking.id)).toEqual(before);
    expect(await outbox(booking.id)).toEqual(messages);
  });

  it("S14 refuses a contactless record and can queue an email-only link", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id, { noEmail: true });
    await client.reservation.update({
      where: { id: booking.id },
      data: { guestPhone: null },
    });
    const before = await stored(booking.id);
    const result = await staffReservationQueries({ client, clock }).get.execute(
      admin,
      booking.id,
    );
    if (!result.ok)
      throw new Error("Could not read the contactless reservation.");
    expect(result.value.reservation.allowedActions).not.toContain(
      "SEND_MANAGE_LINK",
    );
    await problem(call(resend, booking.id, "POST"), 409, "CONFLICT");
    expect(await stored(booking.id)).toEqual(before);
    expect(await outbox(booking.id)).toHaveLength(0);
    const changed = await call(edit, booking.id, "PATCH", {
      body: { guest: { email } },
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      allowedActions: expect.arrayContaining(["SEND_MANAGE_LINK"]),
    });
    expect((await call(resend, booking.id, "POST")).status).toBe(202);
    expect((await outbox(booking.id)).map((row) => row.channel)).toEqual([
      "EMAIL",
    ]);
  });

  it("sweeps the seven routes as signed out, Editor, unassigned, foreign, Receptionist, Manager and Admin (AC-9)", async () => {
    const listing = await seedBookable(client);
    const booking = await book(listing.id);
    const operations = [
      {
        handler: edit,
        method: "PATCH",
        body: { internalNotes: "Updated notes" },
      },
      { handler: assign, method: "PUT", body: { physicalRoomId: null } },
      { handler: checkIn, method: "POST" },
      { handler: checkOut, method: "POST" },
      { handler: noShow, method: "POST", body: {} },
      { handler: enter, method: "POST" },
      { handler: resend, method: "POST" },
    ];
    for (const { handler, method, body } of operations) {
      const invoke = (staff: string, version: number | null = 1) =>
        call(handler, booking.id, method, {
          staff,
          body,
          version,
          lineId: booking.lines[0]!.id,
        });
      await problem(invoke("signed-out"), 401, "UNAUTHENTICATED");
      await problem(invoke("editor"), 403, "FORBIDDEN");
      await problem(invoke("unassigned"), 404, "NOT_FOUND");
      await problem(invoke("foreign"), 404, "NOT_FOUND");
      if (handler !== resend) {
        await problem(invoke("admin", null), 428, "PRECONDITION_REQUIRED");
        await problem(invoke("admin", 999), 412, "STALE_VERSION");
        for (const staff of ["reception", "manager", "admin"])
          await problem(invoke(staff, 999), 412, "STALE_VERSION");
      }
    }
    await problem(
      call(resend, booking.id, "POST", {
        requestOrigin: "https://other.example.test",
      }),
      403,
      "CROSS_SITE_REQUEST",
    );
    expect(await stored(booking.id)).toMatchObject({ version: 1 });
    expect(
      await client.auditEvent.count({ where: { entityId: booking.id } }),
    ).toBe(1);
    for (const staff of ["reception", "manager", "admin"])
      expect((await call(resend, booking.id, "POST", { staff })).status).toBe(
        202,
      );
  });
});

async function race<Left, Right>(
  lock: (transaction: DatabaseClient) => Promise<unknown>,
  compete: (
    first: ReturnType<typeof createTestClient>,
    second: ReturnType<typeof createTestClient>,
  ) => readonly [Promise<Left>, Promise<Right>],
) {
  return withIndependentClients(3, async ([locker, first, second]) => {
    const held = deferred();
    const release = deferred();
    const holding = locker!.$transaction(async (transaction) => {
      await lock(transaction);
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const [a, b] = compete(first!, second!);
    const results = Promise.all([a, b]);
    try {
      await waitForLockWaiters(client, 2);
    } finally {
      release.resolve();
      await holding;
      await results;
    }
    return results;
  });
}

describe("staff operations concurrency", () => {
  it("C-7: two overlapping lines contend for one physical unit, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      const listing = await seedBookable(client);
      const a = await book(listing.id);
      const b = await book(listing.id);
      const results = await race(
        (tx) =>
          tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${listing.id} FOR UPDATE`,
        (first, second) => [
          staffReservationCommands({ client: first, clock }).assignRoom.execute(
            admin,
            a.id,
            a.lines[0]!.id,
            1,
            "garden-unit-0",
          ),
          staffReservationCommands({
            client: second,
            clock,
          }).assignRoom.execute(
            admin,
            b.id,
            b.lines[0]!.id,
            1,
            "garden-unit-0",
          ),
        ],
      );
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toMatchObject({
        error: { code: "ROOM_ALREADY_ASSIGNED" },
      });
      expect(
        await client.reservationRoom.count({
          where: { physicalRoomId: "garden-unit-0" },
        }),
      ).toBe(1);
      expect(
        await client.auditEvent.count({
          where: { action: "reservation.room-assigned" },
        }),
      ).toBe(1);
    }
  }, 120_000);

  it("serializes assignment against an overlapping block, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      const listing = await seedBookable(client);
      const booking = await book(listing.id);
      const [assignment, block] = await race(
        (tx) =>
          tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${listing.id} FOR UPDATE`,
        (first, second) => [
          staffReservationCommands({ client: first, clock }).assignRoom.execute(
            admin,
            booking.id,
            booking.lines[0]!.id,
            1,
            "garden-unit-0",
          ),
          blockUseCase(second, { clock: () => NOW }).create(
            admin,
            TEST_BRANCH_ID,
            {
              physicalRoomId: "garden-unit-0",
              startDate: stay.checkIn,
              endDate: stay.checkOut,
              reason: "MAINTENANCE",
            },
          ),
        ],
      );
      expect([assignment.ok, block.ok].filter(Boolean)).toHaveLength(1);
      if (!assignment.ok) expect(assignment.error.code).toBe("ROOM_BLOCKED");
      if (!block.ok) expect(block.error.code).toBe("CONFLICT");
      expect(
        await client.reservationRoom.count({
          where: { physicalRoomId: "garden-unit-0" },
        }),
      ).toBe(Number(assignment.ok));
      expect(
        await client.inventoryBlock.count({
          where: { physicalRoomId: "garden-unit-0", cancelledAt: null },
        }),
      ).toBe(Number(block.ok));
    }
  }, 120_000);

  it("serializes two link rotations with one valid token, 20 rounds", async () => {
    for (let round = 0; round < 20; round++) {
      await resetDatabase(client);
      await createActor(client);
      const listing = await seedBookable(client);
      const booking = await book(listing.id);
      const results = await race(
        (tx) =>
          tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${booking.id} FOR UPDATE`,
        (first, second) => [
          staffReservationCommands({
            client: first,
            clock,
          }).resendManageLink.execute(admin, booking.id),
          staffReservationCommands({
            client: second,
            clock,
          }).resendManageLink.execute(admin, booking.id),
        ],
      );
      expect(results.every((result) => result.ok)).toBe(true);
      const messages = await outbox(booking.id);
      const hashes = messages.map((row) => sha256(tokenFrom(row.payload)));
      const reservation = await stored(booking.id);
      expect(messages).toHaveLength(4);
      expect(new Set(hashes).size).toBe(2);
      expect(
        hashes.filter((hash) => hash === reservation.manageTokenHash),
      ).toHaveLength(2);
      expect(reservation.version).toBe(3);
      expect(
        await client.auditEvent.count({
          where: {
            entityId: booking.id,
            action: "reservation.manage-link-resent",
          },
        }),
      ).toBe(2);
    }
  }, 120_000);
});
