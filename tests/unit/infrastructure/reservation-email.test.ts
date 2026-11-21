import type { Transporter } from "nodemailer";
import { expect, it, vi } from "vitest";
import {
  renderReservationEmail,
  SmtpReservationEmail,
} from "@/infrastructure/email/reservation-email";
const vars = {
  reference: "RR-00000001",
  branchName: "A&B <Hotel>",
  guestFirstName: "Guest",
  manageLink: "https://example.test/reservations/manage#t=secret",
};
it.each([
  ["reservation.confirmed", "confirmed"],
  ["reservation.cancelled", "cancelled"],
  ["reservation.modified", "was changed"],
  ["reservation.manage-link", "manage link"],
  ["reservation.staff-alert", "enter this booking in the hotel system"],
] as const)("renders %s in English text and escaped HTML", (kind, expected) => {
  const message = renderReservationEmail(kind, vars);
  expect(message.text).toContain(expected);
  expect(message.html).toContain("A&amp;B &lt;Hotel&gt;");
  if (kind === "reservation.staff-alert")
    expect(message.text + message.html).not.toContain("secret");
  else expect(message.text).toContain(vars.manageLink);
});
it("passes a stable message id and exactly one recipient to SMTP", async () => {
  const sendMail = vi.fn().mockResolvedValue({});
  const smtp = new SmtpReservationEmail(
    { sendMail } as unknown as Transporter,
    "hotel@example.test",
  );
  expect(
    await smtp.send("msg", "guest@example.test", "reservation.confirmed", vars),
  ).toEqual({ ok: true });
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: { name: "", address: "guest@example.test" },
      messageId: "<msg@example.test>",
    }),
  );
});
it.each([
  [451, "UNAVAILABLE"],
  [550, "PROVIDER_REJECTED"],
] as const)("keeps only SMTP code %i", async (responseCode, code) => {
  const sendMail = vi
    .fn()
    .mockRejectedValue({ responseCode, message: vars.manageLink });
  const smtp = new SmtpReservationEmail(
    { sendMail } as unknown as Transporter,
    "hotel@example.test",
  );
  expect(
    await smtp.send("msg", "guest@example.test", "reservation.confirmed", vars),
  ).toEqual({ ok: false, code, providerCode: responseCode });
});
