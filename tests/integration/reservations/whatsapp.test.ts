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
  ManageWhatsAppTemplates,
  type WhatsAppTemplateContext,
} from "@/application/notifications";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Result } from "@/application/shared/result";
import { PhoneNumber } from "@/domain/guests";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaWhatsAppTemplateRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-template-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import type { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";

import {
  createActor,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";

// M8-T4 on real PostgreSQL through the Route Handlers: T-WA-1, T-WA-3…T-WA-7,
// the branch guard, and the active template race (20 observed waits).

const session = vi.hoisted(() => ({ staff: null as StaffPrincipal | null }));

vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(load: () => Promise<T>) =>
    () =>
      load(),
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => session.staff,
  throttleKeys: () => ({
    namespaced: (namespace: string, value: string) =>
      `rl:${namespace}:${value}`,
  }),
}));

const settingsRoute = await import(
  "@/app/api/v1/staff/settings/whatsapp/route"
);
const testRoute = await import(
  "@/app/api/v1/staff/settings/whatsapp/test-message/route"
);
const templatesRoute = await import(
  "@/app/api/v1/staff/whatsapp-templates/route"
);
const templateRoute = await import(
  "@/app/api/v1/staff/whatsapp-templates/[id]/route"
);
const branchRoute = await import("@/app/api/v1/staff/branches/[id]/route");
const { whatsAppSender, whatsAppTransport } = await import(
  "@/composition/notifications"
);

const client = createTestClient();
const fake = () => whatsAppTransport() as FakeWhatsAppTransport;
const ORIGIN = "http://localhost:3000";
const PHONE = "+12025550101";
const REJECTED = "+12025550199";

const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Test",
  email: "t@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};
const other = (role: StaffPrincipal["role"]): StaffPrincipal => ({
  ...admin,
  id: `actor-${role.toLowerCase()}`,
  role,
  branchIds: [TEST_BRANCH_ID],
});

const request = (method: string, path: string, body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = (value: Record<string, string> = {}) => ({
  params: Promise.resolve(value),
});

const readSetup = () =>
  settingsRoute.GET(
    request("GET", "/api/v1/staff/settings/whatsapp"),
    params(),
  );
const putSetup = (body: unknown) =>
  settingsRoute.PUT(
    request("PUT", "/api/v1/staff/settings/whatsapp", body),
    params(),
  );
const listTemplates = () =>
  templatesRoute.GET(
    request("GET", "/api/v1/staff/whatsapp-templates"),
    params(),
  );
const createTemplate = (body: unknown) =>
  templatesRoute.POST(
    request("POST", "/api/v1/staff/whatsapp-templates", body),
    params(),
  );
const patchTemplate = (id: string, body: unknown) =>
  templateRoute.PATCH(
    request("PATCH", `/api/v1/staff/whatsapp-templates/${id}`, body),
    params({ id }),
  );
const sendTest = (body: unknown) =>
  testRoute.POST(
    request("POST", "/api/v1/staff/settings/whatsapp/test-message", body),
    params(),
  );
const patchBranch = (body: unknown) =>
  branchRoute.PATCH(
    request("PATCH", `/api/v1/staff/branches/${TEST_BRANCH_ID}`, body),
    params({ id: TEST_BRANCH_ID }),
  );

const template = (overrides: Record<string, unknown> = {}) => ({
  purpose: "BOOKING_CONFIRMED",
  language: "en",
  providerName: "booking_confirmed_v1",
  category: "UTILITY",
  variables: ["reference", "guestFirstName"],
  previewText: "Booking {{1}} confirmed, {{2}}.",
  active: true,
  ...overrides,
});
const verification = template({
  purpose: "VERIFICATION_CODE",
  providerName: "verification_code_v1",
  category: "AUTHENTICATION",
  variables: ["code"],
  previewText: "Your code is {{1}}.",
});
const testTemplate = template({
  purpose: "TEST",
  providerName: "hello_world",
  variables: ["guestFirstName"],
  previewText: "Hello {{1}}",
});
const configure = async () => {
  expect(
    (
      await putSetup({
        businessPhoneNumber: "+201001234567",
        providerPhoneNumberId: "1098765432",
      })
    ).status,
  ).toBe(200);
};

const audits = (action: string) =>
  client.auditEvent.findMany({
    where: { action },
    orderBy: { occurredAt: "asc" },
  });

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await client.user.createMany({
    data: ["MANAGER", "RECEPTIONIST", "EDITOR"].map((role) => ({
      id: `actor-${role.toLowerCase()}`,
      name: role,
      email: `${role.toLowerCase()}@example.test`,
      role: role as StaffPrincipal["role"],
    })),
  });
  fake().deliveries.length = 0;
  session.staff = admin;
});
afterEach(() => vi.restoreAllMocks());

describe("API-A6 settings (T-WA-4)", () => {
  it("starts unconfigured with blocking gaps, and never shows a token", async () => {
    const response = await readSetup();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      businessPhoneNumber: null,
      providerPhoneNumberId: null,
      accessTokenConfigured: true,
      configured: false,
      lastTest: null,
    });
    expect(body.setupGaps.slice(0, 2)).toEqual([
      { purpose: "VERIFICATION_CODE", language: "en", blocking: true },
      { purpose: "BOOKING_CONFIRMED", language: "en", blocking: true },
    ]);
    expect(Object.keys(body)).not.toContain("accessToken");
  });

  it("saves the number as E.164 with one audit event", async () => {
    const response = await putSetup({
      businessPhoneNumber: "+20 100 123 4567",
      providerPhoneNumberId: "1098765432",
    });
    expect(await response.json()).toMatchObject({
      businessPhoneNumber: "+201001234567",
      providerPhoneNumberId: "1098765432",
    });
    const [event, ...rest] = await audits("whatsapp-settings.updated");
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      actorId: admin.id,
      entityType: "WhatsAppSettings",
      changes: {
        businessPhoneNumber: { from: null, to: "+201001234567" },
        providerPhoneNumberId: { from: null, to: "1098765432" },
      },
    });
    const row = await client.whatsAppSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(row.updatedById).toBe(admin.id);
  });

  it("refuses an access token field and an invalid number with 422", async () => {
    expect(
      (
        await putSetup({
          businessPhoneNumber: null,
          providerPhoneNumberId: null,
          accessToken: "EAAG-secret",
        })
      ).status,
    ).toBe(422);
    const invalid = await putSetup({
      businessPhoneNumber: "0100 123 4567",
      providerPhoneNumberId: "1",
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).fieldErrors).toHaveProperty(
      "businessPhoneNumber",
    );
    expect(await audits("whatsapp-settings.updated")).toEqual([]);
  });

  it.each(["MANAGER", "RECEPTIONIST", "EDITOR"] as const)(
    "refuses a %s on every WhatsApp endpoint",
    async (role) => {
      session.staff = other(role);
      expect((await readSetup()).status).toBe(403);
      expect(
        (
          await putSetup({
            businessPhoneNumber: null,
            providerPhoneNumberId: null,
          })
        ).status,
      ).toBe(403);
      expect((await listTemplates()).status).toBe(403);
      expect((await createTemplate(template())).status).toBe(403);
      expect((await patchTemplate("missing", { active: false })).status).toBe(
        403,
      );
      expect((await sendTest({ phone: PHONE })).status).toBe(403);
      expect(await client.whatsAppTemplate.count()).toBe(0);
      expect(await client.loginThrottle.count()).toBe(0);
      expect(await client.auditEvent.count()).toBe(0);
    },
  );

  it("refuses a signed-out caller with 401", async () => {
    session.staff = null;
    expect((await readSetup()).status).toBe(401);
    expect((await sendTest({ phone: PHONE })).status).toBe(401);
  });

  it("counts as configured with number, id, token, and both templates (Q-71)", async () => {
    await configure();
    expect((await createTemplate(template())).status).toBe(201);
    expect((await (await readSetup()).json()).configured).toBe(false);
    expect((await createTemplate(verification)).status).toBe(201);
    const body = await (await readSetup()).json();
    expect(body.configured).toBe(true);
    expect(
      body.setupGaps.every((gap: { blocking: boolean }) => !gap.blocking),
    ).toBe(true);
  });
});

describe("API-A7 templates (T-WA-4, T-WA-5)", () => {
  it("creates with Location and an audit event that omits the preview", async () => {
    const response = await createTemplate(template());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(response.headers.get("location")).toBe(
      `/api/v1/staff/whatsapp-templates/${body.id}`,
    );
    const [event] = await audits("whatsapp-template.created");
    expect(event?.changes).toEqual({
      before: null,
      after: {
        purpose: "BOOKING_CONFIRMED",
        language: "en",
        providerName: "booking_confirmed_v1",
        category: "UTILITY",
        variables: ["reference", "guestFirstName"],
        active: true,
      },
      previewChanged: true,
    });
    expect((await (await listTemplates()).json()).items).toHaveLength(1);
  });

  it("refuses unknown and disallowed variable keys with 422", async () => {
    for (const variables of [["guestPhone"], ["code"]]) {
      const response = await createTemplate(template({ variables }));
      expect(response.status).toBe(422);
      expect((await response.json()).fieldErrors).toHaveProperty("variables");
    }
    expect(await client.whatsAppTemplate.count()).toBe(0);
  });

  it("keeps one active template per purpose and language", async () => {
    const first = await (await createTemplate(template())).json();
    const second = await createTemplate(
      template({ providerName: "booking_v2" }),
    );
    expect(second.status).toBe(409);
    expect((await second.json()).fieldErrors).toHaveProperty("active");
    // An Arabic template, an inactive one, and several marketing ones are fine.
    expect((await createTemplate(template({ language: "ar" }))).status).toBe(
      201,
    );
    expect(
      (await createTemplate(template({ providerName: "b3", active: false })))
        .status,
    ).toBe(201);
    const marketing = template({
      purpose: "MARKETING",
      category: "MARKETING",
      variables: ["guestFirstName"],
    });
    expect((await createTemplate(marketing)).status).toBe(201);
    expect(
      (await createTemplate({ ...marketing, providerName: "promo_2" })).status,
    ).toBe(201);
    // Deactivating the first frees the slot for the second.
    expect((await patchTemplate(first.id, { active: false })).status).toBe(200);
    expect(
      (await createTemplate(template({ providerName: "booking_v2" }))).status,
    ).toBe(201);
    expect(await audits("whatsapp-template.updated")).toHaveLength(1);
  });

  it("validates a patch against the merged template, and 404s unknown ids", async () => {
    const created = await (await createTemplate(template())).json();
    const bad = await patchTemplate(created.id, {
      purpose: "VERIFICATION_CODE",
    });
    expect(bad.status).toBe(422);
    expect((await patchTemplate("missing-id", { active: false })).status).toBe(
      404,
    );
    const reactivating = await patchTemplate(created.id, {
      variables: ["total"],
    });
    expect(await reactivating.json()).toMatchObject({ variables: ["total"] });
  });

  it("refuses a second active template under a parallel race, 20 observed waits", async () => {
    await withIndependentClients(2, async ([holder, contender]) => {
      if (!holder || !contender) throw new Error("Missing independent clients");
      for (let round = 0; round < 20; round++) {
        await client.whatsAppTemplate.deleteMany();
        const inserted = deferred();
        const release = deferred();
        const pid = deferred<number>();
        const holding = holder.$transaction(
          async (tx) => {
            await tx.whatsAppTemplate.create({
              data: {
                id: `held-${round}`,
                ...template(),
                updatedAt: new Date(),
              },
            });
            inserted.resolve();
            await release.promise;
          },
          { timeout: 15_000 },
        );
        await inserted.promise;
        const contending = templatesUseCase(contender, pid.resolve).create(
          admin,
          template({ providerName: "racing" }),
        );
        try {
          await waitForDatabaseLock(client, await pid.promise);
        } finally {
          release.resolve();
        }
        await holding;
        expect(await contending).toMatchObject({
          ok: false,
          error: {
            code: "CONFLICT",
            fieldErrors: { active: expect.any(Array) },
          },
        });
        expect(
          await client.whatsAppTemplate.count({ where: { active: true } }),
        ).toBe(1);
        expect(await audits("whatsapp-template.created")).toEqual([]);
      }
    });
  });
});

/** The production use case on an independent client, reporting its backend pid. */
function templatesUseCase(
  prisma: PrismaClient,
  onBackend: (pid: number) => void,
) {
  let transactionClient: Parameters<
    ConstructorParameters<
      typeof PrismaReservationUnitOfWork<WhatsAppTemplateContext>
    >[1]
  >[0];
  const inner = new PrismaReservationUnitOfWork<WhatsAppTemplateContext>(
    prisma,
    (transaction) => {
      transactionClient = transaction;
      return {
        templates: new PrismaWhatsAppTemplateRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      };
    },
  );
  const unitOfWork: ReservationUnitOfWork<WhatsAppTemplateContext> = {
    run: <T>(
      operation: (context: WhatsAppTemplateContext) => Promise<Result<T>>,
    ) =>
      inner.run(async (context) => {
        const [backend] = await transactionClient.$queryRaw<
          Readonly<{ pid: number }>[]
        >`SELECT pg_backend_pid()::int AS pid`;
        onBackend(backend!.pid);
        return operation(context);
      }),
  };
  return new ManageWhatsAppTemplates({
    unitOfWork,
    templates: new PrismaWhatsAppTemplateRepository(prisma),
    clock: { now: () => new Date() },
    ids: { next: () => `race-${Math.random().toString(36).slice(2, 12)}` },
  });
}

describe("WhatsAppSender over stored setup (T-WA-1, T-WA-6)", () => {
  const message = {
    purpose: "BOOKING_CONFIRMED" as const,
    language: "en",
    to: PhoneNumber.parse(PHONE),
    variables: { guestFirstName: "Mona", reference: "RIV-123" },
  };

  it("sends nothing while the number is empty", async () => {
    expect((await createTemplate(template())).status).toBe(201);
    expect(await whatsAppSender().send(message)).toMatchObject({
      ok: false,
      code: "NOT_CONFIGURED",
    });
    expect(fake().deliveries).toEqual([]);
  });

  it("sends nothing without an active template for the purpose", async () => {
    await configure();
    expect(await whatsAppSender().send(message)).toMatchObject({
      ok: false,
      code: "TEMPLATE_MISSING",
    });
    expect(fake().deliveries).toEqual([]);
  });

  it("resolves the active template and orders values by its variables", async () => {
    await configure();
    await createTemplate(template({ active: false, providerName: "old" }));
    await createTemplate(template());
    expect(await whatsAppSender().send(message)).toMatchObject({ ok: true });
    expect(fake().deliveries).toEqual([
      expect.objectContaining({
        phoneNumberId: "1098765432",
        templateName: "booking_confirmed_v1",
        language: "en",
        parameters: ["RIV-123", "Mona"],
      }),
    ]);
  });
});

describe("a stored template the code cannot read", () => {
  it("is skipped instead of failing every read and send", async () => {
    await configure();
    await createTemplate(template());
    await client.whatsAppTemplate.create({
      data: {
        id: "legacy-row",
        ...template({
          purpose: "MANAGE_LINK",
          providerName: "legacy_v1",
          variables: ["removedKey"],
        }),
        updatedAt: new Date(),
      },
    });
    expect((await readSetup()).status).toBe(200);
    const list = await templatesRoute.GET(
      request("GET", "/api/v1/staff/whatsapp-templates"),
      params(),
    );
    expect(list.status).toBe(200);
    expect((await list.json()).items).toHaveLength(1);
  });
});

describe("API-A8 test message (T-WA-3, T-WA-7)", () => {
  it("reports and stores a missing TEST template as not configured", async () => {
    await configure();
    const response = await sendTest({ phone: PHONE });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("WHATSAPP_NOT_CONFIGURED");
    expect((await (await readSetup()).json()).lastTest).toMatchObject({
      ok: false,
      error: expect.stringContaining("no active WhatsApp template"),
    });
    expect(fake().deliveries).toEqual([]);
  });

  it("sends the TEST template, stores the result, and audits without the phone", async () => {
    await configure();
    await createTemplate(testTemplate);
    const response = await sendTest({ phone: PHONE });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      providerMessageId: expect.stringMatching(/^fake-/),
    });
    expect(fake().deliveries).toEqual([
      expect.objectContaining({
        templateName: "hello_world",
        parameters: ["Test"],
      }),
    ]);
    expect((await (await readSetup()).json()).lastTest).toMatchObject({
      ok: true,
      error: null,
    });
    const events = await audits("whatsapp-test.sent");
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("2025550101");
  });

  it("returns 502 with the provider text when the provider refuses", async () => {
    await configure();
    await createTemplate(testTemplate);
    const response = await sendTest({ phone: REJECTED });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "WHATSAPP_TEST_FAILED",
      detail: expect.stringContaining("always refused"),
    });
    expect((await (await readSetup()).json()).lastTest.ok).toBe(false);
  });

  it("allows 5 tests per 10 minutes per Admin, then 429 with Retry-After", async () => {
    await configure();
    await createTemplate(testTemplate);
    for (let index = 0; index < 5; index++) {
      expect((await sendTest({ phone: PHONE })).status).toBe(200);
    }
    const limited = await sendTest({ phone: PHONE });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(500);
    expect(fake().deliveries).toHaveLength(5);
    expect(await audits("whatsapp-test.sent")).toHaveLength(5);
    // Another Admin has a separate window.
    session.staff = { ...admin, id: "actor-admin-2" };
    await client.user.create({
      data: {
        id: "actor-admin-2",
        name: "Second",
        email: "second@example.test",
        role: "ADMIN",
      },
    });
    expect((await sendTest({ phone: PHONE })).status).toBe(200);
  });

  it("writes no guest phone, code, or token to any log line (captured logs)", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    await configure();
    await createTemplate(testTemplate);
    await createTemplate(verification);
    const bodies = [
      await (await sendTest({ phone: PHONE })).text(),
      await (await sendTest({ phone: REJECTED })).text(),
      await (
        await sendTest({
          phone: PHONE,
          templateId: (
            await client.whatsAppTemplate.findFirstOrThrow({
              where: { purpose: "VERIFICATION_CODE" },
            })
          ).id,
        })
      ).text(),
    ];
    const everything = [...lines, ...bodies].join("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of ["2025550101", "2025550199", "123456", "EAAG"]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe("Branch online booking guard (FR-BR-3, Q-71)", () => {
  it("refuses while WhatsApp is not configured, then until M10", async () => {
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { checkInTime: "14:00" },
    });
    const notConfigured = await patchBranch({ onlineBookingEnabled: true });
    expect(notConfigured.status).toBe(422);
    expect(
      (await notConfigured.json()).fieldErrors.onlineBookingEnabled,
    ).toEqual([
      "Online booking can't be turned on until WhatsApp messaging is set up.",
    ]);

    await configure();
    await createTemplate(template());
    await createTemplate(verification);
    const notYet = await patchBranch({ onlineBookingEnabled: true });
    expect(notYet.status).toBe(422);
    expect((await notYet.json()).fieldErrors.onlineBookingEnabled).toEqual([
      "Online booking can't be turned on yet. The booking journey arrives in a later release.",
    ]);
    const branch = await client.branch.findUniqueOrThrow({
      where: { id: TEST_BRANCH_ID },
    });
    expect(branch.onlineBookingEnabled).toBe(false);
  });

  it("asks for the check-in time once WhatsApp is configured", async () => {
    await configure();
    await createTemplate(template());
    await createTemplate(verification);
    const response = await patchBranch({ onlineBookingEnabled: true });
    expect((await response.json()).fieldErrors.onlineBookingEnabled).toEqual([
      "Add the branch's check-in time before turning on online booking.",
    ]);
  });
});
