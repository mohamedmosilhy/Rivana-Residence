import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import type {
  confirmVerification as realConfirm,
  requestVerification as realRequest,
} from "@/presentation/api-client/verification";
import { draftKey } from "@/presentation/features/booking/booking-draft";
import { BookingJourney } from "@/presentation/features/booking/booking-journey";

const { requestVerification, confirmVerification } = vi.hoisted(() => ({
  requestVerification: vi.fn<typeof realRequest>(),
  confirmVerification: vi.fn<typeof realConfirm>(),
}));
vi.mock("@/presentation/api-client/verification", () => ({
  requestVerification,
  confirmVerification,
}));

const token = "k".repeat(43);
const props = {
  countries: [
    { code: "EG", label: "Egypt (+20)" },
    { code: "US", label: "United States (+1)" },
  ],
  channels: { whatsapp: true, email: true },
  lifetimes: { codeLifetimeMs: 600_000, tokenLifetimeMs: 1_800_000 },
  contact: { slug: "new-cairo", phone: "+20 2 1234 5678", email: null },
};
const sentAnswer = () => ({
  ok: true as const,
  status: 201 as const,
  data: {
    verificationId: "verification-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    resendAvailableAt: new Date(Date.now()).toISOString(),
  },
});

const field = (label: string | RegExp) => screen.getByLabelText(label);
const fill = (label: string | RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};
const stored = () => JSON.stringify({ ...sessionStorage, ...localStorage });

async function completeDetails() {
  fill("Full name", "Amina Hassan");
  fill("Email", "amina@example.test");
  fill("Phone number", "010 0123 4567");
  await press("Continue to verification");
  await screen.findByRole("heading", { name: "Verify your contact" });
}
async function verify() {
  await press("Send code");
  fill("Verification code", "123456");
  await press("Verify code");
}

beforeEach(() => {
  requestVerification.mockImplementation(async () => sentAnswer());
  confirmVerification.mockResolvedValue({
    ok: true,
    status: 200,
    data: { token, expiresAt: new Date(Date.now()).toISOString() },
  });
});
afterEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
});

it("explains the need for JavaScript on the server render, with the hotel contact", () => {
  const html = renderToString(<BookingJourney {...props} />);
  expect(html).toContain("<noscript>");
  expect(html).toContain("Enable JavaScript to book online");
  expect(html).toContain("tel:+20212345678");
  expect(html).not.toContain("<form");
});

it("lists every problem, focuses the summary, and links each to its field", async () => {
  render(<BookingJourney {...props} />);
  await press("Continue to verification");
  const summary = screen.getByRole("alert");
  await waitFor(() => expect(summary).toHaveFocus());
  fireEvent.click(
    screen.getByRole("link", { name: /^Email: Enter your email/ }),
  );
  expect(field("Email")).toHaveFocus();
  expect(field("Email")).toHaveAttribute("aria-invalid", "true");
  expect(field("Email")).toHaveAccessibleDescription(
    "Enter your email address.",
  );
  fill("Email", "amina@example.test");
  expect(field("Email")).not.toHaveAttribute("aria-invalid");
  expect(requestVerification).not.toHaveBeenCalled();
});

it("refuses a phone number that cannot exist", async () => {
  render(<BookingJourney {...props} />);
  fill("Full name", "Amina Hassan");
  fill("Email", "amina@example.test");
  fill("Phone number", "12");
  await press("Continue to verification");
  await waitFor(() =>
    expect(field("Phone number")).toHaveAccessibleDescription(
      /Enter a valid number/,
    ),
  );
});

it("saves the draft for this tab and restores it, without any verification", async () => {
  const view = render(<BookingJourney {...props} />);
  expect(field("Phone country")).toHaveValue("EG");
  await completeDetails();
  await verify();
  await screen.findByRole("heading", { name: "Phone verified" });
  expect(screen.getByText(/Extras and payment are coming soon/)).toBeVisible();
  expect(requestVerification).toHaveBeenCalledWith({
    phone: "+201001234567",
    purpose: "BOOKING",
    channel: "WHATSAPP",
  });
  expect(stored()).toContain("Amina Hassan");
  for (const secret of [token, "verification-1", "123456"])
    expect(stored()).not.toContain(secret);
  expect(window.location.href).not.toContain(token);

  view.unmount();
  render(<BookingJourney {...props} />);
  expect(field("Full name")).toHaveValue("Amina Hassan");
  expect(field("Phone number")).toHaveValue("010 0123 4567");
  await press("Continue to verification");
  expect(
    await screen.findByRole("button", { name: "Send code" }),
  ).toBeInTheDocument();
});

it("keeps the verification through an edit that leaves the contact alone", async () => {
  render(<BookingJourney {...props} />);
  await completeDetails();
  await verify();
  await press("Edit your details");
  expect(screen.getByRole("heading", { name: "Your details" })).toHaveFocus();
  fill(/Special requests/, "Quiet room");
  fill("Email", "new@example.test");
  await press("Continue to verification");
  expect(
    await screen.findByRole("heading", { name: "Phone verified" }),
  ).toBeInTheDocument();
});

it("clears the verification when the phone changes, even if changed back", async () => {
  render(<BookingJourney {...props} />);
  await completeDetails();
  await verify();
  await press("Edit your details");
  fill("Phone number", "010 9999 4567");
  await press("Continue to verification");
  await screen.findByRole("button", { name: "Send code" });
  await press("Edit your details");
  fill("Phone number", "010 0123 4567");
  await press("Continue to verification");
  expect(
    await screen.findByRole("button", { name: "Send code" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Phone verified" })).toBeNull();
});

it("clears an email verification when the email changes", async () => {
  render(<BookingJourney {...props} />);
  await completeDetails();
  fireEvent.click(screen.getByRole("radio", { name: /Email to/ }));
  await verify();
  await screen.findByRole("heading", { name: "Email verified" });
  await press("Edit your details");
  fill("Email", "new@example.test");
  await press("Continue to verification");
  expect(
    await screen.findByRole("button", { name: "Send code" }),
  ).toBeInTheDocument();
});

it("shows a neutral screen and deletes the draft for a blocked number", async () => {
  requestVerification.mockResolvedValue({
    ok: false,
    problem: { code: "PHONE_BLOCKED", status: 403, title: "Contact us" },
  });
  render(<BookingJourney {...props} />);
  await completeDetails();
  expect(sessionStorage.getItem(draftKey("new-cairo"))).not.toBeNull();
  await press("Send code");
  expect(
    screen.getByRole("heading", { name: "Contact the hotel" }),
  ).toHaveFocus();
  expect(
    screen.getByText("Please contact the hotel to continue."),
  ).toBeVisible();
  expect(screen.queryByText(/block/i)).toBeNull();
  expect(sessionStorage.getItem(draftKey("new-cairo"))).toBeNull();
});

it("returns a phone the server refused to its field", async () => {
  requestVerification.mockResolvedValue({
    ok: false,
    problem: {
      code: "VALIDATION",
      status: 422,
      title: "Check",
      fieldErrors: { phone: ["The server refused this number."] },
    },
  });
  render(<BookingJourney {...props} />);
  await completeDetails();
  await press("Send code");
  expect(field("Phone number")).toHaveAccessibleDescription(
    "The server refused this number.",
  );
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
});
