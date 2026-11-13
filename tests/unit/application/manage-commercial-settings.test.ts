import { describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  ManageCommercialSettings,
  type CommercialSettingsContext,
  type CommercialSettingsRepository,
} from "@/application/commercial";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { success } from "@/application/shared/result";
import type { StaffRole } from "@/domain/shared/types";

const NOW = new Date("2031-01-01T10:00:00.000Z");

const principal = (role: StaffRole): StaffPrincipal => ({
  id: `staff-${role}`,
  name: role,
  email: `${role}@example.test`,
  role,
  sessionId: "session",
  branchIds: ["branch-a"],
});

function build() {
  let rate = 1500;
  const audits: unknown[] = [];
  const settings: CommercialSettingsRepository = {
    read: vi.fn(async () => ({ vatRateBasisPoints: rate, updatedAt: NOW })),
    update: vi.fn(async (write) => {
      const before = { vatRateBasisPoints: rate, updatedAt: NOW };
      const changed = rate !== write.vatRateBasisPoints;
      rate = write.vatRateBasisPoints;
      const after = { vatRateBasisPoints: rate, updatedAt: write.now() };
      return success({ before, after: changed ? after : before, changed });
    }),
  };
  const audit: AuditLog = {
    append: vi.fn(async (event) => {
      audits.push(event);
    }),
  };
  const context: CommercialSettingsContext = { settings, audit };
  const unitOfWork: ReservationUnitOfWork<CommercialSettingsContext> = {
    run: vi.fn((operation) => operation(context)),
  };
  return {
    manage: new ManageCommercialSettings({
      unitOfWork,
      settings,
      clock: { now: () => NOW },
    }),
    settings,
    unitOfWork,
    audits,
  };
}

describe("ManageCommercialSettings (API-A5)", () => {
  it("lets Admin, Manager and Receptionist read; refuses an Editor", async () => {
    const { manage } = build();
    for (const role of ["ADMIN", "MANAGER", "RECEPTIONIST"] as const) {
      expect(await manage.read(principal(role))).toMatchObject({
        ok: true,
        value: { vatRateBasisPoints: 1500 },
      });
    }
    expect(await manage.read(principal("EDITOR"))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("is Admin only to change, and refuses others before any write", async () => {
    const { manage, settings, unitOfWork } = build();
    for (const role of ["MANAGER", "RECEPTIONIST", "EDITOR"] as const) {
      expect(
        await manage.update(principal(role), { vatRateBasisPoints: 0 }),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect(await manage.update(null, { vatRateBasisPoints: 0 })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(settings.update).not.toHaveBeenCalled();
  });

  it("changes the rate and audits from and to once", async () => {
    const { manage, audits } = build();
    const result = await manage.update(principal("ADMIN"), {
      vatRateBasisPoints: 1400,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { vatRateBasisPoints: 1400 },
    });
    expect(audits).toEqual([
      expect.objectContaining({
        action: "commercial.update",
        entityType: "CommercialSettings",
        entityId: "default",
        branchId: null,
        actorId: "staff-ADMIN",
        changes: { vatRateBasisPoints: { from: 1500, to: 1400 } },
      }),
    ]);
  });

  it("accepts 0 and 10000 and writes no second audit for the same value", async () => {
    const { manage, audits } = build();
    const admin = principal("ADMIN");
    expect((await manage.update(admin, { vatRateBasisPoints: 0 })).ok).toBe(
      true,
    );
    expect((await manage.update(admin, { vatRateBasisPoints: 0 })).ok).toBe(
      true,
    );
    expect(audits).toHaveLength(1);
    expect(
      (await manage.update(admin, { vatRateBasisPoints: 10_000 })).ok,
    ).toBe(true);
    expect(audits).toHaveLength(2);
  });

  it.each([-1, 10_001, 15.5, null, "15", undefined])(
    "refuses %s with VALIDATION and changes nothing",
    async (value) => {
      const { manage, unitOfWork, audits } = build();
      const result = await manage.update(principal("ADMIN"), {
        vatRateBasisPoints: value,
      });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          fieldErrors: { vatRateBasisPoints: expect.any(Array) },
        },
      });
      expect(unitOfWork.run).not.toHaveBeenCalled();
      expect(audits).toHaveLength(0);
    },
  );
});
