// @vitest-environment node
import type { Transporter } from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VerificationCodeEmail } from "@/application/notifications";
import { FAKE_EMAIL_REJECTED_ADDRESS } from "@/infrastructure/email/fake-reservation-email";
import { messageIdFor } from "@/infrastructure/email/reservation-email";
import {
  FakeVerificationCodeEmail,
  SmtpVerificationCodeEmail,
  renderVerificationCodeEmail,
} from "@/infrastructure/email/verification-code-email";

const acceptedAddress = "guest@example.test";
const rejectedAddress = FAKE_EMAIL_REJECTED_ADDRESS;
const password = "dummy-smtp-password";
const code = "012345";

type Fixture = {
  name: string;
  create: (reject: boolean) => {
    sender: VerificationCodeEmail;
    sendMail?: ReturnType<typeof vi.fn>;
  };
};

const adapters: Fixture[] = [
  { name: "fake", create: () => ({ sender: new FakeVerificationCodeEmail() }) },
  {
    name: "SMTP",
    create: (reject) => {
      const sendMail = vi.fn().mockResolvedValue({});
      if (reject)
        sendMail.mockRejectedValue({
          responseCode: 550,
          message: `${rejectedAddress}: ${code} (${password})`,
        });
      return {
        sender: new SmtpVerificationCodeEmail(
          { sendMail } as unknown as Transporter,
          "hotel@example.test",
        ),
        sendMail,
      };
    },
  },
];

afterEach(() => vi.restoreAllMocks());

// AC-13, T-VCH-1, T-ADP. Every email adapter sends codes the same way (ADR 030, 031).
describe.each(adapters)(
  "VerificationCodeEmail contract ($name)",
  ({ create }) => {
    it("accepts a code without logging the code or the address", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method).mockImplementation(() => {}),
      );
      expect(
        await create(false).sender.send({
          id: "id",
          to: acceptedAddress,
          code,
        }),
      ).toEqual({ ok: true });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    });

    it("maps a permanent refusal without leaking the code, address, or provider text", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method).mockImplementation(() => {}),
      );
      const result = await create(true).sender.send({
        id: "id",
        to: rejectedAddress,
        code,
      });
      expect(result).toMatchObject({ ok: false, code: "PROVIDER_REJECTED" });
      for (const value of [password, rejectedAddress, code])
        expect(JSON.stringify(result)).not.toContain(value);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    });
  },
);

describe("verification code email text", () => {
  it("is plain, carries the code and expiry, and has no link or booking details", () => {
    const message = renderVerificationCodeEmail(code);
    expect(message.subject).toBe("Your verification code");
    expect(message.text).toBe(
      [
        `Your Rivana Residence code is ${code}.`,
        "It expires in 10 minutes.",
        "If you did not ask for it, ignore this email.",
      ].join("\n"),
    );
    for (const part of [message.text, message.html, message.subject])
      expect(part).not.toMatch(/https?:|www\.|manage|reference/i);
  });
  it("refuses anything but a six digit code", () => {
    for (const bad of ["12345", "1234567", "<b>1</b>", ""])
      expect(() => renderVerificationCodeEmail(bad)).toThrow();
  });
  it("the SMTP adapter sends the rendered text to the given address only", async () => {
    const { sender, sendMail } = adapters[1]!.create(false);
    await sender.send({ id: "verification-1", to: acceptedAddress, code });
    expect(sendMail).toHaveBeenCalledWith({
      from: "hotel@example.test",
      to: { name: "", address: acceptedAddress },
      messageId: "<verification-1@example.test>",
      ...renderVerificationCodeEmail(code),
    });
  });
  it("the fake keeps only the latest 100 deliveries", async () => {
    const fake = new FakeVerificationCodeEmail();
    for (let index = 0; index < 101; index++)
      await fake.send({ id: String(index), to: acceptedAddress, code });
    await fake.send({ id: "rejected", to: rejectedAddress, code });
    expect(fake.deliveries).toHaveLength(100);
    expect(fake.deliveries[0]?.id).toBe("1");
    expect(fake.deliveries.at(-1)).toEqual({
      id: "100",
      to: acceptedAddress,
      code,
    });
  });
});

describe("message ids", () => {
  it("use the sender's domain for a plain or a named sender", () => {
    expect(messageIdFor("m1", "hotel@example.test")).toBe("<m1@example.test>");
    expect(messageIdFor("m1", "Rivana Residence <hotel@example.test>")).toBe(
      "<m1@example.test>",
    );
    expect(messageIdFor("m1", "no-address")).toBe("<m1@localhost>");
  });
});
