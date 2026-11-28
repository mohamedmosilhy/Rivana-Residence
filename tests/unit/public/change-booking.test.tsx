import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeBooking } from "@/presentation/features/booking/change-booking";

import { stayTimes, usd } from "./booking-extras-fixtures";
import {
  booking,
  currentQuote,
  listings,
  options,
  preview,
  transferLine,
} from "./change-fixtures";
import { ok, refusal } from "./guest-reservation-fixtures";

const api = vi.hoisted(() => ({
  getGuestReservation: vi.fn(),
  previewChange: vi.fn(),
  applyChange: vi.fn(),
  requestCancellation: vi.fn(),
  listBranchListings: vi.fn(),
}));
vi.mock("@/presentation/api-client/guest", () => ({
  getGuestReservation: api.getGuestReservation,
  previewChange: api.previewChange,
  applyChange: api.applyChange,
  requestCancellation: api.requestCancellation,
}));
vi.mock("@/presentation/api-client/listings", () => ({
  listBranchListings: api.listBranchListings,
}));

const token = "a".repeat(43);
const logs = ["log", "info", "warn", "error", "debug"] as const;

beforeEach(() => {
  sessionStorage.clear();
  for (const mock of Object.values(api)) mock.mockReset();
  api.getGuestReservation.mockResolvedValue(ok(booking()));
  api.listBranchListings.mockResolvedValue(ok({ items: listings }));
  api.previewChange.mockResolvedValue(preview());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Props = ComponentProps<typeof ChangeBooking>;

async function open(patch: Partial<Props> = {}) {
  const onClose = vi.fn();
  const onRefused = vi.fn();
  const view = render(
    <ChangeBooking
      access={{ kind: "MANAGE_LINK", token }}
      booking={booking()}
      options={options}
      times={stayTimes}
      contactPage
      emailSession={false}
      onClose={onClose}
      onRefused={onRefused}
      {...patch}
    />,
  );
  return { ...view, onClose, onRefused };
}

const field = (label: string | RegExp) => screen.getByLabelText(label);
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const heading = (name: string) => screen.findByRole("heading", { name });
const ready = () => screen.findByLabelText("Check-out");

/** Opens the form, moves the check-out, and asks for the new price. */
async function toReview(patch: Partial<Props> = {}) {
  const view = await open(patch);
  await ready();
  await screen.findByRole("button", { name: "Add a room or apartment" });
  type("Check-out", "2026-12-06");
  press("See the new price");
  await heading("Check your changes");
  return view;
}

const applied = (patch = {}) => ({
  ok: true,
  status: 200,
  etag: '"v2"',
  data: booking({
    stay: { checkIn: "2026-12-03", checkOut: "2026-12-06" },
    ...patch,
  }),
});

const requested = {
  ok: true,
  status: 202,
  etag: '"v1"',
  data: {
    id: "change-1",
    status: "OPEN",
    createdAt: "2026-11-28T10:00:00.000Z",
    previewTotalMinor: 27_600,
    decisionReason: null,
    closedReason: null,
  },
};

describe("opening the change", () => {
  it("reads an unchanged preview, then the booking, and fills the form", async () => {
    const spies = logs.map((name) => vi.spyOn(console, name));
    render(
      <StrictMode>
        <ChangeBooking
          access={{ kind: "MANAGE_LINK", token }}
          booking={booking()}
          options={options}
          times={stayTimes}
          contactPage
          emailSession={false}
          onClose={vi.fn()}
          onRefused={vi.fn()}
        />
      </StrictMode>,
    );
    await ready();

    expect(api.previewChange).toHaveBeenCalledTimes(1);
    expect(api.previewChange.mock.calls[0]![1]).toEqual({});
    expect(api.previewChange.mock.invocationCallOrder[0]!).toBeLessThan(
      api.getGuestReservation.mock.invocationCallOrder[0]!,
    );
    expect(field("Check-in")).toHaveValue("2026-12-03");
    expect(field("Check-in")).toHaveAttribute("min", "2026-11-28");
    expect(field("Full name")).toHaveValue("Amina Hassan");
    expect(field("Email")).toHaveValue("amina@example.test");
    expect(field("Room or apartment")).toHaveValue("deluxe");
    expect(
      screen.getByRole("heading", { name: "Change booking" }),
    ).toHaveFocus();
    // Phone, hotel and payment are shown, with nothing to edit them.
    expect(screen.getByText("+12025550101")).toBeVisible();
    expect(screen.getByText("Pay at the hotel")).toBeVisible();
    expect(screen.queryByLabelText(/Phone/)).toBeNull();
    expect(document.body.innerHTML).not.toContain(token);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("goes back to the booking when it can no longer be changed", async () => {
    api.getGuestReservation.mockResolvedValue(
      ok(booking({ allowedActions: [] })),
    );
    const { onClose } = await open();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledWith(null));
  });

  it.each([
    ["DEADLINE_PASSED", "The time for online changes has passed."],
    ["REQUEST_OPEN", "A request on this booking is waiting for the hotel."],
    ["STATUS", "This booking cannot be changed online now."],
    ["PHONE_BLOCKED", "Please contact the hotel to continue."],
  ])("shows the contacts when refused for %s", async (reason, words) => {
    api.previewChange.mockResolvedValue(
      refusal("CHANGE_NOT_ALLOWED", 403, { context: { reason } }),
    );
    await open();
    expect(await screen.findByText(words)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Contact the hotel" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Check-in")).toBeNull();
  });

  it("offers another try after a failed read, and after the wait the server asks", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api.previewChange.mockResolvedValueOnce(
      refusal("RATE_LIMITED", 429, { retryAfter: 30 }),
    );
    await open();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByText("Too many price checks. Try again in 30 seconds."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    press("Check again");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(field("Check-in")).toHaveValue("2026-12-03");
  });

  it("does not trust a preview without a version", async () => {
    api.previewChange.mockResolvedValue(preview({}, null));
    await open();
    expect(
      await screen.findByText(/We couldn’t open your booking for changes/),
    ).toBeVisible();
  });

  it("leaves a refused key to the page", async () => {
    api.previewChange.mockResolvedValue(refusal("UNAUTHENTICATED", 401));
    const { onRefused } = await open();
    await vi.waitFor(() => expect(onRefused).toHaveBeenCalledWith("gone"));
  });

  it("asks the booking again, not the key, after a not found answer", async () => {
    api.previewChange.mockResolvedValue(refusal("NOT_FOUND", 404));
    const { onClose, onRefused } = await open();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRefused).not.toHaveBeenCalled();
  });
});

describe("the form", () => {
  it("asks nothing of the server until the guest presses, and nothing for no change", async () => {
    await open();
    await ready();
    press("See the new price");
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent("Nothing has changed yet.");
    expect(summary).toHaveFocus();
    expect(api.previewChange).toHaveBeenCalledTimes(1);
  });

  it("shows browser checks in a summary that leads to the field", async () => {
    await open();
    await ready();
    type("Email", "wrong");
    press("See the new price");
    expect(field("Email")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: /Enter a valid email/,
      }),
    );
    expect(field("Email")).toHaveFocus();
    expect(api.previewChange).toHaveBeenCalledTimes(1);
    // Typing does not move the focus away.
    type("Email", "wrong2");
    expect(field("Email")).toHaveFocus();
  });

  it("adds, switches and removes units within the listing's limits", async () => {
    await open();
    await ready();
    await screen.findByRole("button", { name: "Add a room or apartment" });
    press("Add a room or apartment");
    const second = screen.getByRole("group", { name: "Unit 2" });
    fireEvent.change(within(second).getByLabelText("Room or apartment"), {
      target: { value: "family" },
    });
    fireEvent.change(within(second).getByLabelText("Adults"), {
      target: { value: "4" },
    });
    press(/Remove unit 1/);
    press("See the new price");
    await heading("Check your changes");
    expect(api.previewChange.mock.calls.at(-1)![1]).toEqual({
      lines: [{ roomSlug: "family", occupancy: { adults: 4, children: 0 } }],
    });
  });

  it("keeps a listing that is no longer published at what it holds", async () => {
    api.listBranchListings.mockResolvedValue(ok({ items: [listings[1]] }));
    await open();
    await ready();
    await screen.findByRole("button", { name: "Add a room or apartment" });
    const first = screen.getByRole("group", { name: "Unit 1" });
    expect(
      within(first)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toContain("Deluxe Double");
    expect(within(first).getByLabelText("Adults")).toHaveValue("2");
    expect(
      within(within(first).getByLabelText("Adults")).getAllByRole("option"),
    ).toHaveLength(2);
  });

  it("still changes dates when the listings do not load, and loads them again", async () => {
    api.listBranchListings.mockResolvedValueOnce(refusal("NETWORK", null));
    await open();
    await ready();
    await screen.findByText(/We couldn’t load the other rooms/);
    expect(
      screen.queryByRole("button", { name: "Add a room or apartment" }),
    ).toBeNull();
    press("Load them again");
    expect(
      await screen.findByRole("button", { name: "Add a room or apartment" }),
    ).toBeVisible();
  });

  it("keeps a booked extra at the booked price and its cars when the offer is gone", async () => {
    api.previewChange.mockResolvedValue(
      preview({ current: currentQuote({ services: [transferLine(2)] }) }),
    );
    await open({ options: { ...options, services: [], maxVehicles: null } });
    await ready();
    expect(screen.getByText("$25.00 per car")).toBeVisible();
    expect(
      within(field("Cars"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["2"]);
    expect(screen.queryByLabelText(/Breakfast/)).toBeNull();
  });

  it("offers the current car counts and the original count if the limit fell", async () => {
    api.previewChange.mockResolvedValue(
      preview({ current: currentQuote({ services: [transferLine(5)] }) }),
    );
    await open({ options: { ...options, maxVehicles: 2 } });
    await ready();

    const cars = field("Cars");
    expect(cars).toHaveValue("5");
    expect(
      within(cars)
        .getAllByRole("option")
        .map((choice) => choice.textContent),
    ).toEqual(["1", "2", "5"]);
  });

  it("shows the units that are not available", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValue(
      preview({ available: false, unavailableLines: [0], proposed: null }),
    );
    type("Check-out", "2026-12-06");
    press("See the new price");
    expect(
      await screen.findAllByText(
        "Unit 1, Deluxe Double, is not available for these dates.",
      ),
    ).toHaveLength(2);
    expect(field("Check-out")).toHaveValue("2026-12-06");
  });

  it("fills the form again when the booking moved on", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValueOnce(preview({}, '"v2"'));
    api.previewChange.mockResolvedValue(preview({}, '"v2"'));
    type("Check-out", "2026-12-06");
    press("See the new price");
    expect(
      await screen.findByText(/This booking changed while you were editing/),
    ).toHaveFocus();
    expect(field("Check-out")).toHaveValue("2026-12-05");
    expect(screen.queryByRole("heading", { name: /Check your/ })).toBeNull();
  });

  it("says dates are too close while the booking itself can still change", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValue(
      refusal("CHANGE_NOT_ALLOWED", 403, {
        context: { reason: "DEADLINE_PASSED" },
      }),
    );
    type("Check-in", "2026-11-28");
    press("See the new price");
    expect(
      (await screen.findAllByText(/These new dates are too close/)).length,
    ).toBe(2);
    expect(field("Check-in")).toHaveValue("2026-11-28");
  });

  it("shows only the contacts once the whole booking is past the deadline", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValue(
      refusal("CHANGE_NOT_ALLOWED", 403, {
        context: { reason: "DEADLINE_PASSED" },
      }),
    );
    api.getGuestReservation.mockResolvedValue(
      ok(booking({ allowedActions: [] })),
    );
    type("Check-in", "2026-11-28");
    press("See the new price");
    expect(
      await screen.findByText("The time for online changes has passed."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Check-in")).toBeNull();
  });

  it("shows the server's field messages", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValue(
      refusal("VALIDATION", 422, {
        fieldErrors: { "stay.checkOut": ["Use at most 30 nights."] },
      }),
    );
    type("Check-out", "2027-02-06");
    press("See the new price");
    await screen.findAllByText("Use at most 30 nights.");
    expect(field("Check-out")).toHaveAttribute("aria-invalid", "true");
  });

  it("removes a new extra the server switched off", async () => {
    await open();
    await ready();
    api.previewChange.mockResolvedValue(
      refusal("SERVICE_UNAVAILABLE", 409, { context: { kind: "BREAKFAST" } }),
    );
    fireEvent.click(field(/Breakfast/));
    press("See the new price");
    expect(
      await screen.findByText(
        "Breakfast is no longer available, so we removed it.",
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText(/Breakfast/)).toBeNull();
  });

  it("holds the button for the wait a preview limit asks", async () => {
    await open();
    await ready();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    api.previewChange.mockResolvedValue(
      refusal("RATE_LIMITED", 429, { retryAfter: 45 }),
    );
    type("Check-out", "2026-12-06");
    press("See the new price");
    await act(() => vi.advanceTimersByTimeAsync(0));
    const submit = screen.getByRole("button", { name: "See the new price" });
    expect(submit).toHaveAttribute("aria-disabled", "true");
    // An edit during the wait keeps the reason on screen.
    fireEvent.change(screen.getByLabelText("Adults"), {
      target: { value: "1" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Try again in 45");
    press("See the new price");
    expect(api.previewChange).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(45_000));
    expect(submit).not.toHaveAttribute("aria-disabled");
  });

  it("returns to the booking without sending anything", async () => {
    const { onClose } = await open();
    await ready();
    press("Keep my booking as it is");
    expect(onClose).toHaveBeenCalledWith(null);
    expect(api.applyChange).not.toHaveBeenCalled();
  });
});

describe("the review and the change", () => {
  it("shows both server totals and what changes, with no difference worked out", async () => {
    await toReview();
    expect(api.previewChange.mock.calls.at(-1)![1]).toEqual({
      stay: { checkIn: "2026-12-03", checkOut: "2026-12-06" },
    });
    expect(screen.getByText("Current total with VAT")).toBeVisible();
    expect(screen.getByText("New total with VAT")).toBeVisible();
    expect(screen.getAllByText("$276.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$184.00").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("$92.00");
    expect(screen.getByText("Dates")).toBeVisible();
    expect(
      screen.getByText(/You pay the new total at the hotel/),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Check your changes" }),
      ).toHaveFocus(),
    );
  });

  it("keeps the edits on the way back to the form", async () => {
    await toReview();
    press("Back to the form");
    expect(field("Check-out")).toHaveValue("2026-12-06");
  });

  it("confirms the previewed total against its version, once, and shows the new details", async () => {
    let answer!: (value: unknown) => void;
    api.applyChange.mockReturnValue(
      new Promise((resolve) => (answer = resolve)),
    );
    const { onClose } = await toReview();
    press("Confirm change");
    press(/Sending/);
    expect(
      screen.getByRole("button", { name: "Back to the form" }),
    ).toBeDisabled();
    await act(async () => answer(applied()));

    expect(api.applyChange).toHaveBeenCalledTimes(1);
    expect(api.applyChange).toHaveBeenCalledWith(
      { kind: "MANAGE_LINK", token },
      '"v1"',
      {
        stay: { checkIn: "2026-12-03", checkOut: "2026-12-06" },
        expectedTotal: usd(27_600),
      },
    );
    expect(await heading("Your booking was changed")).toHaveFocus();
    expect(screen.getByText("RR-DEMO0001")).toBeVisible();
    press("View my booking");
    expect(onClose).toHaveBeenCalledWith(null);
  });

  it("sends a paid change with another total to the hotel", async () => {
    api.previewChange.mockResolvedValue(preview({ outcome: "NEEDS_APPROVAL" }));
    api.getGuestReservation.mockResolvedValue(
      ok(booking({ paymentMethod: "ONLINE", paymentStatus: "PAID" })),
    );
    api.applyChange.mockResolvedValue(requested);
    await toReview();
    expect(
      screen.getByText(/Nothing changes until then, including your details/),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
    press("Send to the hotel for approval");
    await heading("Sent to the hotel for approval");
    expect(screen.getByText(/Your booking has not changed yet/)).toBeVisible();
    expect(screen.queryByText("Your booking was changed")).toBeNull();
  });

  it("explains approval when the booking total already differs from the amount paid online", async () => {
    const afterEarlierApproval = currentQuote({ total: usd(27_600) });
    api.previewChange.mockResolvedValue(
      preview({
        current: afterEarlierApproval,
        proposed: afterEarlierApproval,
        outcome: "NEEDS_APPROVAL",
      }),
    );
    api.getGuestReservation.mockResolvedValue(
      ok(booking({ paymentMethod: "ONLINE", paymentStatus: "PAID" })),
    );
    await open();
    await ready();
    type(/Special requests/, "A high floor, please");
    press("See the new price");
    await heading("Check your changes");

    expect(
      screen.getByText(/The new total differs from what you paid online/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send to the hotel for approval" }),
    ).toBeVisible();
  });

  it("says the paid total stays when it does", async () => {
    api.getGuestReservation.mockResolvedValue(
      ok(booking({ paymentMethod: "ONLINE", paymentStatus: "PAID" })),
    );
    await toReview();
    expect(screen.getByText(/The total you paid stays the same/)).toBeVisible();
  });

  it("shows a changed price and sends it only after the guest accepts it", async () => {
    await toReview();
    api.applyChange.mockResolvedValueOnce(refusal("PRICE_CHANGED", 409));
    api.applyChange.mockResolvedValue(applied());
    api.previewChange.mockResolvedValue(
      preview({ proposed: currentQuote({ total: usd(30_000) }) }),
    );
    press("Confirm change");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("$276.00");
    expect(alert).toHaveTextContent("$300.00");
    expect(alert).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
    expect(api.applyChange).toHaveBeenCalledTimes(1);

    press("Accept new total");
    press("Confirm change");
    await heading("Your booking was changed");
    expect(api.applyChange.mock.calls[1]![2].expectedTotal).toEqual(
      usd(30_000),
    );
  });

  it("does not confirm on the second click of a double click", async () => {
    await toReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }), {
      detail: 2,
    });
    expect(api.applyChange).not.toHaveBeenCalled();
  });

  it("keeps the preview limit and the change limit apart", async () => {
    api.applyChange.mockResolvedValue(
      refusal("RATE_LIMITED", 429, { retryAfter: 7200 }),
    );
    await toReview();
    press("Confirm change");
    await screen.findByRole("alert");
    press("Back to the form");
    const submit = screen.getByRole("button", { name: "See the new price" });
    expect(submit).not.toHaveAttribute("aria-disabled");
    press("See the new price");
    await heading("Check your changes");
    // The change limit still holds, and the screen still says why.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The limit for booking changes has been reached.",
    );
    expect(
      screen.getByRole("button", { name: "Confirm change" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it.each(["STALE_VERSION", "PRECONDITION_REQUIRED"])(
    "fills the form again after %s",
    async (code) => {
      api.applyChange.mockResolvedValue(refusal(code, 412));
      await toReview();
      press("Confirm change");
      await screen.findByText(/This booking changed while you were editing/);
      expect(field("Check-out")).toHaveValue("2026-12-05");
    },
  );

  it("names the unit taken during confirmation and keeps the edits", async () => {
    api.applyChange.mockResolvedValue(refusal("INVENTORY_UNAVAILABLE", 409));
    await toReview();
    api.previewChange.mockResolvedValueOnce(
      preview({ available: false, unavailableLines: [0], proposed: null }),
    );
    press("Confirm change");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Unit 1, Deluxe Double, is not available for these dates/,
    );
    expect(field("Check-out")).toHaveValue("2026-12-06");
    expect(api.previewChange).toHaveBeenLastCalledWith(
      { kind: "MANAGE_LINK", token },
      { stay: { checkIn: "2026-12-03", checkOut: "2026-12-06" } },
    );
    expect(api.applyChange).toHaveBeenCalledTimes(1);
  });

  it("asks for a new review when inventory becomes available again", async () => {
    api.applyChange.mockResolvedValue(refusal("INVENTORY_UNAVAILABLE", 409));
    await toReview();
    press("Confirm change");
    expect(
      await screen.findByText(/Your selection is available again/),
    ).toHaveFocus();
    expect(field("Check-out")).toHaveValue("2026-12-06");
    expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
    expect(api.applyChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the edits if the inventory recheck cannot be read", async () => {
    api.applyChange.mockResolvedValue(refusal("INVENTORY_UNAVAILABLE", 409));
    await toReview();
    api.previewChange.mockResolvedValueOnce(refusal("NETWORK", null));
    press("Confirm change");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /We couldn’t check the new price/,
    );
    expect(field("Check-out")).toHaveValue("2026-12-06");
    expect(api.applyChange).toHaveBeenCalledTimes(1);
  });

  it("holds the confirm button for the wait the change limit asks", async () => {
    api.applyChange.mockResolvedValue(
      refusal("RATE_LIMITED", 429, { retryAfter: 7200 }),
    );
    await toReview();
    press("Confirm change");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The limit for booking changes has been reached. Try again in 2 hours",
    );
    press("Confirm change");
    expect(api.applyChange).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["NETWORK", null],
    ["UNEXPECTED_RESPONSE", 502],
    ["INTERNAL", 500],
  ])(
    "never resends after %s: the booking is read again",
    async (code, status) => {
      api.applyChange.mockResolvedValue(refusal(code, status));
      const { onClose } = await toReview();
      press("Confirm change");
      await vi.waitFor(() =>
        expect(onClose).toHaveBeenCalledWith(
          expect.stringContaining("couldn’t confirm"),
        ),
      );
      expect(api.applyChange).toHaveBeenCalledTimes(1);
    },
  );

  it("shows the contacts when a request is already open", async () => {
    api.applyChange.mockResolvedValue(
      refusal("CHANGE_NOT_ALLOWED", 403, {
        context: { reason: "REQUEST_OPEN" },
      }),
    );
    await toReview();
    press("Confirm change");
    expect(
      await screen.findByText(/A request on this booking is waiting/),
    ).toBeVisible();
  });
});

describe("changing the email", () => {
  async function changeEmail(patch: Partial<Props>) {
    api.applyChange.mockResolvedValue(applied());
    await open(patch);
    await ready();
    type("Email", "new@example.test");
    press("See the new price");
    await heading("Check your changes");
    const reads = api.getGuestReservation.mock.calls.length;
    press("Confirm change");
    await heading("Your booking was changed");
    return reads;
  }

  it("ends the private link, forgets it and does not read with it again", async () => {
    sessionStorage.setItem("rivana.access.manage", token);
    const reads = await changeEmail({});
    expect(screen.getByText(/this private link no longer works/)).toBeVisible();
    expect(sessionStorage.getItem("rivana.access.manage")).toBeNull();
    expect(
      screen.getByRole("link", { name: "My reservations" }),
    ).toHaveAttribute("href", "/reservations/find");
    expect(
      screen.queryByRole("button", { name: "View my booking" }),
    ).toBeNull();
    expect(api.getGuestReservation).toHaveBeenCalledTimes(reads);
  });

  it("takes the booking out of an email session", async () => {
    await changeEmail({
      access: { kind: "SESSION", token, reference: "RR-DEMO0001" },
      emailSession: true,
    });
    expect(screen.getByText(/so it leaves this list/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View my booking" }),
    ).toBeNull();
  });

  it("keeps a WhatsApp session on the booking", async () => {
    await changeEmail({
      access: { kind: "SESSION", token, reference: "RR-DEMO0001" },
    });
    expect(
      screen.getByRole("button", { name: "View my booking" }),
    ).toBeVisible();
  });
});
