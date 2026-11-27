import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import type { requestQuote as realQuote } from "@/presentation/api-client/quotes";
import type {
  confirmVerification as realConfirm,
  requestVerification as realRequest,
} from "@/presentation/api-client/verification";
import { draftKey } from "@/presentation/features/booking/booking-draft";
import { BookingJourney } from "@/presentation/features/booking/booking-journey";

import {
  answerQuote,
  bookingQuote,
  bookingServices,
} from "./booking-extras-fixtures";

const { requestVerification, confirmVerification, requestQuote } = vi.hoisted(
  () => ({
    requestVerification: vi.fn<typeof realRequest>(),
    confirmVerification: vi.fn<typeof realConfirm>(),
    requestQuote: vi.fn<typeof realQuote>(),
  }),
);
vi.mock("@/presentation/api-client/quotes", () => ({ requestQuote }));
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
  summary: <p>Server summary</p>,
  selection: {
    branchSlug: "new-cairo",
    stay: { checkIn: "2026-12-03", checkOut: "2026-12-05" },
    lines: [{ roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } }],
  },
  services: bookingServices,
  maxVehicles: 3,
  price: { quote: bookingQuote(), paymentMethods: ["PAY_AT_HOTEL" as const] },
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
  requestQuote.mockImplementation(async (input) => answerQuote(input));
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
  expect(
    screen.getByRole("button", { name: "Continue to extras" }),
  ).toBeVisible();
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

async function openExtras() {
  await completeDetails();
  await verify();
  await press("Continue to extras");
  await screen.findByRole("heading", { name: "Extras and coupon" });
}
const breakfast = () => screen.getByRole("checkbox", { name: /Breakfast/ });
const summary = () => screen.getByRole("complementary", { name: "Your stay" });
const settled = () =>
  waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue to payment" }),
    ).not.toHaveAttribute("aria-disabled"),
  );

it("shows the server summary until extras, then the live price", async () => {
  render(<BookingJourney {...props} />);
  expect(screen.getByText("Server summary")).toBeVisible();
  await openExtras();
  expect(
    screen.getByRole("heading", { name: "Extras and coupon" }),
  ).toHaveFocus();
  expect(await screen.findByRole("table")).toBeVisible();
  expect(screen.queryByText("Server summary")).toBeNull();
  expect(summary()).toHaveTextContent("Total$184.00");
  // The server rendered quote already answers the empty choice.
  expect(requestQuote).not.toHaveBeenCalled();
});

it("keeps extras, coupon and flight text through other steps, and stores none", async () => {
  render(<BookingJourney {...props} />);
  await openExtras();
  fireEvent.click(breakfast());
  fireEvent.click(screen.getByRole("checkbox", { name: /Airport transfer/ }));
  fill("Cars", "2");
  fill(/Flight number/, "MS 985, 14:30");
  fill("Coupon code (optional)", "save10");
  await press("Apply");
  await screen.findByText("Code SAVE10 applied");
  await settled();

  await press("Back to verification");
  expect(
    await screen.findByRole("heading", { name: "Phone verified" }),
  ).toHaveFocus();
  // The chosen extras stay in the price beside the other steps.
  expect(summary()).toHaveTextContent("Breakfast");
  await press("Edit your details");
  await press("Continue to verification");
  await press("Continue to extras");

  expect(
    await screen.findByRole("checkbox", { name: /Breakfast/ }),
  ).toBeChecked();
  expect(field("Cars")).toHaveValue("2");
  expect(field(/Flight number/)).toHaveValue("MS 985, 14:30");
  expect(screen.getByText("Code SAVE10 applied")).toBeVisible();
  for (const secret of [token, "MS 985", "SAVE10", "save10"]) {
    expect(stored()).not.toContain(secret);
    expect(window.location.href).not.toContain(secret);
  }
});

it("keeps the choices when the phone changes and the guest verifies again", async () => {
  render(<BookingJourney {...props} />);
  await openExtras();
  fireEvent.click(breakfast());
  await settled();
  await press("Edit your details");
  fill("Phone number", "010 9999 4567");
  await press("Continue to verification");
  expect(
    screen.queryByRole("button", { name: "Continue to extras" }),
  ).toBeNull();
  await verify();
  await press("Continue to extras");
  expect(
    await screen.findByRole("checkbox", { name: /Breakfast/ }),
  ).toBeChecked();
});

it("says that payment comes next, and goes back with the choices", async () => {
  render(<BookingJourney {...props} />);
  await openExtras();
  fireEvent.click(breakfast());
  await settled();
  await press("Continue to payment");
  expect(
    screen.getByRole("heading", { name: "Payment and review" }),
  ).toHaveFocus();
  expect(screen.getByText(/coming soon/)).toBeVisible();
  await press("Back to extras");
  expect(
    await screen.findByRole("checkbox", { name: /Breakfast/ }),
  ).toBeChecked();
});

it.each([
  ["a service", () => fireEvent.click(breakfast())],
  [
    "a coupon",
    () => {
      fill("Coupon code (optional)", "save10");
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    },
  ],
])(
  "drops an unanswered check of %s on leaving, says so, and resumes on return",
  async (_what, choose) => {
    render(<BookingJourney {...props} />);
    await openExtras();
    await screen.findByRole("table");
    await act(async () => choose());
    expect(summary()).toHaveTextContent("Updating price…");
    await press("Back to verification");
    expect(summary()).toHaveTextContent(
      "The price updates when you return to extras.",
    );
    // Longer than the wait before a check is sent.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(requestQuote).not.toHaveBeenCalled();
    await press("Continue to extras");
    await settled();
    expect(requestQuote).toHaveBeenCalledTimes(1);
    expect(summary()).not.toHaveTextContent("return to extras");
  },
);
