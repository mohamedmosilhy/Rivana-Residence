// @vitest-environment node
import type { Transporter } from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReservationEmailSender } from "@/application/notifications";
import {
  FAKE_EMAIL_REJECTED_ADDRESS,
  FakeReservationEmail,
} from "@/infrastructure/email/fake-reservation-email";
import { SmtpReservationEmail } from "@/infrastructure/email/reservation-email";

const acceptedAddress = "guest@example.test";
const rejectedAddress = FAKE_EMAIL_REJECTED_ADDRESS;
const password = "dummy-smtp-password";
const variables = {
  reference: "RR-00000001",
  branchName: "Sample Hotel",
  manageLink: "https://hotel.example/manage#t=contract-token",
};

type Fixture = {
  name: string;
  create: (reject: boolean) => ReservationEmailSender;
};

const adapters: Fixture[] = [
  { name: "fake", create: () => new FakeReservationEmail() },
  {
    name: "SMTP",
    create: (reject) => {
      const sendMail = vi.fn().mockResolvedValue({});
      if (reject)
        sendMail.mockRejectedValue({
          responseCode: 550,
          message: `${rejectedAddress}: ${variables.manageLink} (${password})`,
        });
      return new SmtpReservationEmail(
        { sendMail } as unknown as Transporter,
        "hotel@example.test",
      );
    },
  },
];

afterEach(() => vi.restoreAllMocks());

// AC-9, AC-10, T-ADP. The same port expectations apply to every adapter.
describe.each(adapters)(
  "ReservationEmailSender contract ($name)",
  ({ create }) => {
    it("accepts a reservation email without logging the delivery", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method).mockImplementation(() => {}),
      );
      expect(
        await create(false).send(
          "id",
          acceptedAddress,
          "reservation.manage-link",
          variables,
        ),
      ).toEqual({ ok: true });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    });

    it("maps a permanent refusal without leaking provider text or delivery data", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method).mockImplementation(() => {}),
      );
      const result = await create(true).send(
        "id",
        rejectedAddress,
        "reservation.manage-link",
        variables,
      );
      expect(result).toMatchObject({ ok: false, code: "PROVIDER_REJECTED" });
      for (const value of [password, rejectedAddress, variables.manageLink]) {
        expect(JSON.stringify(result)).not.toContain(value);
      }
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    });
  },
);

it("keeps snapshots of only the latest 100 successful fake email deliveries", async () => {
  const fake = new FakeReservationEmail();
  const message = { ...variables };
  for (let index = 0; index < 101; index++) {
    await fake.send(
      String(index),
      acceptedAddress,
      "reservation.manage-link",
      message,
    );
  }
  await fake.send(
    "rejected",
    rejectedAddress,
    "reservation.manage-link",
    message,
  );
  message.reference = "changed by caller";
  expect(fake.deliveries).toHaveLength(100);
  expect(fake.deliveries[0]?.id).toBe("1");
  expect(fake.deliveries.at(-1)).toEqual({
    id: "100",
    to: acceptedAddress,
    kind: "reservation.manage-link",
    variables,
  });
});
