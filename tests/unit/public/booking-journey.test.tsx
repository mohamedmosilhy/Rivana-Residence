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
  stayTimes,
} from "./booking-extras-fixtures";

const {
  requestVerification,
  confirmVerification,
  requestQuote,
  createReservation,
  replacePage,
} = vi.hoisted(() => ({
  createReservation: vi.fn(),
  replacePage: vi.fn(),
  requestVerification: vi.fn<typeof realRequest>(),
  confirmVerification: vi.fn<typeof realConfirm>(),
  requestQuote: vi.fn<typeof realQuote>(),
}));
vi.mock("@/presentation/features/booking/leave-page", () => ({ replacePage }));
vi.mock("@/presentation/api-client/reservations", () => ({
  createReservation,
}));
vi.mock("@/presentation/api-client/quotes", () => ({ requestQuote }));
vi.mock("@/presentation/api-client/verification", () => ({
  requestVerification,
  confirmVerification,
}));

const token = "k".repeat(43);
const props = {
  terms: {
    branchName: "New Cairo",
    deadlineLabel: "2 December at 14:00",
    timeZone: "Africa/Cairo",
    insideWindow: false,
    consentVersions: {
      privacyNotice: "privacy-placeholder-v1",
      marketing: "marketing-placeholder-v1",
    },
  },
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
  times: stayTimes,
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
    await screen.findByRole("heading", { name: "Choose how to pay" }),
  ).toHaveFocus();
  expect(screen.getByRole("radio", { name: /Pay at the hotel/ })).toBeChecked();
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

async function openReview() {
  render(<BookingJourney {...props} />);
  await openExtras();
  await press("Continue to payment");
  await screen.findByRole("heading", { name: "Choose how to pay" });
  await press("Continue to review");
  await screen.findByRole("heading", { name: "Review your booking" });
  fireEvent.click(field(/I accept the privacy/));
}

it.each(["BOOKING_LIMIT_REACHED", "BRANCH_NOT_BOOKABLE", "PHONE_BLOCKED"])(
  "stops at contact on %s",
  async (code) => {
    createReservation.mockResolvedValue({ ok: false, problem: { code } });
    await openReview();
    await press("Confirm booking");
    expect(
      await screen.findByRole("heading", { name: "Contact the hotel" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Confirm booking" }),
    ).toBeNull();
    if (code === "BRANCH_NOT_BOOKABLE")
      expect(summary()).toHaveTextContent("Online booking is unavailable");
    if (code === "PHONE_BLOCKED")
      expect(sessionStorage.getItem(draftKey("new-cairo"))).toBeNull();
  },
);
it("returns an expired booking token to verification with guest details kept", async () => {
  createReservation.mockResolvedValue({
    ok: false,
    problem: { code: "PHONE_NOT_VERIFIED" },
  });
  await openReview();
  await press("Confirm booking");
  await screen.findByRole("button", { name: "Send code" });
  await press("Edit your details");
  expect(field("Full name")).toHaveValue("Amina Hassan");
});
it("removes a coupon refused only at submit and explains the verified-phone limit", async () => {
  createReservation.mockResolvedValue({
    ok: false,
    problem: {
      code: "COUPON_INVALID",
      context: { reason: "PHONE_LIMIT_REACHED" },
    },
  });
  render(<BookingJourney {...props} />);
  await openExtras();
  fill("Coupon code (optional)", "SAVE10");
  await press("Apply");
  await screen.findByText("Code SAVE10 applied");
  await press("Continue to payment");
  await screen.findByRole("heading", { name: "Choose how to pay" });
  await press("Continue to review");
  fireEvent.click(field(/I accept the privacy/));
  await press("Confirm booking");
  expect(await screen.findByText(/maximum number of times/)).toBeVisible();
  await settled();
  expect(summary()).not.toHaveTextContent("SAVE10");
});
it.each(["unavailable", "closed"])(
  "tells the truth away from extras after %s",
  async (kind) => {
    render(<BookingJourney {...props} />);
    await openExtras();
    requestQuote.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        available: kind === "closed",
        bookable: false,
        quote: kind === "closed" ? bookingQuote() : null,
        unavailableLines: [],
        paymentMethods: [],
      },
    });
    fireEvent.click(breakfast());
    await waitFor(() =>
      expect(summary()).toHaveTextContent(
        kind === "closed"
          ? "Online booking is unavailable"
          : "no longer available",
      ),
    );
    await press("Back to verification");
    expect(summary()).not.toHaveTextContent("return to extras");
  },
);

it("requires the replacement price even when a fresh check first fails", async () => {
  await openReview();
  createReservation.mockResolvedValueOnce({
    ok: false,
    problem: { code: "PRICE_CHANGED" },
  });
  requestQuote.mockResolvedValueOnce({
    ok: false,
    problem: { code: "NETWORK", status: null, title: "Network" },
  });
  await press("Confirm booking");
  expect(screen.queryByRole("button", { name: "Confirm booking" })).toBeNull();
  requestQuote.mockImplementationOnce(async (input) =>
    answerQuote(input, { total: { amountMinor: 20345, currency: "USD" } }),
  );
  await press("Check price again");
  expect(screen.getByText(/from \$184.00 to \$203.45/)).toBeVisible();
  expect(createReservation).toHaveBeenCalledTimes(1);
  await press("Accept new total");
  createReservation.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: {
      reference: "RR-DEMO",
      status: "AWAITING_PAYMENT",
      manageUrl: null,
      checkoutUrl: "https://example.test/checkout",
    },
  });
  await press("Confirm booking");
  expect(createReservation.mock.calls[1]![1]).not.toBe(
    createReservation.mock.calls[0]![1],
  );
  expect(
    screen.getByRole("link", { name: "Continue to payment" }),
  ).toHaveAttribute("href", "https://example.test/checkout");
});

it.each([
  [["PAY_AT_HOTEL"], /Online payment is not available/],
  [["ONLINE"], /Online payment is the only way/],
] as const)(
  "shows the only payment method as chosen, with the reason: %s",
  async (methods, reason) => {
    render(
      <BookingJourney
        {...props}
        price={{ ...props.price, paymentMethods: [...methods] }}
      />,
    );
    await openExtras();
    await press("Continue to payment");
    await screen.findByRole("heading", { name: "Choose how to pay" });
    expect(screen.getByRole("radio")).toBeChecked();
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.queryByText(/Choose a payment method/)).toBeNull();
  },
);

it("says what is still needed while a step cannot continue", async () => {
  render(
    <BookingJourney
      {...props}
      price={{ ...props.price, paymentMethods: ["PAY_AT_HOTEL", "ONLINE"] }}
    />,
  );
  await openExtras();
  await press("Continue to payment");
  await screen.findByRole("heading", { name: "Choose how to pay" });
  expect(
    screen.getByRole("button", { name: "Continue to review" }),
  ).toHaveAccessibleDescription("Choose a payment method to continue.");
});

const refused = (code: string, extra: object = {}) => ({
  ok: false,
  problem: { code, title: code, status: 409, ...extra },
});
const manageToken = "m".repeat(43);
const saved = (status: "CONFIRMED" | "AWAITING_PAYMENT") => ({
  ok: true,
  status: 201,
  data: {
    reference: "RR-DEMO",
    status,
    total: { amountMinor: 18400, currency: "USD" },
    manageUrl: `/reservations/manage#t=${manageToken}`,
    ...(status === "AWAITING_PAYMENT"
      ? { checkoutUrl: "https://example.test/checkout" }
      : {}),
  },
});
const sentKey = (call: number) => createReservation.mock.calls[call]![1];
const noButton = (name: string) =>
  expect(screen.queryByRole("button", { name })).toBeNull();

it.each([
  ["CONFIRMED", "/new-cairo/book/confirmed"],
  ["AWAITING_PAYMENT", "https://example.test/checkout"],
] as const)(
  "saves a new %s booking, clears the draft and leaves the page",
  async (status, href) => {
    createReservation.mockResolvedValue(saved(status));
    await openReview();
    await press("Confirm booking");
    expect(replacePage).toHaveBeenCalledExactlyOnceWith(href);
    expect(sessionStorage.getItem(draftKey("new-cairo"))).toBeNull();
    expect(sessionStorage.getItem("rivana.booking.result")).toContain(
      manageToken,
    );
    expect(window.location.href).not.toContain(manageToken);
    noButton("Confirm booking");
  },
);

it.each(["CONFIRMED", "AWAITING_PAYMENT"] as const)(
  "keeps the %s reference on screen when the tab cannot store the result",
  async (status) => {
    createReservation.mockResolvedValue(saved(status));
    await openReview();
    const write = Storage.prototype.setItem;
    const storage = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key === "rivana.booking.result") throw new Error("Blocked");
        write.call(this, key, value);
      });
    try {
      await press("Confirm booking");
    } finally {
      storage.mockRestore();
    }
    expect(
      screen.getByRole("heading", { name: "Your booking reference" }),
    ).toHaveFocus();
    expect(screen.getByText("RR-DEMO")).toBeVisible();
    expect(replacePage).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "Continue to payment" }) !== null,
    ).toBe(status === "AWAITING_PAYMENT");
    noButton("Confirm booking");
  },
);

it("keeps the same request locked when a retry after a lost reply is rate limited", async () => {
  createReservation
    .mockResolvedValueOnce(refused("NETWORK", { status: null }))
    .mockResolvedValueOnce(refused("RATE_LIMITED", { retryAfter: 3540 }))
    .mockResolvedValueOnce(saved("CONFIRMED"));
  await openReview();
  await press("Confirm booking");
  await press("Retry same booking");
  expect(screen.getByText(/Try again in 59 minutes/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Back to payment" }),
  ).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Change selection" })).toBeNull();
  await press("Retry same booking");
  expect(sentKey(1)).toBe(sentKey(0));
  expect(sentKey(2)).toBe(sentKey(0));
});

it.each(["TRY_AGAIN", "INTERNAL"])(
  "treats %s as an unknown result and retries the same request",
  async (code) => {
    createReservation.mockResolvedValue(refused(code));
    await openReview();
    await press("Confirm booking");
    expect(screen.getByText(/couldn’t verify the result/)).toBeVisible();
    await press("Retry same booking");
    expect(sentKey(1)).toBe(sentKey(0));
  },
);

it("says the booking was received when checkout cannot open, then reports a failed payment", async () => {
  createReservation
    .mockResolvedValueOnce(refused("PAYMENT_UNAVAILABLE"))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        reference: "RR-DEMO",
        status: "PAYMENT_FAILED",
        manageUrl: null,
      },
    });
  await openReview();
  await press("Confirm booking");
  expect(screen.getByText(/We received your booking/)).toBeVisible();
  await press("Retry same booking");
  expect(sentKey(1)).toBe(sentKey(0));
  expect(screen.getByText(/units are no longer held/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Search again" })).toHaveAttribute(
    "href",
    expect.stringContaining("/new-cairo/book?"),
  );
});

it("shows the server's field messages and lets the guest try again", async () => {
  createReservation.mockResolvedValue(
    refused("VALIDATION", {
      fieldErrors: { "guest.fullName": ["Enter a shorter name."] },
    }),
  );
  await openReview();
  await press("Confirm booking");
  expect(screen.getByText("Enter a shorter name.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm booking" })).toBeEnabled();
});

it("returns to extras when a service is refused at submit, and prices again", async () => {
  createReservation.mockResolvedValue(
    refused("SERVICE_UNAVAILABLE", { context: { kind: "BREAKFAST" } }),
  );
  render(<BookingJourney {...props} />);
  await openExtras();
  fireEvent.click(breakfast());
  await settled();
  await press("Continue to payment");
  await screen.findByRole("heading", { name: "Choose how to pay" });
  await press("Continue to review");
  fireEvent.click(field(/I accept the privacy/));
  const checks = requestQuote.mock.calls.length;
  await press("Confirm booking");
  expect(
    await screen.findByText(/Breakfast is no longer available/),
  ).toBeVisible();
  await settled();
  expect(requestQuote.mock.calls.length).toBeGreaterThan(checks);
  expect(requestQuote.mock.calls.at(-1)![0].services).toEqual([]);
});

it.each(["PAYMENT_METHOD_UNAVAILABLE", "ONLINE_PAYMENT_REQUIRED"])(
  "asks for the new total to be accepted when it changes with %s",
  async (code) => {
    createReservation.mockResolvedValue(refused(code));
    await openReview();
    requestQuote.mockImplementation(async (input) =>
      answerQuote(input, { total: { amountMinor: 20345, currency: "USD" } }),
    );
    await press("Confirm booking");
    await screen.findByRole("heading", { name: "Choose how to pay" });
    expect(screen.getByText(/payment options changed/)).toBeVisible();
    fireEvent.click(screen.getByRole("radio"));
    await press("Continue to review");
    expect(screen.getByText(/from \$184.00 to \$203.45/)).toBeVisible();
    noButton("Confirm booking");
  },
);

async function priceChangedAtSubmit() {
  createReservation.mockResolvedValueOnce(refused("PRICE_CHANGED"));
  await openReview();
  requestQuote.mockImplementation(async (input) =>
    answerQuote(input, { total: { amountMinor: 20345, currency: "USD" } }),
  );
  await press("Confirm booking");
}

it("moves focus to the price warning, then to the accepted total", async () => {
  await priceChangedAtSubmit();
  expect(
    screen.getByRole("group", { name: "Please check the new total" }),
  ).toHaveFocus();
  await press("Accept new total");
  expect(screen.getByText("Total with VAT").closest("p")).toHaveFocus();
});

it("lets the guest leave a price change, and drops the old comparison", async () => {
  await priceChangedAtSubmit();
  await press("Change extras or coupon");
  await screen.findByRole("checkbox", { name: /Breakfast/ });
  await settled();
  await press("Continue to payment");
  await screen.findByRole("heading", { name: "Choose how to pay" });
  await press("Continue to review");
  expect(screen.queryByText(/The price changed/)).toBeNull();
  expect(screen.getByRole("button", { name: "Confirm booking" })).toBeVisible();
});

/** Whether the browser would ask before the page is left now. */
const asksBeforeLeaving = () =>
  !window.dispatchEvent(new Event("beforeunload", { cancelable: true }));

it("asks before leaving while a booking is being sent, and not after success", async () => {
  let answer!: (value: unknown) => void;
  createReservation.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const leaving: boolean[] = [];
  replacePage.mockImplementation(() => leaving.push(asksBeforeLeaving()));
  await openReview();
  expect(asksBeforeLeaving()).toBe(false);
  await press("Confirm booking");
  expect(asksBeforeLeaving()).toBe(true);
  await act(async () => answer(saved("CONFIRMED")));
  expect(leaving).toEqual([false]);
});

it("keeps asking while the result is unknown, also through a rate limit", async () => {
  createReservation
    .mockResolvedValueOnce(refused("NETWORK", { status: null }))
    .mockResolvedValueOnce(refused("RATE_LIMITED", { retryAfter: 60 }))
    .mockResolvedValueOnce(saved("CONFIRMED"));
  const leaving: boolean[] = [];
  replacePage.mockImplementation(() => leaving.push(asksBeforeLeaving()));
  await openReview();
  await press("Confirm booking");
  expect(asksBeforeLeaving()).toBe(true);
  await press("Retry same booking");
  expect(asksBeforeLeaving()).toBe(true);
  await press("Retry same booking");
  expect(leaving).toEqual([false]);
});

it.each(["VALIDATION", "RATE_LIMITED", "BOOKING_LIMIT_REACHED"])(
  "does not ask before leaving after a definite %s answer",
  async (code) => {
    createReservation.mockResolvedValue(refused(code));
    await openReview();
    await press("Confirm booking");
    expect(asksBeforeLeaving()).toBe(false);
  },
);

it.each([
  ["the online checkout", saved("AWAITING_PAYMENT")],
  ["the results after a sell out", refused("INVENTORY_UNAVAILABLE")],
])(
  "leaves for %s without asking, also after a lost reply",
  async (_to, last) => {
    createReservation
      .mockResolvedValueOnce(refused("NETWORK", { status: null }))
      .mockResolvedValueOnce(last);
    const leaving: boolean[] = [];
    replacePage.mockImplementation(() => leaving.push(asksBeforeLeaving()));
    await openReview();
    await press("Confirm booking");
    await press("Retry same booking");
    expect(leaving).toEqual([false]);
  },
);
