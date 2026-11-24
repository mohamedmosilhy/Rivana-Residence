import { describe, expect, it, vi } from "vitest";

import { bearerToken } from "@/app/api/v1/_http/bearer";
import type { StaffPrincipal } from "@/application/auth";
import { ChangeGuestBlock, GetGuest, ListGuests } from "@/application/guests";
import {
  ListGuestReservations,
  ViewGuestReservation,
  ViewGuestSessionReservation,
} from "@/application/reservations";
import { guestReservationView } from "@/application/reservations/guest-reservation-reads";
import { LocalDate } from "@/domain/shared/local-date";
import { PhoneNumber } from "@/domain/guests";

// covers: M8-T11 AC-9 (authorization sweep, zero port calls on refusal),
// R-8 and T-LKP (a token that cannot be valid never reaches storage).

const principal = (
  role: StaffPrincipal["role"],
  branchIds: string[] = [],
): StaffPrincipal => ({
  id: "staff-1",
  name: "Staff",
  email: "staff@example.test",
  role,
  branchIds,
  sessionId: "session",
});
const query = { page: 1, pageSize: 25 };

function ports() {
  const reader = {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 25 })),
    find: vi.fn(async () => null),
  };
  const history = { listForGuest: vi.fn(async () => []) };
  const unitOfWork = { run: vi.fn() };
  const clock = { now: () => new Date("2031-03-01T10:00:00Z") };
  return { reader, history, unitOfWork, clock };
}
const calls = (p: ReturnType<typeof ports>) =>
  p.reader.list.mock.calls.length +
  p.reader.find.mock.calls.length +
  p.history.listForGuest.mock.calls.length +
  p.unitOfWork.run.mock.calls.length;

describe("staff guest use cases authorize before touching storage", () => {
  it("refuses signed out and unauthorized callers with zero port calls", async () => {
    const p = ports();
    const list = new ListGuests(p.reader);
    const get = new GetGuest(p.reader, p.history);
    const block = new ChangeGuestBlock(p, "BLOCK");
    const unblock = new ChangeGuestBlock(p, "UNBLOCK");

    for (const result of [
      await list.execute(null, query),
      await get.execute(null, "g1"),
      await block.execute(null, "g1", "reason"),
      await unblock.execute(null, "g1", "reason"),
    ])
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    // Editors read no guests. Receptionists read but never block (guests:block).
    for (const result of [
      await list.execute(principal("EDITOR"), query),
      await get.execute(principal("EDITOR"), "g1"),
      await block.execute(principal("RECEPTIONIST", ["b1"]), "g1", "reason"),
      await unblock.execute(principal("RECEPTIONIST", ["b1"]), "g1", "reason"),
    ])
      expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls(p)).toBe(0);
  });

  it("returns an empty page for a branch scoped role with no branches", async () => {
    const p = ports();
    const result = await new ListGuests(p.reader).execute(
      principal("RECEPTIONIST"),
      query,
    );
    expect(result).toEqual({
      ok: true,
      value: { items: [], total: 0, page: 1, pageSize: 25 },
    });
    expect(p.reader.list).not.toHaveBeenCalled();
  });

  it("treats a branch scoped role with no branches as seeing nothing, for reads and blocks", async () => {
    const p = ports();
    const nobody = principal("MANAGER");
    for (const result of [
      await new GetGuest(p.reader, p.history).execute(nobody, "g1"),
      await new ChangeGuestBlock(p, "BLOCK").execute(nobody, "g1", "reason"),
      await new ChangeGuestBlock(p, "UNBLOCK").execute(nobody, "g1", "reason"),
    ])
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(calls(p)).toBe(0);
  });

  it("lets a branch scoped manager act only on guests they can see", async () => {
    const p = ports();
    const manager = principal("MANAGER", ["b1"]);
    // The reader finds nothing in branch b1: the guest does not exist for them.
    for (const mode of ["BLOCK", "UNBLOCK"] as const)
      expect(
        await new ChangeGuestBlock(p, mode).execute(manager, "g1", "reason"),
      ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(p.reader.find).toHaveBeenCalledWith("g1", ["b1"]);
    expect(p.unitOfWork.run).not.toHaveBeenCalled();
    // Admin is not filtered, so no visibility lookup happens before the transaction.
    p.unitOfWork.run.mockResolvedValue({ ok: true, value: false });
    p.reader.find.mockClear();
    await new ChangeGuestBlock(p, "BLOCK").execute(
      principal("ADMIN"),
      "g1",
      "reason",
    );
    expect(p.unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(p.reader.find).toHaveBeenCalledTimes(1); // only the final view load
  });

  it("rejects a blank, oversized or non text reason before opening a transaction", async () => {
    const p = ports();
    const block = new ChangeGuestBlock(p, "BLOCK");
    for (const reason of ["", "   ", "x".repeat(501), 7, null]) {
      const result = await block.execute(
        principal("MANAGER", ["b1"]),
        "g1",
        reason,
      );
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          fieldErrors: { reason: expect.any(Array) },
        },
      });
    }
    expect(p.unitOfWork.run).not.toHaveBeenCalled();
  });
});

describe("bearerToken", () => {
  const header = (value?: string) =>
    new Headers(value === undefined ? {} : { authorization: value });
  it("reads only a single Bearer value", () => {
    expect(bearerToken(header("Bearer abc"))).toBe("abc");
    expect(bearerToken(header("bearer abc"))).toBe("abc");
    for (const bad of [undefined, "", "Bearer", "Bearer a b", "Basic abc"])
      expect(bearerToken(header(bad))).toBeNull();
  });
});

describe("guest reads refuse an impossible token before any lookup", () => {
  function guestPorts() {
    const reader = {
      findByManageTokenHash: vi.fn(async () => null),
      listForPhone: vi.fn(async () => []),
      findForPhone: vi.fn(async () => null),
    };
    const verifications = { findByTokenHash: vi.fn(async () => null) };
    const guests = { findByPhone: vi.fn(async () => null) };
    const crypto = { sha256: vi.fn((value: string) => value) };
    const clock = { now: () => new Date("2031-03-01T10:00:00Z") };
    return { reader, verifications, guests, crypto, clock };
  }

  it("G1 answers one 401 for a missing, short or unknown token", async () => {
    const p = guestPorts();
    const view = new ViewGuestReservation(p);
    const refusals = [
      await view.execute(null),
      await view.execute("short"),
      await view.execute("A".repeat(43)),
    ];
    for (const refusal of refusals) expect(refusal).toEqual(refusals[0]);
    expect(refusals[0]).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    // Only the well formed token was hashed and looked up.
    expect(p.reader.findByManageTokenHash).toHaveBeenCalledTimes(1);
  });

  it("G3 and G4 never read reservations for an unknown session", async () => {
    const p = guestPorts();
    const list = new ListGuestReservations(p);
    const open = new ViewGuestSessionReservation(p);
    for (const result of [
      await list.execute(null),
      await list.execute("A".repeat(43)),
      await open.execute("A".repeat(43), "RR-00000000"),
    ])
      expect(result).toMatchObject({
        ok: false,
        error: { code: "PHONE_NOT_VERIFIED" },
      });
    expect(p.reader.listForPhone).not.toHaveBeenCalled();
    expect(p.reader.findForPhone).not.toHaveBeenCalled();
  });

  it("refuses a blocked phone with a live token, without reading reservations", async () => {
    const p = guestPorts();
    const phone = "+12025550101";
    // Normally a block clears the token first; this is the defensive fallback.
    p.verifications.findByTokenHash.mockResolvedValue({
      id: "v1",
      phone,
      purpose: "GUEST_SESSION",
      codeHash: "0".repeat(64),
      attempts: 1,
      expiresAt: new Date("2031-03-01T10:10:00Z"),
      verifiedAt: new Date("2031-03-01T09:59:00Z"),
      tokenHash: "A".repeat(43),
      tokenExpiresAt: new Date("2031-03-01T10:30:00Z"),
      consumedAt: null,
      clientKey: "client",
      createdAt: new Date("2031-03-01T09:58:00Z"),
    } as never);
    p.guests.findByPhone.mockResolvedValue({
      blockedAt: new Date("2031-03-01T09:00:00Z"),
    } as never);
    for (const result of [
      await new ListGuestReservations(p).execute("A".repeat(43)),
      await new ViewGuestSessionReservation(p).execute(
        "A".repeat(43),
        "RR-00000000",
      ),
    ])
      expect(result).toMatchObject({
        ok: false,
        error: { code: "PHONE_BLOCKED" },
      });
    expect(p.reader.listForPhone).not.toHaveBeenCalled();
    expect(p.reader.findForPhone).not.toHaveBeenCalled();
  });
});

describe("guestReservationView contact rule (R-8)", () => {
  const stored = {
    id: "r1",
    reference: { value: "RR-00000000" },
    status: "CONFIRMED",
    paymentMethod: "PAY_AT_HOTEL",
    paymentStatus: "NOT_REQUIRED",
    stay: { checkIn: LocalDate.parse("2031-04-10") },
    lines: [],
    contact: {
      fullName: "Guest",
      email: null,
      phone: null,
      country: null,
      specialRequests: null,
    },
    snapshot: null,
    createdAt: new Date("2031-03-01T10:00:00Z"),
  };
  const record = (ownerPhone: string | null) =>
    ({
      stored,
      branch: { name: "B", slug: "b", phone: null, email: null },
      roomNames: {},
      ownerPhone,
      phoneBlocked: false,
      cancellationTiming: { timeZone: "Africa/Cairo", checkInTime: null },
      currentCancellationRequest: null,
    }) as never;
  const now = new Date("2031-03-01T10:00:00Z");
  const session = (phone: string) => ({
    kind: "GUEST_SESSION" as const,
    phone: PhoneNumber.parse(phone),
  });

  it("shows contact only when the session phone owns the reservation", () => {
    expect(
      guestReservationView(record("+12025550101"), session("+12025550101"), now)
        .contact,
    ).toMatchObject({ fullName: "Guest" });
    // A reader that ever returned another phone's reservation still shows no contact.
    expect(
      guestReservationView(record("+12025550102"), session("+12025550101"), now)
        .contact,
    ).toBeNull();
    expect(
      guestReservationView(record(null), session("+12025550101"), now).contact,
    ).toBeNull();
  });

  it("shows contact to the holder of that reservation's manage link only", () => {
    expect(
      guestReservationView(
        record(null),
        {
          kind: "MANAGE_TOKEN",
          reservationId: "r1",
        },
        now,
      ).contact,
    ).not.toBeNull();
    expect(
      guestReservationView(
        record(null),
        {
          kind: "MANAGE_TOKEN",
          reservationId: "other",
        },
        now,
      ).contact,
    ).toBeNull();
  });
});
