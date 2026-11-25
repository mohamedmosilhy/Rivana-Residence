import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth";
import {
  EMAIL_VERIFICATION_NEEDS_DELIVERY_MESSAGE,
  ManageVerificationSettings,
  type VerificationSettingsContext,
  type VerificationSettingsRecord,
  type VerificationSettingsRepository,
} from "@/application/guests";
import { success } from "@/application/shared/result";

// covers: Q-99 (the Admin switch for email verification), API-A9 use case.
const admin: StaffPrincipal = {
  id: "admin",
  name: "Admin",
  email: "admin@rivana.test",
  role: "ADMIN",
  sessionId: "session",
  branchIds: [],
};
const manager: StaffPrincipal = {
  ...admin,
  id: "manager",
  role: "MANAGER",
  branchIds: ["branch-1"],
};
const now = new Date("2026-11-25T12:00:00Z");
let record: VerificationSettingsRecord | null;
let deliveryConfigured: boolean;
const appended: Parameters<AuditLog["append"]>[0][] = [];
const settings: VerificationSettingsRepository = {
  read: async () => record,
  update: async (write) => {
    const before = record ?? { emailEnabled: false, updatedAt: write.now() };
    if (before.emailEnabled === write.emailEnabled)
      return success({ before, after: before, changed: false });
    record = { emailEnabled: write.emailEnabled, updatedAt: write.now() };
    return success({ before, after: record, changed: true });
  },
};
const audit: AuditLog = {
  append: vi.fn(async (event) => {
    appended.push(event);
  }),
} as unknown as AuditLog;
const useCase = () =>
  new ManageVerificationSettings({
    unitOfWork: {
      run: <T>(
        operation: (context: VerificationSettingsContext) => Promise<T>,
      ) => operation({ settings, audit }),
    },
    settings,
    emailDelivery: { isConfigured: () => deliveryConfigured },
    whatsApp: { isConfigured: async () => false },
    clock: { now: () => now },
  });

beforeEach(() => {
  record = { emailEnabled: false, updatedAt: new Date("2026-11-01T00:00:00Z") };
  deliveryConfigured = true;
  appended.length = 0;
});

describe("ManageVerificationSettings", () => {
  it("reads the switch, delivery, and WhatsApp state for an Admin", async () => {
    expect(await useCase().read(admin)).toEqual({
      ok: true,
      value: {
        emailVerificationEnabled: false,
        emailDeliveryConfigured: true,
        whatsAppConfigured: false,
        emailChannelReady: false,
        updatedAt: record!.updatedAt,
      },
    });
  });
  it("refuses a Manager and an anonymous caller", async () => {
    expect(await useCase().read(manager)).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(
      await useCase().update(null, { emailVerificationEnabled: true }),
    ).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(record!.emailEnabled).toBe(false);
  });
  it("turns email codes on and off, auditing each real change once", async () => {
    const on = await useCase().update(admin, {
      emailVerificationEnabled: true,
    });
    expect(on).toMatchObject({
      ok: true,
      value: { emailVerificationEnabled: true, emailChannelReady: true },
    });
    // Saving the same value changes nothing and writes no audit event.
    await useCase().update(admin, { emailVerificationEnabled: true });
    const off = await useCase().update(admin, {
      emailVerificationEnabled: false,
    });
    expect(off).toMatchObject({
      value: { emailVerificationEnabled: false, emailChannelReady: false },
    });
    expect(appended.map((event) => event.changes)).toEqual([
      { emailVerificationEnabled: { from: false, to: true } },
      { emailVerificationEnabled: { from: true, to: false } },
    ]);
    expect(appended[0]).toMatchObject({
      action: "verification-settings.updated",
      actorId: "admin",
      entityType: "VerificationSettings",
      entityId: "default",
      branchId: null,
    });
  });
  it("refuses to turn on while email delivery is not configured, but allows turning off", async () => {
    deliveryConfigured = false;
    expect(
      await useCase().update(admin, { emailVerificationEnabled: true }),
    ).toMatchObject({
      error: {
        code: "VALIDATION",
        fieldErrors: {
          emailVerificationEnabled: [EMAIL_VERIFICATION_NEEDS_DELIVERY_MESSAGE],
        },
      },
    });
    expect(appended).toHaveLength(0);
    record = { ...record!, emailEnabled: true };
    const off = await useCase().update(admin, {
      emailVerificationEnabled: false,
    });
    expect(off).toMatchObject({ value: { emailVerificationEnabled: false } });
    // On with delivery missing still reports the channel as not ready.
    record = { ...record!, emailEnabled: true };
    expect(await useCase().read(admin)).toMatchObject({
      value: { emailVerificationEnabled: true, emailChannelReady: false },
    });
  });
  it("reads a missing settings row as email codes off", async () => {
    record = null;
    expect(await useCase().read(admin)).toMatchObject({
      value: {
        emailVerificationEnabled: false,
        emailChannelReady: false,
        updatedAt: null,
      },
    });
  });
  it.each([
    {},
    { emailVerificationEnabled: "yes" },
    { emailVerificationEnabled: true, extra: 1 },
  ])("refuses %j", async (body) => {
    expect(await useCase().update(admin, body)).toMatchObject({
      error: { code: "VALIDATION" },
    });
  });
});
