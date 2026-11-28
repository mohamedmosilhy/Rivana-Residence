import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MyReservations } from "@/presentation/features/booking/my-reservations";

import { hotels, ok, refusal, reservation } from "./guest-reservation-fixtures";

const api = vi.hoisted(() => ({
  requestVerification: vi.fn(),
  confirmVerification: vi.fn(),
  listGuestReservations: vi.fn(),
  getGuestReservation: vi.fn(),
  requestCancellation: vi.fn(),
}));
vi.mock("@/presentation/api-client/verification", () => ({
  requestVerification: api.requestVerification,
  confirmVerification: api.confirmVerification,
}));
vi.mock("@/presentation/api-client/guest", () => ({
  listGuestReservations: api.listGuestReservations,
  getGuestReservation: api.getGuestReservation,
  requestCancellation: api.requestCancellation,
}));

const token = "s".repeat(43);
const lifetimes = { codeLifetimeMs: 600_000, tokenLifetimeMs: 1_800_000 };
const countries = [
  { code: "EG", label: "Egypt (+20)" },
  { code: "US", label: "United States (+1)" },
];
const summary = {
  reference: "RR-DEMO0001",
  status: "CONFIRMED",
  branchName: "Rivana New Cairo",
  branchSlug: "new-cairo",
  stay: { checkIn: "2027-03-01", checkOut: "2027-03-03" },
  units: 1,
  total: { amountMinor: 13680, currency: "USD" as const },
  createdAt: "2026-11-01T10:00:00.000Z",
};
const both = { whatsapp: true, email: true };
const logs = ["log", "info", "warn", "error", "debug"] as const;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  for (const mock of Object.values(api)) mock.mockReset();
  const issued = () => new Date(Date.now()).getTime();
  api.requestVerification.mockImplementation(async () =>
    ok(
      {
        verificationId: "verification-1",
        expiresAt: new Date(issued() + 600_000).toISOString(),
        resendAvailableAt: new Date(issued()).toISOString(),
      },
      201,
    ),
  );
  api.confirmVerification.mockResolvedValue(
    ok({ token, expiresAt: new Date().toISOString() }),
  );
  api.listGuestReservations.mockResolvedValue(ok({ items: [summary] }));
  api.getGuestReservation.mockResolvedValue(ok(reservation()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const open = (channels = both) =>
  render(
    <MyReservations
      channels={channels}
      countries={countries}
      hotels={hotels}
      lifetimes={lifetimes}
    />,
  );
const heading = (name: string) => screen.findByRole("heading", { name });
const button = (name: string | RegExp) => screen.findByRole("button", { name });
const press = async (name: string | RegExp) => {
  const target = await button(name);
  await act(async () => void fireEvent.click(target));
};
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function askByPhone() {
  await heading("Find your bookings");
  type("Phone country", "US");
  type("Phone number", "(202) 555-0101");
  await press("Continue");
  await press("Send code");
}

async function signIn() {
  await askByPhone();
  await screen.findByLabelText("Verification code");
  type("Verification code", "123456");
  await press("Verify code");
  await heading("Your bookings");
}

/** The button of the one listed booking. */
const listed = () =>
  screen.getByRole("button", { name: "View booking RR-DEMO0001" });

const stored = () => sessionStorage.getItem("rivana.access.session");

it("signs in by WhatsApp, lists the bookings and keeps only the session in the tab", async () => {
  const spies = logs.map((name) => vi.spyOn(console, name));
  const address = window.location.href;
  open();
  await signIn();

  expect(api.requestVerification).toHaveBeenCalledWith({
    phone: "+12025550101",
    purpose: "GUEST_SESSION",
    channel: "WHATSAPP",
  });
  expect(await screen.findByText("1 booking found.")).toBeInTheDocument();
  expect(listed()).toBeVisible();
  expect(screen.getByText("$136.80")).toBeVisible();
  expect(api.listGuestReservations).toHaveBeenCalledWith(token, {
    signal: expect.any(AbortSignal),
  });
  expect(Object.keys({ ...sessionStorage })).toEqual(["rivana.access.session"]);
  expect(JSON.parse(stored()!)).toMatchObject({ token, channel: "WHATSAPP" });
  expect(stored()).not.toContain("123456");
  expect(localStorage).toHaveLength(0);
  expect(window.location.href).toBe(address);
  expect(document.body.innerHTML).not.toContain(token);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});

it("asks for the email and the phone with an email code", async () => {
  open();
  await heading("Find your bookings");
  fireEvent.click(screen.getByRole("radio", { name: /Email/ }));
  type("Email", "  Amina@Example.test ");
  type("Phone country", "US");
  type("Phone number", "(202) 555-0101");
  expect(screen.getByText(/found by your email address only/)).toBeVisible();
  await press("Continue");
  expect(screen.queryByText(/you pay online/)).toBeNull();
  await press("Send code");
  expect(api.requestVerification).toHaveBeenCalledWith({
    phone: "+12025550101",
    purpose: "GUEST_SESSION",
    channel: "EMAIL",
    email: "amina@example.test",
  });
});

it("checks the fields in the browser before asking for a code", async () => {
  open();
  await heading("Find your bookings");
  fireEvent.click(screen.getByRole("radio", { name: /Email/ }));
  type("Email", "not-an-email");
  await press("Continue");
  expect(await screen.findByText("Enter your phone number.")).toBeVisible();
  expect(screen.getByText(/Enter a valid email address/)).toBeVisible();
  expect(screen.getByLabelText("Phone number")).toHaveFocus();
  expect(api.requestVerification).not.toHaveBeenCalled();
});

it("keeps the focus on the choice after coming back to the form", async () => {
  open();
  await signIn();
  await press("Sign out");
  expect(
    await screen.findByRole("heading", { name: "Find your bookings" }),
  ).toHaveFocus();
  const email = screen.getByRole("radio", { name: /Email/ });
  email.focus();
  await act(async () => void fireEvent.click(email));
  expect(email).toHaveFocus();
});

it("returns the server's phone error to the form", async () => {
  api.requestVerification.mockResolvedValue(
    refusal("VALIDATION", 422, {
      fieldErrors: { phone: ["Enter a valid phone."] },
    }),
  );
  open();
  await askByPhone();
  await heading("Find your bookings");
  expect(screen.getByText("Enter a valid phone.")).toBeVisible();
  expect(screen.getByLabelText("Phone number")).toHaveValue("(202) 555-0101");
});

it.each([
  [{ whatsapp: true, email: false }, "Phone number"],
  [{ whatsapp: false, email: true }, "Email"],
])("offers only the channel that works", async (channels, label) => {
  open(channels);
  await heading("Find your bookings");
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByLabelText(label)).toBeVisible();
});

it("shows every hotel when no code can be sent", async () => {
  open({ whatsapp: false, email: false });
  await heading("Codes can’t be sent right now");
  for (const hotel of hotels)
    expect(screen.getByText(hotel.name)).toBeVisible();
});

it("uses a session that is still live even when no code can be sent now", async () => {
  sessionStorage.setItem(
    "rivana.access.session",
    JSON.stringify({
      token,
      channel: "EMAIL",
      expiresAtMs: Date.now() + 60_000,
    }),
  );
  open({ whatsapp: false, email: false });
  expect(await button("View booking RR-DEMO0001")).toBeVisible();
});

it.each([
  ["an expired session", { token, channel: "EMAIL", expiresAtMs: 1 }],
  ["a malformed session", { token: "short", channel: "EMAIL" }],
])("drops %s", async (_label, value) => {
  sessionStorage.setItem("rivana.access.session", JSON.stringify(value));
  open();
  await heading("Find your bookings");
  expect(stored()).toBeNull();
  expect(api.listGuestReservations).not.toHaveBeenCalled();
});

it("ends the session after 30 minutes", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  sessionStorage.setItem(
    "rivana.access.session",
    JSON.stringify({
      token,
      channel: "WHATSAPP",
      expiresAtMs: Date.now() + 1_800_000,
    }),
  );
  open();
  await act(() => vi.advanceTimersByTimeAsync(1));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(listed()).toBeVisible();
  await act(() => vi.advanceTimersByTimeAsync(1_800_000));
  expect(screen.getByText(/Your access has ended/)).toBeVisible();
  expect(screen.queryByText(/RR-DEMO0001/)).toBeNull();
  expect(stored()).toBeNull();
});

it("signs out, clears what was typed and every key in the tab", async () => {
  sessionStorage.setItem("rivana.access.manage", "m".repeat(43));
  sessionStorage.setItem("rivana.booking.result", "{}");
  open();
  await signIn();
  await press("Sign out");
  await heading("Find your bookings");
  expect(screen.getByText("You have signed out.")).toBeVisible();
  expect(screen.getByLabelText("Phone number")).toHaveValue("");
  expect(sessionStorage).toHaveLength(0);
});

it("asks for a new code when the server ends the session", async () => {
  api.listGuestReservations.mockResolvedValue(
    refusal("PHONE_NOT_VERIFIED", 401),
  );
  open();
  await askByPhone();
  await screen.findByLabelText("Verification code");
  type("Verification code", "123456");
  await press("Verify code");
  expect(await screen.findByText(/Your access has ended/)).toBeVisible();
  expect(stored()).toBeNull();
});

it.each(["list", "send"])(
  "shows a neutral message for a blocked number at %s",
  async (step) => {
    const blocked = refusal("PHONE_BLOCKED", 403);
    if (step === "send") api.requestVerification.mockResolvedValue(blocked);
    else api.listGuestReservations.mockResolvedValue(blocked);
    open();
    await askByPhone();
    if (step === "list") {
      await screen.findByLabelText("Verification code");
      type("Verification code", "123456");
      await press("Verify code");
    }
    await heading("Please contact the hotel to continue");
    expect(document.body.textContent).not.toMatch(/block/i);
    expect(stored()).toBeNull();
  },
);

it("suggests the other method when a WhatsApp list is empty", async () => {
  api.listGuestReservations.mockResolvedValue(ok({ items: [] }));
  open();
  await signIn();
  expect(await screen.findByText("No bookings found.")).toBeVisible();
  expect(screen.getByText(/booked with an email code/i)).toBeVisible();
});

it("loads the list again after a failed read", async () => {
  api.listGuestReservations.mockResolvedValueOnce(refusal("NETWORK", null));
  open();
  await signIn();
  await press("Check again");
  expect(await button("View booking RR-DEMO0001")).toBeVisible();
});

it("opens a booking through the session and goes back to the list", async () => {
  open();
  await signIn();
  await press("View booking RR-DEMO0001");
  await heading("Confirmed");
  expect(api.getGuestReservation).toHaveBeenCalledWith(
    { kind: "SESSION", token, reference: "RR-DEMO0001" },
    { signal: expect.any(AbortSignal) },
  );
  expect(window.location.href).not.toContain("RR-DEMO0001");

  api.requestCancellation.mockResolvedValue(ok({}, 201));
  await press("Request cancellation");
  await press("Send request");
  expect(api.requestCancellation).toHaveBeenCalledWith(
    { kind: "SESSION", token, reference: "RR-DEMO0001" },
    {},
  );

  await press("Back to my reservations");
  await heading("Your bookings");
  expect(api.listGuestReservations).toHaveBeenCalledTimes(2);
});

it("returns to the list when a booking has left it", async () => {
  api.getGuestReservation.mockResolvedValue(refusal("NOT_FOUND", 404));
  open();
  await signIn();
  await press("View booking RR-DEMO0001");
  expect(
    await screen.findByText("That booking is no longer in your list."),
  ).toBeVisible();
  expect(stored()).not.toBeNull();
});

it("offers every hotel when the chosen channel turns out to be off", async () => {
  api.requestVerification.mockResolvedValue(
    refusal("WHATSAPP_NOT_CONFIGURED", 503),
  );
  open();
  await askByPhone();
  expect(
    await screen.findByText(/Contact the hotel about your booking/),
  ).toBeVisible();
  for (const hotel of hotels)
    expect(screen.getAllByText(hotel.name).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Contact the hotel to book/)).toBeNull();
});

it("offers every hotel beside a code that could not be sent", async () => {
  api.requestVerification.mockResolvedValue(
    refusal("VERIFICATION_UNAVAILABLE", 503),
  );
  open();
  await askByPhone();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Rivana New Cairo",
  );
});

it("goes back from the code step with the typed values kept", async () => {
  open();
  await askByPhone();
  await press("Change your phone or email");
  await heading("Find your bookings");
  expect(screen.getByLabelText("Phone number")).toHaveValue("(202) 555-0101");
  expect(screen.getByLabelText("Phone country")).toHaveValue("US");
});

it("keeps the session after an error page that is not the API's", async () => {
  api.listGuestReservations.mockResolvedValue(
    refusal("UNEXPECTED_RESPONSE", 401),
  );
  open();
  await askByPhone();
  await screen.findByLabelText("Verification code");
  type("Verification code", "123456");
  await press("Verify code");
  expect(await button("Check again")).toBeVisible();
  expect(stored()).not.toBeNull();
});

it("says to contact a hotel when none is listed", async () => {
  render(
    <MyReservations
      channels={{ whatsapp: false, email: false }}
      countries={countries}
      hotels={[]}
      lifetimes={lifetimes}
    />,
  );
  expect(
    await screen.findByText("Please contact the hotel for help."),
  ).toBeVisible();
});
