import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManageReservation } from "@/presentation/features/booking/manage-reservation";

import {
  cancellation,
  hotels,
  ok,
  refusal,
  reservation,
} from "./guest-reservation-fixtures";

const { getGuestReservation, requestCancellation } = vi.hoisted(() => ({
  getGuestReservation: vi.fn(),
  requestCancellation: vi.fn(),
}));
vi.mock("@/presentation/api-client/guest", () => ({
  getGuestReservation,
  requestCancellation,
}));

const token = "a".repeat(43);
const otherToken = "b".repeat(43);
const path = "/reservations/manage";
const logs = ["log", "info", "warn", "error", "debug"] as const;

const visit = (hash = "") =>
  window.history.replaceState(null, "", `${path}${hash}`);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  getGuestReservation.mockReset();
  requestCancellation.mockReset();
  visit();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const heading = (name: string) => screen.findByRole("heading", { name });
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const asked = () => screen.queryByRole("button", { name: /Request cancel/ });

async function openBooking(booking = reservation()) {
  getGuestReservation.mockResolvedValue(ok(booking));
  visit(`#t=${token}`);
  render(<ManageReservation hotels={hotels} />);
  await heading("Contact the hotel");
}

describe("the private link", () => {
  it("leaves the address at once, keeps the key for this tab and sends it only as the bearer", async () => {
    const spies = logs.map((name) => vi.spyOn(console, name));
    getGuestReservation.mockResolvedValue(ok(reservation()));
    visit(`#t=${token}`);
    render(
      <StrictMode>
        <ManageReservation hotels={hotels} />
      </StrictMode>,
    );
    await heading("Confirmed");

    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(token);
    expect(getGuestReservation).toHaveBeenCalledTimes(1);
    expect(getGuestReservation).toHaveBeenCalledWith(
      { kind: "MANAGE_LINK", token },
      { signal: expect.any(AbortSignal) },
    );
    expect({ ...sessionStorage }).toEqual({ "rivana.access.manage": token });
    expect(localStorage).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain(token);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("opens the same booking after a reload", async () => {
    sessionStorage.setItem("rivana.access.manage", token);
    getGuestReservation.mockResolvedValue(ok(reservation()));
    render(<ManageReservation hotels={hotels} />);
    await heading("Confirmed");
    expect(getGuestReservation.mock.calls[0]![0]).toEqual({
      kind: "MANAGE_LINK",
      token,
    });
  });

  it.each([
    ["no link", ""],
    ["a short key", "#t=abc"],
    ["a key with other characters", `#t=${"a".repeat(42)}!`],
  ])("shows one neutral message for %s", async (_label, hash) => {
    visit(hash);
    render(<ManageReservation hotels={hotels} />);
    await heading("Open your booking link");
    expect(window.location.hash).toBe("");
    expect(getGuestReservation).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /My reservations/ }),
    ).toHaveAttribute("href", "/reservations/find");
    for (const hotel of hotels)
      expect(screen.getByText(hotel.name)).toBeVisible();
  });

  it("never falls back to an earlier booking after a broken link", async () => {
    sessionStorage.setItem("rivana.access.manage", token);
    visit("#t=broken");
    render(<ManageReservation hotels={hotels} />);
    await heading("Open your booking link");
    expect(getGuestReservation).not.toHaveBeenCalled();
    expect(sessionStorage).toHaveLength(0);
  });

  it.each([
    [401, "UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
  ])("forgets a key the server refuses with %i", async (status, code) => {
    getGuestReservation.mockResolvedValue(refusal(code, status));
    visit(`#t=${token}`);
    render(<ManageReservation hotels={hotels} />);
    await heading("Open your booking link");
    expect(sessionStorage).toHaveLength(0);
    expect(screen.queryByText("RR-DEMO0001")).toBeNull();
  });

  it("follows another link pasted into the same tab and ignores the skip link", async () => {
    await openBooking();
    await act(async () => {
      visit("#main-content");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(window.location.hash).toBe("#main-content");
    expect(getGuestReservation).toHaveBeenCalledTimes(1);

    getGuestReservation.mockResolvedValue(
      ok(reservation({ reference: "RR-DEMO0002" })),
    );
    await act(async () => {
      visit(`#t=${otherToken}`);
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(await screen.findByText("RR-DEMO0002")).toBeVisible();
    expect(screen.queryByText("RR-DEMO0001")).toBeNull();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem("rivana.access.manage")).toBe(otherToken);
  });

  it.each([401, 404])(
    "keeps the key after a %i page that is not the API's",
    async (status) => {
      getGuestReservation.mockResolvedValue(
        refusal("UNEXPECTED_RESPONSE", status),
      );
      visit(`#t=${token}`);
      render(<ManageReservation hotels={hotels} />);
      await heading("We couldn’t load your booking");
      expect(sessionStorage.getItem("rivana.access.manage")).toBe(token);
    },
  );

  it("still opens the booking when the tab refuses storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    await openBooking();
    expect(screen.getByText("RR-DEMO0001")).toBeVisible();
  });
});

describe("the booking", () => {
  it("shows the server's details, price, payment status and deadline in hotel time", async () => {
    await openBooking();
    for (const text of [
      "RR-DEMO0001",
      "No online payment",
      "Amina Hassan",
      "amina@example.test",
      "A quiet room",
      "Deluxe Double",
      "$136.80",
    ])
      expect(screen.getByText(text)).toBeVisible();
    expect(
      screen.getByText(/Sunday,? 28 February 2027 at 14:00/),
    ).toBeVisible();
    expect(asked()).toBeVisible();
    // Changing a booking arrives in M10-T8b.
    expect(
      screen.queryByRole("button", { name: /Change booking/i }),
    ).toBeNull();
  });

  it("waits as long as the server asks before another read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getGuestReservation.mockResolvedValueOnce(
      refusal("RATE_LIMITED", 429, { retryAfter: 30 }),
    );
    visit(`#t=${token}`);
    render(<ManageReservation hotels={hotels} />);
    // One deferred step opens the link, the next reads the booking.
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(1));
    const again = screen.getByRole("button", { name: "Check again" });
    expect(again).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(again).toBeEnabled();

    getGuestReservation.mockResolvedValue(ok(reservation()));
    fireEvent.click(again);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("heading", { name: "Confirmed" })).toBeVisible();
    expect(sessionStorage.getItem("rivana.access.manage")).toBe(token);
  });

  it("links to no hotel page for a branch that is not public now", async () => {
    await openBooking(
      reservation({
        branch: { ...reservation().branch, slug: "closed-branch" },
      }),
    );
    expect(
      screen.queryByRole("link", { name: "Contact the hotel" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: /\+12025550124/ })).toBeVisible();
    expect(screen.queryByText(/2:00 PM/)).toBeNull();
  });
});

describe("a booking that is over", () => {
  it("points to the hotel and offers no request", async () => {
    await openBooking(
      reservation({ status: "CHECKED_OUT", allowedActions: [] }),
    );
    expect(screen.getByText("Current status: stay completed.")).toBeVisible();
    expect(
      screen.getByText(
        "Contact the hotel with any question about this booking.",
      ),
    ).toBeVisible();
    expect(asked()).toBeNull();
  });
});

describe("asking to cancel", () => {
  const send = async (reason = "") => {
    press("Request cancellation");
    if (reason)
      fireEvent.change(screen.getByLabelText(/Reason/), {
        target: { value: reason },
      });
    await act(async () => press("Send request"));
  };
  const requested = () =>
    reservation({
      cancellationRequest: cancellation("OPEN"),
      allowedActions: [],
    });

  it("sends the trimmed reason once and shows what the server holds afterwards", async () => {
    await openBooking();
    let answer!: (value: unknown) => void;
    requestCancellation.mockReturnValue(
      new Promise((resolve) => (answer = resolve)),
    );
    getGuestReservation.mockResolvedValue(ok(requested()));
    press("Request cancellation");
    expect(screen.getByLabelText(/Reason/)).toHaveFocus();
    expect(
      screen.getByText(/stays confirmed until the hotel decides/),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "  Plans changed  " },
    });
    press("Send request");
    const sending = screen.getByRole("button", { name: "Sending…" });
    expect(sending).toBeDisabled();
    fireEvent.submit(sending.closest("form")!);
    await act(async () => answer(ok(cancellation("OPEN"), 201)));
    expect(requestCancellation).toHaveBeenCalledTimes(1);
    expect(requestCancellation).toHaveBeenCalledWith(
      { kind: "MANAGE_LINK", token },
      { reason: "Plans changed" },
    );
    expect(await heading("Cancellation requested")).toBeVisible();
    expect(
      screen.getByText("Your request was sent to the hotel."),
    ).toHaveFocus();
    expect(asked()).toBeNull();
  });

  it("sends no reason field when it is empty", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(ok(cancellation("OPEN"), 201));
    await send("   ");
    expect(requestCancellation.mock.calls[0]![1]).toEqual({});
  });

  it("keeps the booking when the guest backs out", async () => {
    await openBooking();
    press("Request cancellation");
    press("Keep my booking");
    expect(asked()).toHaveFocus();
    expect(requestCancellation).not.toHaveBeenCalled();
  });

  it("refuses hidden characters before sending", async () => {
    await openBooking();
    await send("Plans‮changed");
    expect(requestCancellation).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove hidden/)).toBeVisible();
  });

  it.each([
    ["CANCELLATION_WINDOW_CLOSED", 409, /cancellation has closed/],
    ["CANCELLATION_REQUEST_EXISTS", 409, /already has a request/],
    ["INVALID_TRANSITION", 409, /cannot be cancelled online now/],
    ["PHONE_BLOCKED", 403, /contact the hotel to continue/],
    ["NETWORK", null, /couldn’t confirm that your request was sent/],
    ["UNEXPECTED_RESPONSE", 502, /couldn’t confirm/],
    ["INTERNAL", 500, /couldn’t confirm/],
  ])("reads the booking again after %s", async (code, status, message) => {
    await openBooking();
    requestCancellation.mockResolvedValue(refusal(code, status));
    getGuestReservation.mockResolvedValue(
      ok(reservation({ allowedActions: [] })),
    );
    await send();
    expect(await screen.findByText(message)).toHaveFocus();
    expect(getGuestReservation).toHaveBeenCalledTimes(2);
    expect(asked()).toBeNull();
  });

  it("offers no second try while a lost reply cannot be checked", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(refusal("NETWORK", null));
    getGuestReservation.mockResolvedValueOnce(refusal("NETWORK", null));
    await send();
    expect(await screen.findByText(/may be out of date/)).toBeVisible();
    expect(asked()).toBeNull();
    expect(screen.getByText("RR-DEMO0001")).toBeVisible();

    getGuestReservation.mockResolvedValue(ok(requested()));
    await act(async () => press("Check again"));
    expect(await heading("Cancellation requested")).toBeVisible();
    expect(requestCancellation).toHaveBeenCalledTimes(1);
  });

  it("keeps the form and the reason while the server asks to wait", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(
      refusal("RATE_LIMITED", 429, { retryAfter: 600 }),
    );
    await send("Plans changed");
    expect(screen.getByRole("alert")).toHaveTextContent("10 minutes");
    expect(screen.getByLabelText(/Reason/)).toHaveValue("Plans changed");
    await act(async () => press("Send request"));
    expect(requestCancellation).toHaveBeenCalledTimes(1);
    expect(getGuestReservation).toHaveBeenCalledTimes(1);
  });

  it("keeps the form when the booking is busy", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(refusal("TRY_AGAIN", 503));
    await send();
    expect(screen.getByRole("alert")).toHaveTextContent("busy");
    await act(async () => press("Send request"));
    expect(requestCancellation).toHaveBeenCalledTimes(2);
  });

  it("shows the server's reason error at the field", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(
      refusal("VALIDATION", 422, {
        fieldErrors: { reason: ["Use plain text."] },
      }),
    );
    await send("x");
    expect(screen.getByText("Use plain text.")).toBeVisible();
    expect(screen.getByLabelText(/Reason/)).toHaveFocus();
  });

  it("closes the booking when the link no longer works", async () => {
    await openBooking();
    requestCancellation.mockResolvedValue(refusal("UNAUTHENTICATED", 401));
    await send();
    await heading("Open your booking link");
    expect(sessionStorage).toHaveLength(0);
  });
});
