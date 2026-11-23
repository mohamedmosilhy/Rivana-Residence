// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const smtpSettings = {
  SMTP_HOST: "mail.example.test",
  SMTP_USER: "hotel@example.test",
  SMTP_PASSWORD: "dummy-smtp-password",
  CONTACT_FROM: "hotel@example.test",
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CONTACT_DELIVERY", "none");
  for (const key of [
    "EMAIL_PROVIDER",
    "WHATSAPP_PROVIDER",
    "PAYMENT_PROVIDER",
    "WHATSAPP_ACCESS_TOKEN",
    ...Object.keys(smtpSettings),
  ])
    vi.stubEnv(key, undefined);
});

afterEach(() => vi.unstubAllEnvs());

it("reports usable fakes as fake and leaves payment unconfigured before registration", async () => {
  const { readProviderReadiness } = await import(
    "@/composition/provider-readiness"
  );
  const { reservationEmailSender } = await import(
    "@/composition/reservation-email"
  );
  const { FakeReservationEmail } = await import(
    "@/infrastructure/email/fake-reservation-email"
  );
  expect(readProviderReadiness()).toEqual({
    payment: "unconfigured",
    whatsapp: "fake",
    email: "fake",
  });
  const sender = reservationEmailSender();
  expect(sender).toBeInstanceOf(FakeReservationEmail);
  expect(reservationEmailSender()).toBe(sender);
});

it("reports real transport readiness from complete selected configuration", async () => {
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("WHATSAPP_PROVIDER", "meta");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "dummy-whatsapp-token");
  for (const [key, value] of Object.entries(smtpSettings))
    vi.stubEnv(key, value);
  const { readProviderReadiness } = await import(
    "@/composition/provider-readiness"
  );
  const { reservationEmailSender } = await import(
    "@/composition/reservation-email"
  );
  const { SmtpReservationEmail } = await import(
    "@/infrastructure/email/reservation-email"
  );
  expect(readProviderReadiness()).toEqual({
    payment: "unconfigured",
    whatsapp: "real",
    email: "real",
  });
  expect(reservationEmailSender()).toBeInstanceOf(SmtpReservationEmail);
});

it.each(Object.keys(smtpSettings))(
  "reports the selected SMTP adapter unconfigured when %s is missing",
  async (missingKey) => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("WHATSAPP_PROVIDER", "meta");
    for (const [key, value] of Object.entries(smtpSettings)) {
      if (key !== missingKey) vi.stubEnv(key, value);
    }
    const { readProviderReadiness } = await import(
      "@/composition/provider-readiness"
    );
    const { reservationEmailSender } = await import(
      "@/composition/reservation-email"
    );
    expect(readProviderReadiness()).toEqual({
      payment: "unconfigured",
      whatsapp: "unconfigured",
      email: "unconfigured",
    });
    expect(
      await reservationEmailSender().send(
        "msg",
        "guest@example.test",
        "reservation.confirmed",
        { reference: "RR-00000001", branchName: "Hotel" },
      ),
    ).toEqual({ ok: false, code: "NOT_CONFIGURED" });
  },
);
