// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { AuditLog } from "@/application/audit";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  ACTIVE_TEMPLATE_TAKEN,
  ManageWhatsAppSettings,
  ManageWhatsAppTemplates,
  SendWhatsAppTestMessage,
  TemplateWhatsAppSender,
  WhatsAppSetupReader,
  type StaffActionLimiter,
  type WhatsAppDelivery,
  type WhatsAppSettingsRecord,
  type WhatsAppSettingsRepository,
  type WhatsAppTemplateRecord,
  type WhatsAppTemplateRepository,
  type WhatsAppTransport,
  type WhatsAppTransportResult,
} from "@/application/notifications";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { failure, success } from "@/application/shared/result";
import type { AuditEvent } from "@/domain/audit";
import { PhoneNumber } from "@/domain/guests";
import type { StaffRole } from "@/domain/shared/types";

// M8-T4: the WhatsApp use cases and the template resolving sender over
// in-memory fakes. T-WA-1 and T-WA-2 at the unit level; the PostgreSQL
// versions are in tests/integration/reservations/whatsapp.test.ts.

const NOW = new Date("2031-01-01T10:00:00.000Z");
const PHONE = "+12025550101";

const principal = (role: StaffRole): StaffPrincipal => ({
  id: `staff-${role}`,
  name: role,
  email: `${role}@example.test`,
  role,
  sessionId: "session",
  branchIds: ["branch-a"],
});
const admin = principal("ADMIN");

function templateRecord(
  overrides: Partial<WhatsAppTemplateRecord> = {},
): WhatsAppTemplateRecord {
  return {
    id: "tmpl-booking",
    purpose: "BOOKING_CONFIRMED",
    language: "en",
    providerName: "booking_confirmed_v1",
    category: "UTILITY",
    variables: ["checkIn", "guestFirstName", "reference"],
    previewText: "Preview",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function world(
  options: {
    settings?: Partial<WhatsAppSettingsRecord>;
    templates?: WhatsAppTemplateRecord[];
    token?: boolean;
    transport?: WhatsAppTransportResult;
    limiter?: StaffActionLimiter["consume"];
  } = {},
) {
  let settingsRow: WhatsAppSettingsRecord = {
    businessPhoneNumber: "+201001234567",
    providerPhoneNumberId: "1234567890",
    lastTestAt: null,
    lastTestOk: null,
    lastTestError: null,
    updatedAt: NOW,
    ...options.settings,
  };
  const templates = [...(options.templates ?? [templateRecord()])];
  const audits: AuditEvent[] = [];
  const deliveries: WhatsAppDelivery[] = [];
  const settings: WhatsAppSettingsRepository = {
    read: vi.fn(async () => settingsRow),
    update: vi.fn(async (write) => {
      const before = settingsRow;
      const changed =
        before.businessPhoneNumber !== write.input.businessPhoneNumber ||
        before.providerPhoneNumberId !== write.input.providerPhoneNumberId;
      if (changed) {
        settingsRow = {
          ...settingsRow,
          ...write.input,
          updatedAt: write.now(),
        };
      }
      return success({ before, after: settingsRow, changed });
    }),
    recordTest: vi.fn(async (outcome) => {
      settingsRow = {
        ...settingsRow,
        lastTestAt: outcome.at,
        lastTestOk: outcome.ok,
        lastTestError: outcome.error,
      };
      return true;
    }),
  };
  const repository: WhatsAppTemplateRepository = {
    list: vi.fn(async () => templates),
    findById: vi.fn(
      async (id) => templates.find((item) => item.id === id) ?? null,
    ),
    findActive: vi.fn(
      async (purpose, language) =>
        templates.find(
          (item) =>
            item.active &&
            item.purpose === purpose &&
            item.language === language,
        ) ?? null,
    ),
    create: vi.fn(async (id, input) => {
      const clash = templates.some(
        (item) =>
          input.active &&
          item.active &&
          item.purpose === input.purpose &&
          item.language === input.language,
      );
      if (clash) return failure("CONFLICT", "unique");
      const created = templateRecord({ ...input, id });
      templates.push(created);
      return success(created);
    }),
    lock: vi.fn(async (id) =>
      success(templates.find((item) => item.id === id) ?? null),
    ),
    replace: vi.fn(async (id, input) => {
      const index = templates.findIndex((item) => item.id === id);
      const replaced = templateRecord({ ...templates[index], ...input, id });
      templates[index] = replaced;
      return success(replaced);
    }),
  };
  const transport: WhatsAppTransport = {
    deliver: vi.fn(async (delivery) => {
      deliveries.push(delivery);
      const ok: WhatsAppTransportResult = {
        ok: true,
        providerMessageId: "wamid.1",
      };
      return options.transport ?? ok;
    }),
  };
  const audit: AuditLog = {
    append: vi.fn(async (event) => {
      audits.push(event);
    }),
  };
  const unitOfWork = <C>(context: C): ReservationUnitOfWork<C> => ({
    run: vi.fn((operation) => operation(context)),
  });
  const limiter: StaffActionLimiter = {
    consume: vi.fn<StaffActionLimiter["consume"]>(
      options.limiter ?? (async () => ({ allowed: true })),
    ),
  };
  const accessTokenConfigured = options.token ?? true;
  const sender = new TemplateWhatsAppSender({
    settings,
    templates: repository,
    transport,
    accessTokenConfigured,
  });
  const setup = new WhatsAppSetupReader({
    settings,
    templates: repository,
    accessTokenConfigured,
  });
  const clock = { now: () => NOW };
  let nextId = 0;
  return {
    settings,
    repository,
    transport,
    limiter,
    audits,
    deliveries,
    sender,
    setup,
    manageSettings: new ManageWhatsAppSettings({
      unitOfWork: unitOfWork({ settings, audit }),
      setup,
      clock,
    }),
    manageTemplates: new ManageWhatsAppTemplates({
      unitOfWork: unitOfWork({ templates: repository, audit }),
      templates: repository,
      clock,
      ids: { next: () => `tmpl-${++nextId}` },
    }),
    testMessage: new SendWhatsAppTestMessage({
      unitOfWork: unitOfWork({ settings, audit }),
      templates: repository,
      sender,
      limiter,
      clock,
    }),
  };
}

const message = {
  purpose: "BOOKING_CONFIRMED" as const,
  language: "en",
  to: PhoneNumber.parse(PHONE),
  variables: {
    guestFirstName: "Mona",
    reference: "RIV-123",
    checkIn: "2031-02-01",
    total: "USD 10.00",
  },
};

describe("TemplateWhatsAppSender (T-WA-1, T-WA-2)", () => {
  it("resolves purpose and language and orders values by the template", async () => {
    const { sender, deliveries } = world();
    expect(await sender.send(message)).toEqual({
      ok: true,
      providerMessageId: "wamid.1",
    });
    expect(deliveries).toEqual([
      {
        phoneNumberId: "1234567890",
        templateName: "booking_confirmed_v1",
        language: "en",
        category: "UTILITY",
        to: message.to,
        parameters: ["2031-02-01", "Mona", "RIV-123"],
      },
    ]);
  });

  it.each([
    ["the number is empty", { settings: { businessPhoneNumber: null } }],
    [
      "the phone number id is empty",
      { settings: { providerPhoneNumberId: null } },
    ],
    ["the access token is missing", { token: false }],
  ])("sends nothing when %s", async (_case, options) => {
    const { sender, deliveries, repository } = world(options);
    expect(await sender.send(message)).toMatchObject({
      ok: false,
      code: "NOT_CONFIGURED",
    });
    expect(deliveries).toEqual([]);
    expect(repository.findActive).not.toHaveBeenCalled();
  });

  it("sends nothing without an active template for the purpose", async () => {
    const { sender, deliveries } = world({
      templates: [templateRecord({ active: false })],
    });
    expect(await sender.send(message)).toMatchObject({
      ok: false,
      code: "TEMPLATE_MISSING",
    });
    expect(deliveries).toEqual([]);
  });

  it("sends nothing when the message lacks a value the template needs", async () => {
    const { sender, deliveries } = world();
    const result = await sender.send({
      ...message,
      variables: { guestFirstName: "Mona" },
    });
    expect(result).toMatchObject({ ok: false, code: "TEMPLATE_MISSING" });
    expect(deliveries).toEqual([]);
  });

  it("passes typed provider failures through unchanged", async () => {
    const failed = {
      ok: false as const,
      code: "UNAVAILABLE" as const,
      detail: "WhatsApp could not be reached.",
    };
    const { sender } = world({ transport: failed });
    expect(await sender.send(message)).toEqual(failed);
  });
});

describe("ManageWhatsAppSettings (T-WA-4)", () => {
  it.each(["MANAGER", "RECEPTIONIST", "EDITOR"] as const)(
    "refuses a %s before any read",
    async (role) => {
      const { manageSettings, settings } = world();
      expect(await manageSettings.read(principal(role))).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(
        await manageSettings.update(principal(role), {
          businessPhoneNumber: null,
          providerPhoneNumberId: null,
        }),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(settings.read).not.toHaveBeenCalled();
      expect(settings.update).not.toHaveBeenCalled();
    },
  );

  it("reports the token only as a flag, with readiness and gaps", async () => {
    const { manageSettings } = world({ token: false });
    const result = await manageSettings.read(admin);
    expect(result).toMatchObject({
      ok: true,
      value: {
        accessTokenConfigured: false,
        configured: false,
        businessPhoneNumber: "+201001234567",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/token"\s*:\s*"/i);
  });

  it("audits only the fields that changed", async () => {
    const { manageSettings, audits } = world();
    const result = await manageSettings.update(admin, {
      businessPhoneNumber: "+20 100 123 4567",
      providerPhoneNumberId: "999",
    });
    expect(result.ok).toBe(true);
    expect(audits).toEqual([
      expect.objectContaining({
        action: "whatsapp-settings.updated",
        entityType: "WhatsAppSettings",
        actorId: admin.id,
        changes: { providerPhoneNumberId: { from: "1234567890", to: "999" } },
      }),
    ]);
  });

  it("writes no audit for an identical save", async () => {
    const { manageSettings, audits } = world();
    await manageSettings.update(admin, {
      businessPhoneNumber: "+201001234567",
      providerPhoneNumberId: "1234567890",
    });
    expect(audits).toEqual([]);
  });

  it("allows clearing the number (Q-71)", async () => {
    const { manageSettings } = world();
    expect(
      await manageSettings.update(admin, {
        businessPhoneNumber: null,
        providerPhoneNumberId: "1234567890",
      }),
    ).toMatchObject({ ok: true, value: { configured: false } });
  });
});

describe("ManageWhatsAppTemplates (T-WA-4, T-WA-5)", () => {
  const input = {
    purpose: "MANAGE_LINK",
    language: "en",
    providerName: "manage_link_v1",
    category: "UTILITY",
    variables: ["guestFirstName", "manageLink"],
    previewText: "Your link: {{2}}",
    active: true,
  };

  it("refuses a non Admin before any repository call", async () => {
    const { manageTemplates, repository } = world();
    for (const role of ["MANAGER", "RECEPTIONIST", "EDITOR"] as const) {
      expect(await manageTemplates.list(principal(role))).toMatchObject({
        error: { code: "FORBIDDEN" },
      });
      expect(
        await manageTemplates.create(principal(role), input),
      ).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(
        await manageTemplates.update(principal(role), "tmpl-booking", {}),
      ).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.lock).not.toHaveBeenCalled();
  });

  it("creates and audits without copying the preview text", async () => {
    const { manageTemplates, audits } = world();
    expect(await manageTemplates.create(admin, input)).toMatchObject({
      ok: true,
      value: { id: "tmpl-1", purpose: "MANAGE_LINK" },
    });
    expect(audits).toEqual([
      expect.objectContaining({
        action: "whatsapp-template.created",
        entityId: "tmpl-1",
        changes: {
          before: null,
          after: {
            purpose: "MANAGE_LINK",
            language: "en",
            providerName: "manage_link_v1",
            category: "UTILITY",
            variables: ["guestFirstName", "manageLink"],
            active: true,
          },
          previewChanged: true,
        },
      }),
    ]);
  });

  it("refuses an unknown key with 422 before writing", async () => {
    const { manageTemplates, repository } = world();
    expect(
      await manageTemplates.create(admin, {
        ...input,
        variables: ["guestEmail"],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { variables: expect.any(Array) },
      },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("explains a second active template next to the active field", async () => {
    const { manageTemplates } = world();
    expect(
      await manageTemplates.create(admin, {
        ...input,
        purpose: "BOOKING_CONFIRMED",
        variables: ["reference"],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        fieldErrors: { active: [ACTIVE_TEMPLATE_TAKEN] },
      },
    });
  });

  it("validates the patch merged onto the stored template", async () => {
    const { manageTemplates, repository } = world();
    expect(
      await manageTemplates.update(admin, "tmpl-booking", {
        purpose: "VERIFICATION_CODE",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it("deactivates with a before and after audit", async () => {
    const { manageTemplates, audits } = world();
    expect(
      await manageTemplates.update(admin, "tmpl-booking", { active: false }),
    ).toMatchObject({ ok: true, value: { active: false } });
    expect(audits).toEqual([
      expect.objectContaining({
        action: "whatsapp-template.updated",
        changes: expect.objectContaining({
          before: expect.objectContaining({ active: true }),
          after: expect.objectContaining({ active: false }),
          previewChanged: false,
        }),
      }),
    ]);
  });

  it("writes nothing for an identical patch, and 404s an unknown id", async () => {
    const { manageTemplates, repository, audits } = world();
    expect(
      (await manageTemplates.update(admin, "tmpl-booking", { active: true }))
        .ok,
    ).toBe(true);
    expect(repository.replace).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
    expect(
      await manageTemplates.update(admin, "missing", { active: true }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("SendWhatsAppTestMessage (T-WA-7)", () => {
  const testTemplate = templateRecord({
    id: "tmpl-test",
    purpose: "TEST",
    providerName: "hello_world",
    variables: ["guestFirstName"],
  });

  it("refuses a non Admin before using a limiter slot", async () => {
    const { testMessage, limiter, deliveries } = world();
    for (const role of ["MANAGER", "RECEPTIONIST", "EDITOR"] as const) {
      expect(
        await testMessage.execute(principal(role), { phone: PHONE }),
      ).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(deliveries).toEqual([]);
  });

  it("sends the active TEST template with fake sample values", async () => {
    const { testMessage, deliveries, limiter } = world({
      templates: [testTemplate],
    });
    expect(await testMessage.execute(admin, { phone: PHONE })).toEqual({
      ok: true,
      value: { providerMessageId: "wamid.1" },
    });
    expect(limiter.consume).toHaveBeenCalledWith(admin.id);
    expect(deliveries[0]).toMatchObject({
      templateName: "hello_world",
      parameters: ["Test"],
    });
  });

  it("stores the result and audits it without the recipient", async () => {
    const { testMessage, settings, audits } = world({
      templates: [testTemplate],
    });
    await testMessage.execute(admin, { phone: PHONE });
    expect(settings.recordTest).toHaveBeenCalledWith({
      at: NOW,
      ok: true,
      error: null,
    });
    expect(audits).toEqual([
      expect.objectContaining({
        action: "whatsapp-test.sent",
        changes: {
          templateId: "tmpl-test",
          purpose: "TEST",
          ok: true,
          failure: null,
        },
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain(PHONE.slice(1));
  });

  it("still audits a sent message when the settings row is busy", async () => {
    const { testMessage, settings, audits } = world({
      templates: [testTemplate],
    });
    vi.mocked(settings.recordTest).mockResolvedValueOnce(false);
    expect((await testMessage.execute(admin, { phone: PHONE })).ok).toBe(true);
    expect(audits).toHaveLength(1);
  });

  it("sends a chosen template, even an inactive one", async () => {
    const { testMessage, deliveries } = world({
      templates: [templateRecord({ active: false })],
    });
    expect(
      (
        await testMessage.execute(admin, {
          phone: PHONE,
          templateId: "tmpl-booking",
        })
      ).ok,
    ).toBe(true);
    expect(deliveries[0]?.parameters).toEqual([
      "2030-01-01",
      "Test",
      "TEST-0000",
    ]);
  });

  it("returns 404 for an unknown template id", async () => {
    const { testMessage } = world();
    expect(
      await testMessage.execute(admin, { phone: PHONE, templateId: "nope" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("maps a provider refusal to WHATSAPP_TEST_FAILED and stores it", async () => {
    const { testMessage, settings } = world({
      templates: [testTemplate],
      transport: {
        ok: false,
        code: "PROVIDER_REJECTED",
        detail:
          "WhatsApp error 132001 (HTTP 404): Template name does not exist",
      },
    });
    expect(await testMessage.execute(admin, { phone: PHONE })).toMatchObject({
      ok: false,
      error: {
        code: "WHATSAPP_TEST_FAILED",
        message: expect.stringContaining("Template name does not exist"),
      },
    });
    expect(settings.recordTest).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it("maps missing setup or template to WHATSAPP_NOT_CONFIGURED, sending nothing", async () => {
    const empty = world({ settings: { businessPhoneNumber: null } });
    expect(
      await empty.testMessage.execute(admin, { phone: PHONE }),
    ).toMatchObject({ error: { code: "WHATSAPP_NOT_CONFIGURED" } });
    const noTest = world();
    expect(
      await noTest.testMessage.execute(admin, { phone: PHONE }),
    ).toMatchObject({ error: { code: "WHATSAPP_NOT_CONFIGURED" } });
    expect([...empty.deliveries, ...noTest.deliveries]).toEqual([]);
    expect(noTest.settings.recordTest).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
  });

  it("refuses with Retry-After once the Admin's window is full", async () => {
    const { testMessage, deliveries } = world({
      templates: [testTemplate],
      limiter: async () => ({ allowed: false, retryAfterSeconds: 321 }),
    });
    expect(await testMessage.execute(admin, { phone: PHONE })).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED", retryAfterSeconds: 321 },
    });
    expect(deliveries).toEqual([]);
  });

  it("refuses an invalid phone with 422 before using a limiter slot", async () => {
    const { testMessage, limiter } = world();
    expect(await testMessage.execute(admin, { phone: "0100" })).toMatchObject({
      error: { code: "VALIDATION", fieldErrors: { phone: expect.any(Array) } },
    });
    expect(limiter.consume).not.toHaveBeenCalled();
  });
});
