import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { StaffPrincipal } from "@/application/auth";
import {
  RecordSyncCheckpoint,
  type SyncCheckpointContext,
} from "@/application/reservations";
import { SyncStatus } from "@/contracts/api/v1/branch-sync";
import { AvailabilityGrid } from "@/contracts/api/v1/inventory";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { PrismaSyncCheckpointRepository } from "@/infrastructure/db/prisma/repositories/reservations/sync-checkpoint-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";

import {
  createActor,
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { barrier, withIndependentClients } from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
  TOTAL_MINOR,
  websiteBooking,
} from "./support/website-booking";

const sessions = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    sessions.get(headers.get("x-test-staff") ?? "") ?? null,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));

const { GET: getStatus } = await import(
  "@/app/api/v1/staff/branches/[id]/sync-status/route"
);
const { POST: postCheckpoint } = await import(
  "@/app/api/v1/staff/branches/[id]/sync-checkpoints/route"
);
const { GET: getGrid } = await import(
  "@/app/api/v1/staff/branches/[id]/availability/route"
);
const { POST: postPmsEntry } = await import(
  "@/app/api/v1/staff/reservations/[id]/pms-entry/route"
);

const db = createTestClient();
const foreign = "sync-foreign";
const origin = process.env.APP_URL ?? "http://localhost:3000";
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Admin",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "admin-session",
};
const receptionist: StaffPrincipal = {
  id: "actor-desk",
  name: "Desk",
  email: "desk@example.test",
  role: "RECEPTIONIST",
  branchIds: [TEST_BRANCH_ID],
  sessionId: "desk-session",
};
const minute = (offset: number) => new Date(NOW.getTime() + offset * 60_000);

function branchRequest(
  path: string,
  {
    staff = "admin",
    branchId = TEST_BRANCH_ID,
    body,
    requestOrigin = origin,
  }: {
    staff?: string;
    branchId?: string;
    body?: unknown;
    requestOrigin?: string;
  } = {},
) {
  return [
    new Request(`${origin}/api/v1/staff/branches/${branchId}/${path}`, {
      headers: {
        origin: requestOrigin,
        "x-test-staff": staff,
        "content-type": "application/json",
      },
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id: branchId }) },
  ] as const;
}

async function status(staff = "admin", branchId = TEST_BRANCH_ID) {
  const response = await getStatus(
    ...branchRequest("sync-status", { staff, branchId }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return SyncStatus.parse(await response.json());
}

async function checkpoint(
  kind: "STARTED" | "COMPLETED",
  staff: string,
  note?: string,
) {
  const response = await postCheckpoint(
    ...branchRequest("sync-checkpoints", { staff, body: { kind, note } }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  return SyncStatus.parse(await response.json());
}

const auditRows = () =>
  db.auditEvent.findMany({ where: { action: "sync-checkpoint.recorded" } });

beforeEach(async () => {
  await resetDatabase(db);
  await createActor(db);
  await createBranch(db, { id: foreign, slug: foreign, status: "INACTIVE" });
  await db.user.create({
    data: {
      id: receptionist.id,
      name: receptionist.name,
      email: receptionist.email,
      role: receptionist.role,
    },
  });
  sessions.clear();
  sessions.set("admin", admin);
  sessions.set("desk", receptionist);
  sessions.set("manager", { ...receptionist, role: "MANAGER" });
  sessions.set("editor", { ...admin, role: "EDITOR" });
  sessions.set("unassigned", { ...receptionist, branchIds: [] });
  sessions.set("unassigned-manager", {
    ...receptionist,
    role: "MANAGER",
    branchIds: [],
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => db.$disconnect());

describe("M8-T12 branch sync API", () => {
  it("T-SYNCAPI-1/2 shares deadlines and completed timestamps across staff and the grid", async () => {
    const grid = async (branchId = TEST_BRANCH_ID) => {
      const response = await getGrid(
        ...branchRequest("availability?from=2031-03-02&to=2031-03-03", {
          branchId,
        }),
      );
      expect(response.status).toBe(200);
      return AvailabilityGrid.parse(await response.json());
    };
    expect(await status("desk")).toEqual({
      lastCompletedAt: null,
      lastCompletedBy: null,
      intervalMinutes: 30,
      followUpMinutes: 10,
      dueAt: NOW.toISOString(),
      due: true,
      notEnteredInHotelSystem: 0,
      serverTime: NOW.toISOString(),
    });
    expect((await grid()).lastSyncCheckpoint).toBeNull();

    const started = await checkpoint("STARTED", "desk", "   ");
    expect(started).toMatchObject({
      startedAt: NOW.toISOString(),
      dueAt: minute(10).toISOString(),
      due: false,
    });
    expect(await status("manager")).toEqual(started);
    expect((await grid()).lastSyncCheckpoint).toBeNull();

    vi.setSystemTime(minute(10));
    expect((await status("desk")).due).toBe(true);
    const completed = await checkpoint("COMPLETED", "admin");
    expect(completed).toMatchObject({
      lastCompletedAt: minute(10).toISOString(),
      lastCompletedBy: admin.id,
      dueAt: minute(40).toISOString(),
      due: false,
    });
    expect(completed).not.toHaveProperty("startedAt");
    expect(await status("desk")).toEqual(completed);
    expect((await grid()).lastSyncCheckpoint).toBe(completed.lastCompletedAt);

    vi.setSystemTime(minute(12));
    const restarted = await checkpoint("STARTED", "manager");
    expect(restarted).toMatchObject({
      startedAt: minute(12).toISOString(),
      dueAt: minute(22).toISOString(),
      lastCompletedAt: completed.lastCompletedAt,
    });
    expect((await grid()).lastSyncCheckpoint).toBe(completed.lastCompletedAt);
    expect((await grid(foreign)).lastSyncCheckpoint).toBeNull();
    expect(await status("admin", foreign)).toMatchObject({
      due: true,
      lastCompletedAt: null,
      dueAt: minute(12).toISOString(),
    });

    await db.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { syncReminderIntervalMinutes: 60, syncFollowUpMinutes: 15 },
    });
    expect(await status("desk")).toMatchObject({
      intervalMinutes: 60,
      followUpMinutes: 15,
      dueAt: minute(27).toISOString(),
    });
    expect(await db.branchSyncCheckpoint.count({ where: { note: null } })).toBe(
      3,
    );
  });

  it("T-SYNCAPI-1 advances the backlog through S13 and filters by branch, source, status and entry", async () => {
    await seedBookable(db);
    const phone = phoneOf(17);
    const token = await issueToken(db, phone);
    const line = { roomSlug: "garden", occupancy: { adults: 2, children: 0 } };
    const result = await websiteBooking(db).execute(
      bookingBody(phone, token, {
        lines: [line, line],
        expectedTotal: { amountMinor: 2 * TOTAL_MINOR, currency: "USD" },
      }),
      "sync-test-multi-unit",
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const oldest = await db.reservation.findUniqueOrThrow({
      where: { reference: result.value.reference },
    });
    const exclusions = [
      { id: "staff", source: "STAFF" },
      { id: "external", source: "EXTERNAL", externalReference: "EXTERNAL-1" },
      { id: "cancelled", status: "CANCELLED" },
      { id: "checked-out", status: "CHECKED_OUT" },
      { id: "no-show", status: "NO_SHOW" },
      { id: "failed", status: "PAYMENT_FAILED", paymentMethod: "ONLINE" },
      {
        id: "holding",
        status: "AWAITING_PAYMENT",
        paymentMethod: "ONLINE",
        holdExpiresAt: minute(10),
      },
      {
        id: "entered",
        pmsEnteredAt: minute(-1),
        pmsEnteredById: admin.id,
        pmsUpdatePendingSince: minute(-1),
      },
      { id: "other-branch", branchId: foreign },
    ] as const;
    await db.reservation.createMany({
      data: [
        { id: "in-house", status: "CHECKED_IN" as const, createdAt: minute(1) },
        ...exclusions,
      ].map(({ id, ...fields }, index) => ({
        id,
        reference: `RR-X${String(index).padStart(7, "0")}`,
        branchId: TEST_BRANCH_ID,
        source: "WEBSITE",
        status: "CONFIRMED",
        checkIn: oldest.checkIn,
        checkOut: oldest.checkOut,
        createdAt: minute(-4),
        statusChangedAt: minute(2),
        guestId: oldest.guestId,
        guestName: oldest.guestName,
        guestEmail: oldest.guestEmail,
        accommodationMinor: 100,
        subtotalMinor: 100,
        taxableMinor: 100,
        vatRateBasisPoints: 1500,
        vatMinor: 15,
        totalMinor: 115,
        ...fields,
      })),
    });

    expect(await status()).toMatchObject({
      notEnteredInHotelSystem: 2,
      oldestNotEnteredAt: NOW.toISOString(),
    });
    expect(await status("admin", foreign)).toMatchObject({
      notEnteredInHotelSystem: 1,
      oldestNotEnteredAt: minute(-4).toISOString(),
    });
    expect(await checkpoint("COMPLETED", "admin")).toMatchObject({
      notEnteredInHotelSystem: 2,
    });
    const entered = await postPmsEntry(
      new Request(
        `${origin}/api/v1/staff/reservations/${oldest.id}/pms-entry`,
        {
          method: "POST",
          headers: {
            origin,
            "x-test-staff": "desk",
            "if-match": `"v${oldest.version}"`,
          },
        },
      ),
      { params: Promise.resolve({ id: oldest.id }) },
    );
    expect(entered.status).toBe(200);
    expect(await status("desk")).toMatchObject({
      notEnteredInHotelSystem: 1,
      oldestNotEnteredAt: minute(1).toISOString(),
    });
  });

  it("T-SYNCAPI-3 and AC-9 authorize both methods for each role and branch", async () => {
    for (const [staff, branchId, expected] of [
      ["admin", TEST_BRANCH_ID, 200],
      ["admin", foreign, 200],
      ["desk", TEST_BRANCH_ID, 200],
      ["manager", TEST_BRANCH_ID, 200],
      ["editor", TEST_BRANCH_ID, 403],
      ["desk", foreign, 403],
      ["manager", foreign, 403],
      ["unassigned", TEST_BRANCH_ID, 403],
      ["unassigned-manager", TEST_BRANCH_ID, 403],
      ["anonymous", TEST_BRANCH_ID, 401],
      ["admin", "unknown", 404],
      ["desk", "unknown", 403],
    ] as const) {
      const options = { staff, branchId };
      const read = await getStatus(...branchRequest("sync-status", options));
      expect(read.status, `GET ${staff} ${branchId}`).toBe(expected);
      const write = await postCheckpoint(
        ...branchRequest("sync-checkpoints", {
          ...options,
          body: { kind: "STARTED" },
        }),
      );
      expect(write.status, `POST ${staff} ${branchId}`).toBe(
        expected === 200 ? 201 : expected,
      );
    }
    expect(await db.branchSyncCheckpoint.count()).toBe(4);
    expect(await auditRows()).toHaveLength(4);
  });

  it("refuses cross-origin writes and invalid checkpoint bodies without persisting them", async () => {
    const crossSite = await postCheckpoint(
      ...branchRequest("sync-checkpoints", {
        requestOrigin: "https://example.test",
        body: { kind: "COMPLETED" },
      }),
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({
      code: "CROSS_SITE_REQUEST",
    });
    for (const body of [
      {},
      { kind: "FINISHED" },
      { kind: "STARTED", actorId: admin.id },
      { kind: "STARTED", recordedAt: NOW },
      { kind: "COMPLETED", note: "x".repeat(501) },
      { kind: "COMPLETED", note: null },
    ]) {
      const response = await postCheckpoint(
        ...branchRequest("sync-checkpoints", { body }),
      );
      expect(response.status).toBe(422);
    }
    expect(await db.branchSyncCheckpoint.count()).toBe(0);
    expect(await auditRows()).toEqual([]);
  });

  it("rejects query parameters on both endpoints without recording a checkpoint", async () => {
    const read = await getStatus(...branchRequest("sync-status?preview=true"));
    const write = await postCheckpoint(
      ...branchRequest("sync-checkpoints?preview=true", {
        body: { kind: "COMPLETED" },
      }),
    );
    for (const response of [read, write]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_QUERY" });
    }
    expect(await db.branchSyncCheckpoint.count()).toBe(0);
    expect(await auditRows()).toEqual([]);
  });

  it("T-SYNCAPI-4 and AC-8 audit each answer, with note text confined to its checkpoint", async () => {
    const note = "Fictional guest, example@example.test, +12025550177";
    const requestLog = vi.mocked(console.info);
    await checkpoint("COMPLETED", "desk", `  ${note}  `);
    await checkpoint("COMPLETED", "admin");
    const rows = await db.branchSyncCheckpoint.findMany({
      orderBy: { id: "desc" },
    });
    expect(rows).toHaveLength(2);
    const recorded = rows.find((row) => row.recordedById === receptionist.id);
    expect(recorded).toMatchObject({
      note,
      branchId: TEST_BRANCH_ID,
      recordedAt: NOW,
      kind: "COMPLETED",
    });
    const audit = await auditRows();
    expect(audit).toHaveLength(2);
    expect(audit).toContainEqual(
      expect.objectContaining({
        entityType: "SyncCheckpoint",
        entityId: recorded?.id,
        actorType: "STAFF",
        actorId: receptionist.id,
        branchId: TEST_BRANCH_ID,
        occurredAt: NOW,
        reason: null,
        changes: { kind: "COMPLETED", noteProvided: true },
      }),
    );
    expect(JSON.stringify(audit)).not.toContain(note);
    expect(requestLog).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(requestLog.mock.calls)).not.toContain(note);
    expect((await status()).lastCompletedBy).toBe(rows[0]?.recordedById);
  });

  it.each(["audit append", "status read"] as const)(
    "T-SYNCAPI-4 rolls back both writes if the %s fails",
    async (step) => {
      const errorLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      if (step === "audit append") {
        vi.spyOn(PrismaAuditLog.prototype, "append").mockRejectedValueOnce(
          new Error("Audit failed"),
        );
      } else {
        vi.spyOn(
          PrismaSyncCheckpointRepository.prototype,
          "readStatus",
        ).mockRejectedValueOnce(new Error("Status failed"));
      }
      const response = await postCheckpoint(
        ...branchRequest("sync-checkpoints", { body: { kind: "COMPLETED" } }),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ code: "INTERNAL" });
      expect(errorLog).toHaveBeenCalledOnce();
      expect(await db.branchSyncCheckpoint.count()).toBe(0);
      expect(await auditRows()).toEqual([]);
    },
  );

  it("T-SYNCAPI-2 resolves simultaneous STARTED and COMPLETED across 20 overlapping transactions", async () => {
    await withIndependentClients(2, async ([startClient, completeClient]) => {
      if (!startClient || !completeClient)
        throw new Error("Expected two database clients.");
      for (let round = 0; round < 20; round++) {
        const at = minute(round);
        vi.setSystemTime(at);
        const waitForBothInserts = barrier(2);
        const action = (client: typeof db, id: string) =>
          new RecordSyncCheckpoint({
            clock: { now: () => at },
            ids: { next: () => id },
            unitOfWork: new PrismaReservationUnitOfWork<SyncCheckpointContext>(
              client,
              (tx) => {
                const repository = new PrismaSyncCheckpointRepository(tx);
                return {
                  branches: new PrismaBranchRepository(tx),
                  audit: new PrismaAuditLog(tx),
                  checkpoints: {
                    append: async (row) => {
                      await repository.append(row);
                      // Each transaction holds its inserted row until both inserts finish.
                      await waitForBothInserts();
                    },
                    readStatus: (branchId) => repository.readStatus(branchId),
                  },
                };
              },
            ),
          });
        const ids = [`start-${round}`, `completed-${round}`];
        const [start, finish] = await Promise.all([
          action(startClient, `start-${round}`).execute(
            receptionist,
            TEST_BRANCH_ID,
            { kind: "STARTED" },
          ),
          action(completeClient, `completed-${round}`).execute(
            admin,
            TEST_BRANCH_ID,
            { kind: "COMPLETED" },
          ),
        ]);
        expect(start.ok).toBe(true);
        expect(finish.ok).toBe(true);
        const final = await status("desk");
        expect(final).toMatchObject({
          due: false,
          dueAt: minute(round + 30).toISOString(),
          lastCompletedAt: at.toISOString(),
          lastCompletedBy: admin.id,
        });
        expect(final).not.toHaveProperty("startedAt");
        expect(
          await db.branchSyncCheckpoint.count({ where: { id: { in: ids } } }),
        ).toBe(2);
        expect(
          await db.auditEvent.count({
            where: {
              action: "sync-checkpoint.recorded",
              entityId: { in: ids },
            },
          }),
        ).toBe(2);
      }
    });
  });
});
