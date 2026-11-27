import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  confirmVerification as realConfirm,
  requestVerification as realRequest,
} from "@/presentation/api-client/verification";
import type { ApiProblem } from "@/presentation/api-client/result";
import { PhoneVerificationStep } from "@/presentation/features/booking/phone-verification-step";
import {
  noVerification,
  verificationFor,
  waitText,
  type Verification,
} from "@/presentation/features/booking/verification-state";

const { requestVerification, confirmVerification } = vi.hoisted(() => ({
  requestVerification: vi.fn<typeof realRequest>(),
  confirmVerification: vi.fn<typeof realConfirm>(),
}));
vi.mock("@/presentation/api-client/verification", () => ({
  requestVerification,
  confirmVerification,
}));

const phone = "+201001234567";
const email = "Amina@Example.test";
const token = "t".repeat(43);
const lifetimes = { codeLifetimeMs: 600_000, tokenLifetimeMs: 1_800_000 };
const contact = {
  slug: "new-cairo",
  phone: "+20 2 1234 5678",
  email: "stay@example.test",
};
// The server's clock, deliberately a day away from the device clock.
const serverNow = Date.parse("2026-12-02T10:00:00Z");

const sent = (resendInMs = 0) => ({
  ok: true as const,
  status: 201 as const,
  data: {
    verificationId: "verification-1",
    expiresAt: new Date(serverNow + 600_000).toISOString(),
    resendAvailableAt: new Date(serverNow + resendInMs).toISOString(),
  },
});
const confirmed = {
  ok: true as const,
  status: 200 as const,
  data: { token, expiresAt: new Date(serverNow + 1_800_000).toISOString() },
};
const refused = (
  code: ApiProblem["code"],
  extra: Partial<ApiProblem> = {},
) => ({
  ok: false as const,
  problem: { code, status: 400, title: "Refused", ...extra },
});

const onBlocked = vi.fn();
const onInvalidContact = vi.fn();
const onEdit = vi.fn();
let held: Verification;

function Harness({
  channels,
}: {
  channels: { whatsapp: boolean; email: boolean };
}) {
  const [value, setValue] = useState<Verification>(noVerification);
  return (
    <PhoneVerificationStep
      phone={phone}
      email={email}
      channels={channels}
      lifetimes={lifetimes}
      value={value}
      contact={contact}
      onChange={(next) => {
        held = next;
        setValue(next);
      }}
      onBlocked={onBlocked}
      onInvalidContact={onInvalidContact}
      onEdit={onEdit}
    >
      <p>What comes next</p>
    </PhoneVerificationStep>
  );
}

const open = (channels = { whatsapp: true, email: false }) =>
  render(<Harness channels={channels} />);
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(button(name));
  });
};
const type = (code: string) =>
  fireEvent.change(screen.getByLabelText("Verification code"), {
    target: { value: code },
  });
const wait = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};
async function sendAndEnter(code = "123456") {
  await press("Send code");
  type(code);
  await press("Verify code");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T08:00:00Z"));
  requestVerification.mockResolvedValue(sent());
  held = noVerification;
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("sending a code", () => {
  it("sends a WhatsApp code for a booking and moves focus to the code", async () => {
    open();
    expect(
      screen.getByRole("heading", { name: "Verify your contact" }),
    ).toHaveFocus();
    expect(screen.queryByRole("radio")).toBeNull();
    await press("Send code");
    expect(requestVerification).toHaveBeenCalledExactlyOnceWith({
      phone,
      purpose: "BOOKING",
      channel: "WHATSAPP",
    });
    const input = screen.getByLabelText("Verification code");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("offers both channels, WhatsApp first, and says what email means", async () => {
    open({ whatsapp: true, email: true });
    expect(screen.getByRole("radio", { name: /WhatsApp to/ })).toBeChecked();
    expect(screen.queryByText(/you pay online/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
    expect(screen.getByText(/you pay online/)).toBeVisible();
    await press("Send code");
    expect(requestVerification).toHaveBeenCalledWith({
      phone,
      purpose: "BOOKING",
      channel: "EMAIL",
      email: email.toLowerCase(),
    });
    expect(held.sent).toMatchObject({ email: email.toLowerCase() });
  });

  it("offers only email when it is the one ready channel", () => {
    open({ whatsapp: false, email: true });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText(/by email to/)).toBeVisible();
    expect(screen.getByText(/you pay online/)).toBeVisible();
  });

  it("sends one request for a double press and holds the other actions meanwhile", async () => {
    let finish!: (value: ReturnType<typeof sent>) => void;
    requestVerification.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    open();
    await press("Send code");
    await act(async () => {
      fireEvent.submit(button("Sending…").closest("form")!);
    });
    expect(requestVerification).toHaveBeenCalledTimes(1);
    expect(button("Edit your details")).toBeDisabled();
    await act(async () => finish(sent()));
    expect(button("Edit your details")).toBeEnabled();
  });

  it("waits until the server's resend time, whatever the device clock says", async () => {
    requestVerification.mockResolvedValueOnce(sent(90_000));
    open();
    await press("Send code");
    expect(button("Send again")).toHaveAttribute("aria-disabled", "true");
    expect(button("Send again")).toHaveAccessibleDescription(
      "You can send another code in 90 seconds.",
    );
    await press("Send again");
    expect(requestVerification).toHaveBeenCalledTimes(1);
    await wait(90_000);
    expect(button("Send again")).not.toHaveAttribute("aria-disabled");
    await press("Send again");
    expect(requestVerification).toHaveBeenCalledTimes(2);
  });

  it("counts down a rate limit and then allows another code", async () => {
    requestVerification.mockResolvedValueOnce(
      refused("RATE_LIMITED", { retryAfter: 600 }),
    );
    open();
    await press("Send code");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Too many codes were requested. Try again in 10 minutes.",
    );
    expect(button("Send code")).toHaveAttribute("aria-disabled", "true");
    await press("Send code");
    expect(requestVerification).toHaveBeenCalledTimes(1);
    await wait(600_000);
    expect(button("Send code")).not.toHaveAttribute("aria-disabled");
  });

  it("holds email too after a WhatsApp limit, which counts the phone", async () => {
    requestVerification.mockResolvedValueOnce(
      refused("RATE_LIMITED", { retryAfter: 600 }),
    );
    open({ whatsapp: true, email: true });
    await press("Send code");
    fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
    expect(button("Send code")).toHaveAttribute("aria-disabled", "true");
    await press("Send code");
    expect(requestVerification).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["WhatsApp", true],
    ["email", false],
  ])(
    "after a %s code, holds the other channel's button: %s",
    async (first, held) => {
      requestVerification.mockResolvedValueOnce(sent(600_000));
      open({ whatsapp: true, email: true });
      if (first === "email")
        fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
      await press("Send code");
      expect(button("Send again")).toHaveAttribute("aria-disabled", "true");
      const other = button(/Send by .* instead/);
      expect(other.getAttribute("aria-disabled") === "true").toBe(held);
      await press(/Send by .* instead/);
      expect(requestVerification).toHaveBeenCalledTimes(held ? 1 : 2);
    },
  );

  it("keeps the wait when an expired code leaves the guest to send again", async () => {
    requestVerification.mockResolvedValueOnce(sent(900_000));
    open();
    await press("Send code");
    await wait(600_000);
    expect(button("Send code")).toHaveAccessibleDescription(
      "You can send another code in 5 minutes.",
    );
  });

  it("holds only email after an email limit, which may be the address's own", async () => {
    requestVerification.mockResolvedValueOnce(
      refused("RATE_LIMITED", { retryAfter: 600 }),
    );
    open({ whatsapp: true, email: true });
    fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
    await press("Send code");
    expect(button("Send code")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("radio", { name: /WhatsApp to/ }));
    expect(button("Send code")).not.toHaveAttribute("aria-disabled");
    await press("Send code");
    expect(requestVerification).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: "WHATSAPP" }),
    );
  });

  it.each(["WHATSAPP_NOT_CONFIGURED", "VERIFICATION_UNAVAILABLE"] as const)(
    "offers email and the hotel after %s",
    async (code) => {
      requestVerification.mockResolvedValueOnce(refused(code));
      open({ whatsapp: true, email: true });
      await press("Send code");
      expect(screen.getByRole("alert")).toHaveTextContent(/WhatsApp/);
      expect(
        screen.getByRole("link", { name: contact.phone }),
      ).toBeInTheDocument();
      if (code === "WHATSAPP_NOT_CONFIGURED") {
        // The channel is gone; email is what is left.
        expect(screen.queryByRole("radio")).toBeNull();
      } else {
        fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
      }
      await press("Send code");
      expect(requestVerification).toHaveBeenLastCalledWith(
        expect.objectContaining({ channel: "EMAIL" }),
      );
    },
  );

  it("sends the guest to the hotel when no channel is left", async () => {
    requestVerification.mockResolvedValueOnce(
      refused("WHATSAPP_NOT_CONFIGURED"),
    );
    open();
    await press("Send code");
    expect(screen.getByText(/A code cannot be sent right now/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull();
    expect(screen.getAllByRole("link", { name: contact.phone })).toHaveLength(
      1,
    );
  });

  it.each([
    ["NETWORK", /couldn’t confirm that the code was sent/],
    ["UNEXPECTED_RESPONSE", /couldn’t confirm that the code was sent/],
    ["TRY_AGAIN", /Verification is busy/],
    ["INTERNAL", /couldn’t send the code/],
    ["SOMETHING_NEW" as ApiProblem["code"], /couldn’t send the code/],
  ] as const)("explains %s and lets the guest retry", async (code, text) => {
    requestVerification.mockResolvedValueOnce(refused(code));
    open();
    await press("Send code");
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    await press("Send code");
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
  });

  it("keeps the earlier code when a resend fails", async () => {
    open();
    await press("Send code");
    requestVerification.mockResolvedValueOnce(refused("NETWORK"));
    await press("Send again");
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    expect(held.sent?.verificationId).toBe("verification-1");
  });

  it("reports a blocked number and shows no reason", async () => {
    requestVerification.mockResolvedValueOnce(refused("PHONE_BLOCKED"));
    open();
    await press("Send code");
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hands a refused phone or email back to the details step", async () => {
    requestVerification.mockResolvedValueOnce(
      refused("VALIDATION", {
        fieldErrors: { phone: ["Enter a valid number."] },
      }),
    );
    open();
    await press("Send code");
    expect(onInvalidContact).toHaveBeenCalledWith({
      phone: "Enter a valid number.",
    });
  });
});

describe("checking a code", () => {
  it("keeps digits only and asks for all six before calling the server", async () => {
    open();
    await press("Send code");
    type("12a 34");
    expect(screen.getByLabelText("Verification code")).toHaveValue("1234");
    await press("Verify code");
    expect(confirmVerification).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the 6 digit code.",
    );
  });

  it("verifies, holds the token in memory only, and shows what comes next", async () => {
    confirmVerification.mockResolvedValue(confirmed);
    open();
    await sendAndEnter();
    expect(confirmVerification).toHaveBeenCalledWith("verification-1", {
      code: "123456",
    });
    expect(
      screen.getByRole("heading", { name: "Phone verified" }),
    ).toHaveFocus();
    expect(screen.getByText("What comes next")).toBeVisible();
    expect(held).toMatchObject({ sent: null, verified: { token, phone } });
    expect(screen.queryByText(/pay online/)).toBeNull();
    for (const text of [
      document.body.innerHTML,
      JSON.stringify(sessionStorage),
      JSON.stringify(localStorage),
      document.cookie,
      window.location.href,
    ])
      expect(text).not.toContain(token);
  });

  it("tells an email verified guest about online payment and the phone", async () => {
    confirmVerification.mockResolvedValue(confirmed);
    open({ whatsapp: false, email: true });
    await sendAndEnter();
    expect(
      screen.getByRole("heading", { name: "Email verified" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /You will pay online.*confirm your phone number when you arrive/,
      ),
    ).toBeVisible();
  });

  it("marks the code wrong only for a wrong code, not a failed resend", async () => {
    open();
    await press("Send code");
    requestVerification.mockResolvedValueOnce(refused("NETWORK"));
    await press("Send again");
    const input = screen.getByLabelText("Verification code");
    expect(input).not.toHaveAttribute("aria-invalid");
    confirmVerification.mockResolvedValueOnce(
      refused("VERIFICATION_CODE_INVALID", { context: { attemptsLeft: 4 } }),
    );
    type("123456");
    await press("Verify code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/4 attempts left/);
  });

  it("waits out a limit on checking codes", async () => {
    confirmVerification.mockResolvedValueOnce(
      refused("RATE_LIMITED", { retryAfter: 60 }),
    );
    open();
    await sendAndEnter();
    expect(button("Verify code")).toHaveAccessibleDescription(
      "You can try a code again in 60 seconds.",
    );
    await press("Verify code");
    expect(confirmVerification).toHaveBeenCalledTimes(1);
    await wait(60_000);
    expect(button("Verify code")).not.toHaveAttribute("aria-disabled");
  });

  it("counts the token's life from when the code was submitted", async () => {
    confirmVerification.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(20_000);
      return confirmed;
    });
    open();
    await sendAndEnter();
    await wait(1_780_000);
    expect(screen.queryByText("What comes next")).toBeNull();
  });

  it("shows the attempts left, then asks for a new code at none", async () => {
    confirmVerification
      .mockResolvedValueOnce(
        refused("VERIFICATION_CODE_INVALID", { context: { attemptsLeft: 1 } }),
      )
      .mockResolvedValueOnce(
        refused("VERIFICATION_CODE_INVALID", { context: { attemptsLeft: 0 } }),
      );
    open();
    await sendAndEnter();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That code is not correct. 1 attempt left.",
    );
    expect(screen.getByLabelText("Verification code")).toHaveFocus();
    await press("Verify code");
    expect(screen.getByRole("alert")).toHaveTextContent("no attempts are left");
    expect(button("Send code")).toBeEnabled();
    expect(held.sent).toBeNull();
  });

  it("asks for a new code when the server says it expired", async () => {
    confirmVerification.mockResolvedValueOnce(refused("VERIFICATION_EXPIRED"));
    open();
    await sendAndEnter();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That code can no longer be used. Send a new code.",
    );
    expect(button("Send code")).toBeEnabled();
  });

  it("moves to a new code ten minutes after it arrived", async () => {
    open();
    await press("Send code");
    await wait(599_000);
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    await wait(1_000);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your code expired. Send a new code.",
    );
  });

  it("replaces a wrong code remark once the code times out", async () => {
    confirmVerification.mockResolvedValueOnce(
      refused("VERIFICATION_CODE_INVALID", { context: { attemptsLeft: 4 } }),
    );
    open();
    await sendAndEnter();
    await wait(600_000);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your code expired. Send a new code.",
    );
  });

  it("asks to verify again thirty minutes after success", async () => {
    confirmVerification.mockResolvedValue(confirmed);
    open();
    await sendAndEnter();
    await wait(1_800_000);
    expect(screen.queryByText("What comes next")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your verification expired. Verify again.",
    );
  });

  it.each([
    ["NETWORK", /couldn’t check the code. Check your connection/],
    ["TRY_AGAIN", /Verification is busy/],
    ["RATE_LIMITED", /Too many attempts/],
    ["INTERNAL", /couldn’t check the code. Try again/],
  ] as const)("keeps the code entry after %s", async (code, text) => {
    confirmVerification.mockResolvedValueOnce(refused(code));
    open();
    await sendAndEnter();
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByLabelText("Verification code")).toHaveValue("123456");
  });

  it("reports a number blocked between sending and checking", async () => {
    confirmVerification.mockResolvedValueOnce(refused("PHONE_BLOCKED"));
    open();
    await sendAndEnter();
    expect(onBlocked).toHaveBeenCalledOnce();
  });
});

describe("what a verification belongs to", () => {
  const bound = { phone, token, expiresAtMs: 1 };
  const byPhone: Verification = {
    sent: null,
    verified: { ...bound, channel: "WHATSAPP", email: null },
  };
  const byEmail: Verification = {
    sent: {
      channel: "EMAIL",
      phone,
      email: "amina@example.test",
      verificationId: "v",
      expiresAtMs: 1,
      resendAtMs: 1,
    },
    verified: { ...bound, channel: "EMAIL", email: "amina@example.test" },
  };

  it("drops everything when the phone changes", () => {
    for (const value of [byPhone, byEmail])
      expect(
        verificationFor(value, "+12025550101", "amina@example.test"),
      ).toEqual(noVerification);
  });

  it("drops an email verification, not a phone one, when the email changes", () => {
    expect(verificationFor(byPhone, phone, "other@example.test")).toEqual(
      byPhone,
    );
    expect(verificationFor(byEmail, phone, "other@example.test")).toEqual(
      noVerification,
    );
    expect(verificationFor(byEmail, phone, "AMINA@example.test")).toEqual(
      byEmail,
    );
  });

  it.each([
    [1, "1 second"],
    [119_000, "119 seconds"],
    [120_000, "2 minutes"],
    [86_400_000, "24 hours"],
  ])("words a wait of %i ms", (milliseconds, text) => {
    expect(waitText(milliseconds)).toBe(text);
  });
});
