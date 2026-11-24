import { createHash, randomBytes } from "node:crypto";
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
  ChangeGuestBlock,
  ConfirmPhoneVerification,
  type ChangeGuestBlockContext,
  type VerificationContext,
} from "@/application/guests";
import { staffGuests } from "@/composition/guests";
import type { PrismaClient } from "@/generated/prisma/client";
import { NodePhoneVerificationCrypto } from "@/infrastructure/crypto/phone-verification-crypto";
import { PrismaGuestHistoryReader } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaGuestDirectoryReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-directory-reader";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { staffReservationCommands } from "@/composition/reservations";
import {
  CancellationRequest,
  GuestDetail,
  GuestList,
  GuestReservation,
  GuestReservationList,
} from "@/contracts/api/v1/guests";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { withIndependentClients } from "./support/concurrency";
import {
  bookingBody,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
  TOTAL_MINOR,
  waitForLockWaiters,
  websiteBooking,
} from "./support/website-booking";

// covers: M8-T11 S50 to S53, G1, G3, G4 over the real route handlers and
// PostgreSQL (T-GST staff side, T-LKP-1…4, AC-7, AC-8, AC-9).
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
const principals = vi.hoisted(() => new Map<string, StaffPrincipal>());
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async (headers: Headers) =>
    principals.get(headers.get("x-test-staff") ?? "") ?? null,
  throttleKeys: () => new HmacThrottleKeys("test-guest-access-hmac"),
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

const { GET: listGuests } = await import("@/app/api/v1/staff/guests/route");
const { GET: getGuest } = await import("@/app/api/v1/staff/guests/[id]/route");
const { POST: block, DELETE: unblock } = await import(
  "@/app/api/v1/staff/guests/[id]/block/route"
);
const { GET: g1 } = await import("@/app/api/v1/guest/reservation/route");
const { GET: g3 } = await import("@/app/api/v1/guest/reservations/route");
const { GET: g4 } = await import(
  "@/app/api/v1/guest/reservations/[reference]/route"
);
const { POST: g2 } = await import(
  "@/app/api/v1/guest/reservation/cancellation-requests/route"
);
const { POST: g4Request } = await import(
  "@/app/api/v1/guest/reservations/[reference]/cancellation-requests/route"
);

const client = createTestClient();
const origin = process.env.APP_URL ?? "http://localhost:3000";
const day = 86_400_000;
const date = (offset: number) =>
  new Date(NOW.getTime() + offset * day).toISOString().slice(0, 10);
const clock = { now: () => NOW };
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  branchIds: [],
  sessionId: "staff-session",
};
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const GUEST_NAME = "Amina Hassan";

type Booked = { reference: string; manageToken: string; phone: string };
let bookings = 0;
async function book(phone: string): Promise<Booked> {
  bookings += 1;
  const offset = 40 + bookings * 7;
  const token = await issueToken(client, phone);
  const created = await websiteBooking(client).execute(
    bookingBody(phone, token, {
      stay: { checkIn: date(offset), checkOut: date(offset + 3) },
      expectedTotal: { amountMinor: TOTAL_MINOR, currency: "USD" },
    }),
    `guest-access-${bookings}-key`,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  return {
    reference: created.value.reference,
    manageToken: created.value.manageToken!,
    phone,
  };
}
const guestId = async (phone: string) =>
  (await client.guest.findUniqueOrThrow({ where: { phone } })).id;

function staffCall(
  handler: typeof listGuests,
  path: string,
  options: {
    staff?: string | null;
    method?: string;
    body?: unknown;
    id?: string;
  } = {},
) {
  const { staff = "admin", method = "GET", body, id } = options;
  return handler(
    new Request(new URL(`/api/v1/staff/guests${path}`, origin), {
      method,
      headers: {
        origin,
        ...(staff === null ? {} : { "x-test-staff": staff }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );
}
function guestCall(
  handler: typeof g1,
  token: string | null,
  options: {
    reference?: string;
    scheme?: string;
    method?: "POST";
    body?: unknown;
  } = {},
) {
  return handler(
    new Request("http://localhost/api/v1/guest/reservation", {
      ...(options.method ? { method: options.method } : {}),
      headers: {
        ...(token === null
          ? {}
          : { authorization: `${options.scheme ?? "Bearer"} ${token}` }),
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }),
    { params: Promise.resolve({ reference: options.reference }) },
  );
}
const problemOf = async (response: Response) => {
  const body = (await response.json()) as Record<string, unknown>;
  const { requestId: _requestId, ...rest } = body;
  void _requestId;
  return { status: response.status, ...rest };
};
/** A confirmed verification with a real 43 character token, as P10 issues. */
async function session(
  phone: string,
  options: { purpose?: "BOOKING" | "GUEST_SESSION"; expired?: boolean } = {},
) {
  const token = randomBytes(32).toString("base64url");
  await client.phoneVerification.create({
    data: {
      id: `verification-${sha256(token).slice(0, 12)}`,
      phone,
      purpose: options.purpose ?? "GUEST_SESSION",
      codeHash: "0".repeat(64),
      attempts: 1,
      expiresAt: new Date(NOW.getTime() + 600_000),
      verifiedAt: new Date(NOW.getTime() - 60_000),
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(
        NOW.getTime() + (options.expired ? -1 : 1_800_000),
      ),
      clientKey: "test-client",
      createdAt: new Date(NOW.getTime() - 120_000),
    },
  });
  return token;
}

beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await seedBookable(client);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  principals.clear();
  principals.set("admin", admin);
  principals.set("editor", { ...admin, role: "EDITOR" });
  principals.set("unassigned", { ...admin, role: "RECEPTIONIST" });
  principals.set("unassigned-manager", { ...admin, role: "MANAGER" });
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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => client.$disconnect());

describe("G2 and G4 cancellation requests (T-CXL-4 and T-CXL-5)", () => {
  it("creates through either entry point and returns only the guest request fields", async () => {
    const mine = await book(phoneOf(1));
    const second = await book(phoneOf(1));
    const live = await session(mine.phone);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await guestCall(g2, mine.manageToken, {
      method: "POST",
      body: { reason: "  private change of plans  " },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = CancellationRequest.parse(await response.json());
    expect(created).toEqual({
      id: expect.any(String),
      status: "OPEN",
      createdAt: NOW.toISOString(),
      decisionReason: null,
    });
    expect(
      await client.cancellationRequest.findUnique({
        where: { id: created.id },
      }),
    ).toMatchObject({
      guestReason: "private change of plans",
      requestedBy: "GUEST",
    });
    const reread = await guestCall(g4, live, { reference: mine.reference });
    expect(await reread.json()).toMatchObject({
      status: "CONFIRMED",
      cancellationRequest: created,
      allowedActions: [],
    });
    const duplicate = await guestCall(g4Request, live, {
      method: "POST",
      reference: mine.reference,
    });
    expect(await problemOf(duplicate)).toMatchObject({
      status: 409,
      code: "CANCELLATION_REQUEST_EXISTS",
    });
    const otherRequest = await guestCall(g4Request, live, {
      method: "POST",
      reference: second.reference,
    });
    expect(otherRequest.status).toBe(201);
    expect(CancellationRequest.parse(await otherRequest.json()).id).not.toBe(
      created.id,
    );
    const logged = JSON.stringify(log.mock.calls);
    for (const value of [
      mine.manageToken,
      live,
      mine.phone,
      mine.reference,
      "private change of plans",
    ])
      expect(logged).not.toContain(value);
  });

  it("keeps bad credentials uniform and rejects foreign references and forbidden body fields", async () => {
    const mine = await book(phoneOf(1));
    const foreign = await book(phoneOf(2));
    const live = await session(mine.phone);
    const oldSession = await session(mine.phone, { expired: true });
    const bookingToken = await session(mine.phone, { purpose: "BOOKING" });
    const missingLink = await problemOf(
      await guestCall(g2, null, { method: "POST" }),
    );
    expect(missingLink).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    for (const token of ["short", live])
      expect(
        await problemOf(await guestCall(g2, token, { method: "POST" })),
      ).toEqual(missingLink);
    const missingSession = await problemOf(
      await guestCall(g4Request, null, {
        method: "POST",
        reference: mine.reference,
      }),
    );
    expect(missingSession).toMatchObject({
      status: 401,
      code: "PHONE_NOT_VERIFIED",
    });
    for (const token of [oldSession, bookingToken, mine.manageToken])
      expect(
        await problemOf(
          await guestCall(g4Request, token, {
            method: "POST",
            reference: mine.reference,
          }),
        ),
      ).toEqual(missingSession);
    const foreignResult = await problemOf(
      await guestCall(g4Request, live, {
        method: "POST",
        reference: foreign.reference,
      }),
    );
    expect(foreignResult).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(
      await problemOf(
        await guestCall(g4Request, live, {
          method: "POST",
          reference: "wrong-format",
        }),
      ),
    ).toEqual(foreignResult);
    expect(
      await problemOf(
        await guestCall(g2, mine.manageToken, {
          method: "POST",
          body: { branchId: TEST_BRANCH_ID, reason: "x".repeat(501) },
        }),
      ),
    ).toMatchObject({
      status: 422,
      code: "VALIDATION",
      fieldErrors: { reason: expect.any(Array) },
    });
    expect(await client.cancellationRequest.count()).toBe(0);
  });

  it("uses one write limit for both routes and leaves the read limit independent", async () => {
    const mine = await book(phoneOf(1));
    for (let count = 0; count < 10; count++) {
      const handler = count % 2 ? g2 : g4Request;
      expect(
        (
          await guestCall(handler, null, {
            method: "POST",
            reference: mine.reference,
          })
        ).status,
      ).toBe(401);
    }
    const limited = await guestCall(g2, mine.manageToken, { method: "POST" });
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await problemOf(limited)).toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
    expect((await guestCall(g1, mine.manageToken)).status).toBe(200);
    expect(await client.cancellationRequest.count()).toBe(0);
  });
});

describe("G1 manage link (T-LKP-1…3)", () => {
  it("shows the reservation to the link holder and nothing to anyone else", async () => {
    const mine = await book(phoneOf(1));
    const response = await guestCall(g1, mine.manageToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const view = GuestReservation.parse(await response.json());
    expect(view).toMatchObject({
      reference: mine.reference,
      status: "CONFIRMED",
      branch: { slug: "new-cairo" },
      contact: { fullName: GUEST_NAME, phone: mine.phone },
      price: { totalMinor: TOTAL_MINOR },
      cancellationDeadline: expect.any(String),
      cancellationRequest: null,
      allowedActions: ["REQUEST_CANCELLATION"],
    });
    expect(JSON.stringify(view)).not.toContain("physicalRoomId");

    // Unknown, malformed, wrong scheme, missing, expired and a session token
    // all get one identical refusal.
    const expected = await problemOf(await guestCall(g1, null));
    expect(expected).toMatchObject({ status: 401 });
    const other = await book(phoneOf(2));
    await client.reservation.update({
      where: { reference: other.reference },
      data: { manageTokenExpiresAt: new Date(NOW.getTime() - 1000) },
    });
    for (const attempt of [
      await guestCall(g1, "short"),
      await guestCall(g1, "A".repeat(43)),
      await guestCall(g1, mine.manageToken, { scheme: "Basic" }),
      await guestCall(g1, other.manageToken),
      await guestCall(g1, await session(mine.phone)),
    ])
      expect(await problemOf(attempt)).toEqual(expected);
  });

  it("stops working when staff rotate the link", async () => {
    const mine = await book(phoneOf(1));
    const row = await client.reservation.findUniqueOrThrow({
      where: { reference: mine.reference },
    });
    const resent = await staffReservationCommands({
      client,
      clock,
    }).resendManageLink.execute(admin, row.id);
    expect(resent.ok).toBe(true);
    const messages = await client.notificationOutbox.findMany({
      where: { reservationId: row.id, kind: "reservation.manage-link" },
    });
    const link = (messages[0]!.payload as { manageLink: string }).manageLink;
    const fresh = new URLSearchParams(new URL(link).hash.slice(1)).get("t")!;
    expect((await guestCall(g1, mine.manageToken)).status).toBe(401);
    expect((await guestCall(g1, fresh)).status).toBe(200);
  });

  it("still opens for a blocked phone", async () => {
    const mine = await book(phoneOf(1));
    expect(
      (
        await staffCall(block, "/x/block", {
          staff: "manager",
          method: "POST",
          id: await guestId(mine.phone),
          body: { reason: "Chargeback" },
        })
      ).status,
    ).toBe(200);
    expect((await guestCall(g1, mine.manageToken)).status).toBe(200);
  });
});

describe("G3 and G4 guest session (T-LKP-4)", () => {
  it("lists and opens only the verified phone's reservations", async () => {
    const mine = await book(phoneOf(1));
    const theirs = await book(phoneOf(2));
    const token = await session(mine.phone);

    const list = await guestCall(g3, token);
    expect(list.status).toBe(200);
    const body = GuestReservationList.parse(await list.json());
    expect(body.items.map((item) => item.reference)).toEqual([mine.reference]);
    expect(JSON.stringify(body)).not.toContain(theirs.reference);

    const own = await guestCall(g4, token, {
      reference: mine.reference.toLowerCase(),
    });
    expect(own.status).toBe(200);
    expect(GuestReservation.parse(await own.json()).reference).toBe(
      mine.reference,
    );

    // Someone else's reference looks exactly like one that does not exist.
    const foreign = await problemOf(
      await guestCall(g4, token, { reference: theirs.reference }),
    );
    expect(foreign).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(
      await problemOf(await guestCall(g4, token, { reference: "RR-00000000" })),
    ).toEqual(foreign);
    expect(
      await problemOf(await guestCall(g4, token, { reference: "nonsense" })),
    ).toEqual(foreign);
  });

  it("refuses booking tokens, manage tokens, expired and unknown sessions alike", async () => {
    const mine = await book(phoneOf(1));
    const expected = await problemOf(await guestCall(g3, null));
    expect(expected).toMatchObject({
      status: 401,
      code: "PHONE_NOT_VERIFIED",
    });
    for (const token of [
      await session(mine.phone, { purpose: "BOOKING" }),
      mine.manageToken,
      await session(mine.phone, { expired: true }),
      "A".repeat(43),
    ])
      expect(await problemOf(await guestCall(g3, token))).toEqual(expected);
  });
});

describe("S50 and S51 guest directory (T-GST)", () => {
  it("searches, filters and limits counts to the caller's branches", async () => {
    const a = await book(phoneOf(1));
    await book(phoneOf(2));
    await client.guest.update({
      where: { phone: phoneOf(2) },
      data: { name: "Karim Nabil" },
    });

    const all = GuestList.parse(await (await staffCall(listGuests, "")).json());
    expect(all.total).toBe(2);
    expect(all.items.every((item) => item.reservationCount === 1)).toBe(true);
    const byName = GuestList.parse(
      await (await staffCall(listGuests, "?q=karim")).json(),
    );
    expect(byName.items.map((item) => item.name)).toEqual(["Karim Nabil"]);
    const byPhone = GuestList.parse(
      await (
        await staffCall(
          listGuests,
          `?q=${encodeURIComponent(a.phone.replace("+", "+ "))}`,
        )
      ).json(),
    );
    expect(byPhone.items.map((item) => item.phone)).toEqual([a.phone]);
    expect(
      GuestList.parse(
        await (await staffCall(listGuests, "?blocked=true")).json(),
      ).total,
    ).toBe(0);
    expect((await staffCall(listGuests, "?blocked=maybe")).status).toBe(400);

    const manager = GuestList.parse(
      await (await staffCall(listGuests, "", { staff: "manager" })).json(),
    );
    expect(manager.items.map((item) => item.reservationCount)).toEqual([1, 1]);
    const foreign = GuestList.parse(
      await (await staffCall(listGuests, "", { staff: "foreign" })).json(),
    );
    // Guests who never booked in the caller's branches do not exist for them.
    expect(foreign).toMatchObject({ items: [], total: 0 });
    expect(
      GuestList.parse(
        await (await staffCall(listGuests, "", { staff: "unassigned" })).json(),
      ).items,
    ).toEqual([]);

    const id = await guestId(a.phone);
    const own = GuestDetail.parse(
      await (
        await staffCall(getGuest, `/${id}`, { staff: "reception", id })
      ).json(),
    );
    expect(own.reservations.map((item) => item.reference)).toEqual([
      a.reference,
    ]);
    expect(
      (await staffCall(getGuest, `/${id}`, { staff: "foreign", id })).status,
    ).toBe(404);
    // A manager of another branch cannot block a guest they cannot see.
    expect(
      (
        await staffCall(block, `/${id}/block`, {
          staff: "foreign",
          method: "POST",
          id,
          body: { reason: "Not my guest" },
        })
      ).status,
    ).toBe(404);
    // Admin sees every guest.
    expect(
      (await staffCall(getGuest, `/${id}`, { staff: "admin", id })).status,
    ).toBe(200);
    expect(
      (await staffCall(getGuest, "/missing", { id: "missing" })).status,
    ).toBe(404);
    // A branch scoped role with no branches sees and blocks nothing, as in S2.
    expect(
      (await staffCall(getGuest, `/${id}`, { staff: "unassigned", id })).status,
    ).toBe(404);
    expect(
      (
        await staffCall(block, `/${id}/block`, {
          staff: "unassigned-manager",
          method: "POST",
          id,
          body: { reason: "Offboarded staff" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await client.guest.findUniqueOrThrow({ where: { id } })).blockedAt,
    ).toBeNull();
  });

  it("requires a signed-in role with guests:read", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    expect((await staffCall(listGuests, "", { staff: null })).status).toBe(401);
    expect((await staffCall(listGuests, "", { staff: "editor" })).status).toBe(
      403,
    );
    expect(
      (await staffCall(getGuest, `/${id}`, { staff: "editor", id })).status,
    ).toBe(403);
  });
});

describe("S52 and S53 block and unblock (T-GST, AC-7, AC-8, AC-9)", () => {
  it("blocks every branch, invalidates open codes, audits once and keeps history", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    const liveSession = await session(mine.phone);
    await client.phoneVerification.create({
      data: {
        id: "open-code-row",
        phone: mine.phone,
        purpose: "BOOKING",
        codeHash: "1".repeat(64),
        attempts: 0,
        expiresAt: new Date(NOW.getTime() + 600_000),
        clientKey: "test-client",
        createdAt: NOW,
      },
    });
    const logs = [
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const reason = "Repeated no-shows, see manager note";
    const send = (
      method: "POST" | "DELETE",
      staff = "manager",
      body?: unknown,
    ) =>
      staffCall(method === "POST" ? block : unblock, `/${id}/block`, {
        staff,
        method,
        id,
        body: body ?? { reason },
      });

    expect((await send("POST", "reception")).status).toBe(403);
    expect((await send("POST", "manager", { reason: "" })).status).toBe(422);
    expect(
      (await send("POST", "manager", { reason: "x".repeat(501) })).status,
    ).toBe(422);
    expect((await guestCall(g3, liveSession)).status).toBe(200);

    const blocked = GuestDetail.parse(await (await send("POST")).json());
    expect(blocked).toMatchObject({
      blocked: true,
      blockReason: reason,
      blockedById: "actor-admin",
    });
    expect(blocked.blockHistory.map((item) => item.action)).toEqual([
      "guest.blocked",
    ]);
    // The session and the unconfirmed code are dead; rows stay for the limits.
    expect((await guestCall(g3, liveSession)).status).toBe(401);
    const rows = await client.phoneVerification.findMany({
      where: { phone: mine.phone },
    });
    // The booking's own consumed token, the live session and the open code.
    expect(rows).toHaveLength(3);
    const cleared = rows.filter(
      (row) => row.tokenHash === null && row.attempts >= 5,
    );
    expect(cleared.map((row) => row.id).sort()).toEqual(
      [
        "open-code-row",
        rows.find((row) => row.purpose === "GUEST_SESSION")!.id,
      ].sort(),
    );
    // A consumed booking token is not a live credential: it is left alone.
    const consumed = rows.find((row) => row.consumedAt !== null)!;
    expect(consumed.tokenHash).not.toBeNull();
    // A blocked phone cannot book either.
    const retry = await websiteBooking(client).execute(
      bookingBody(mine.phone, await issueToken(client, mine.phone), {
        stay: { checkIn: date(200), checkOut: date(203) },
      }),
      "blocked-retry-key",
    );
    expect(retry).toMatchObject({
      ok: false,
      error: { code: "PHONE_BLOCKED" },
    });

    // Repeating the block changes nothing and writes no second event.
    await send("POST");
    const events = await client.auditEvent.findMany({
      where: { entityType: "Guest", entityId: id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "guest.blocked",
      actorType: "STAFF",
      branchId: null,
      reason,
      changes: { verificationsInvalidated: 2 },
    });
    expect(
      GuestList.parse(
        await (await staffCall(listGuests, "?blocked=true")).json(),
      ).total,
    ).toBe(1);

    // Time moves on, so the history order is the real order, not a tie.
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const lifted = GuestDetail.parse(
      await (await send("DELETE", "manager", { reason: "Resolved" })).json(),
    );
    expect(lifted).toMatchObject({
      blocked: false,
      blockedAt: null,
      blockReason: null,
    });
    expect(lifted.blockHistory.map((item) => item.action)).toEqual([
      "guest.unblocked",
      "guest.blocked",
    ]);
    await send("DELETE", "manager", { reason: "Resolved" });
    expect(
      await client.auditEvent.count({
        where: { entityType: "Guest", entityId: id },
      }),
    ).toBe(2);
    expect(
      (
        await staffCall(block, "/nobody/block", {
          staff: "manager",
          method: "POST",
          id: "nobody",
          body: { reason },
        })
      ).status,
    ).toBe(404);

    // AC-8: neither tokens, phone, guest name nor the staff note are logged,
    // and the audit row keeps no phone or name.
    const observed = JSON.stringify([
      ...logs.flatMap((log) => log.mock.calls),
      events.map((event) => ({ ...event, reason: null })),
    ]);
    for (const secret of [
      liveSession,
      mine.manageToken,
      mine.phone,
      GUEST_NAME,
      reason,
      sha256(liveSession),
    ])
      expect(observed).not.toContain(secret);
  });
});

describe("block concurrency (20 rounds each)", () => {
  /**
   * Holds the guest row on `holder` until `waiters` other backends are seen in
   * a database lock wait, so the competing transactions provably overlapped.
   */
  async function overlapped<Value>(
    holder: PrismaClient,
    id: string,
    waiters: number,
    start: () => Promise<Value>,
  ) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held!: () => void;
    const locked = new Promise<void>((resolve) => (held = resolve));
    const holding = holder.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Guest" WHERE id = ${id} FOR UPDATE`;
      held();
      await released;
    });
    await locked;
    const running = start();
    try {
      await waitForLockWaiters(client, waiters);
    } finally {
      release();
      await holding;
    }
    return running;
  }
  async function reset(id: string) {
    await client.auditEvent.deleteMany({ where: { entityType: "Guest" } });
    await client.guest.update({
      where: { id },
      data: { blockedAt: null, blockedById: null, blockReason: null },
    });
  }

  it("two parallel blocks write one decision and one audit event", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    const manager = principals.get("manager")!;
    for (let round = 0; round < 20; round++) {
      await reset(id);
      // A third client holds the guest row so both blocks are observed waiting.
      const results = await withIndependentClients(3, ([holder, ...blockers]) =>
        overlapped(holder!, id, 2, () =>
          Promise.all(
            blockers.map((independent) =>
              staffGuests({ client: independent, clock }).block.execute(
                manager,
                id,
                `Round ${round}`,
              ),
            ),
          ),
        ),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      expect(
        await client.auditEvent.count({
          where: { entityType: "Guest", entityId: id },
        }),
      ).toBe(1);
      expect(
        (await client.guest.findUniqueOrThrow({ where: { id } })).blockedAt,
      ).not.toBeNull();
    }
  });

  it("a block waits for the guest lock and applies only after it is released", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    const manager = principals.get("manager")!;
    for (let round = 0; round < 20; round++) {
      await reset(id);
      await withIndependentClients(2, async ([holder, blocker]) => {
        const result = await overlapped(holder!, id, 1, async () => {
          const blocking = staffGuests({
            client: blocker!,
            clock,
          }).block.execute(manager, id, "Waits for the lock");
          return blocking;
        });
        expect(result.ok).toBe(true);
      });
      expect(
        (await client.guest.findUniqueOrThrow({ where: { id } })).blockedAt,
      ).not.toBeNull();
    }
  });

  it("a code confirmation racing a block never leaves a usable token behind", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    const manager = principals.get("manager")!;
    const verificationCrypto = new NodePhoneVerificationCrypto(
      "integration-guest-access-secret-0123456789",
    );
    const code = "000123";
    const confirmer = (connection: PrismaClient) =>
      new ConfirmPhoneVerification({
        unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
          connection,
          (transaction) => ({
            guests: new PrismaGuestRepository(transaction),
            verifications: new PrismaPhoneVerificationRepository(transaction),
          }),
        ),
        verifications: new PrismaPhoneVerificationRepository(connection),
        crypto: {
          generateCode: () => code,
          codeHash: verificationCrypto.codeHash.bind(verificationCrypto),
          codeMatches: verificationCrypto.codeMatches.bind(verificationCrypto),
          generateToken:
            verificationCrypto.generateToken.bind(verificationCrypto),
          tokenHash: verificationCrypto.tokenHash.bind(verificationCrypto),
        },
        clock,
        ids: { next: () => "unused" },
      });
    for (let round = 0; round < 20; round++) {
      await reset(id);
      await client.phoneVerification.deleteMany({
        where: { purpose: "GUEST_SESSION" },
      });
      const verificationId = `race-verification-${round}`;
      await client.phoneVerification.create({
        data: {
          id: verificationId,
          phone: mine.phone,
          purpose: "GUEST_SESSION",
          codeHash: verificationCrypto.codeHash(
            verificationId,
            mine.phone,
            "GUEST_SESSION",
            code,
          ),
          attempts: 0,
          expiresAt: new Date(NOW.getTime() + 600_000),
          clientKey: "test-client",
          createdAt: new Date(NOW.getTime() - 60_000),
        },
      });
      const [confirmed, blocked] = await withIndependentClients(
        3,
        ([holder, confirming, blocking]) =>
          overlapped(holder!, id, 2, () =>
            Promise.all([
              confirmer(confirming!).execute(verificationId, { code }),
              staffGuests({ client: blocking!, clock }).block.execute(
                manager,
                id,
                `Race ${round}`,
              ),
            ]),
          ),
      );
      expect(blocked.ok).toBe(true);
      // Whichever won, no credential for this verification survives the block.
      const row = await client.phoneVerification.findUniqueOrThrow({
        where: { id: verificationId },
      });
      expect(row.tokenHash).toBeNull();
      if (confirmed.ok) {
        expect((await guestCall(g3, confirmed.value.token)).status).toBe(401);
      } else {
        expect(confirmed.error.code).toBe("PHONE_BLOCKED");
      }
    }
  });

  it("a failing audit write rolls back the block, the invalidation and the audit row", async () => {
    const mine = await book(phoneOf(1));
    const id = await guestId(mine.phone);
    // A live session gives the block something to clear and roll back.
    await session(mine.phone);
    const before = await client.phoneVerification.findMany({
      where: { phone: mine.phone },
      orderBy: { id: "asc" },
    });
    const failing = new ChangeGuestBlock(
      {
        unitOfWork: new PrismaReservationUnitOfWork<ChangeGuestBlockContext>(
          client,
          (transaction) => ({
            guests: new PrismaGuestRepository(transaction),
            verifications: new PrismaPhoneVerificationRepository(transaction),
            audit: {
              append: async () => {
                throw new Error("audit store unavailable");
              },
            },
          }),
        ),
        reader: new PrismaGuestDirectoryReader(client),
        history: new PrismaGuestHistoryReader(client),
        clock,
      },
      "BLOCK",
    );
    await expect(
      failing.execute(principals.get("manager")!, id, "Will not stick"),
    ).rejects.toThrow("audit store unavailable");
    expect(
      await client.guest.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({ blockedAt: null, blockedById: null, blockReason: null });
    expect(
      await client.phoneVerification.findMany({
        where: { phone: mine.phone },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(
      await client.auditEvent.count({ where: { entityType: "Guest" } }),
    ).toBe(0);
  });
});
