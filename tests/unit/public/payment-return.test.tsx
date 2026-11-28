import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { saveBookingResult } from "@/presentation/features/booking/booking-result";
import { PaymentReturn } from "@/presentation/features/booking/payment-return";

import { stayTimes } from "./booking-extras-fixtures";

const { getGuestReservation } = vi.hoisted(() => ({
  getGuestReservation: vi.fn(),
}));
vi.mock("@/presentation/api-client/guest", () => ({ getGuestReservation }));

const contact = {
  slug: "new-cairo",
  phone: "+12025550124",
  email: "hotel@example.test",
};
const token = "a".repeat(43);
const created = {
  status: "AWAITING_PAYMENT" as const,
  reference: "DEMO-123",
  manageUrl: `/reservations/manage#t=${token}`,
  checkoutUrl: "https://example.test/checkout",
  holdExpiresAt: "2026-12-01T14:00:00.000Z",
  total: { amountMinor: 12000, currency: "USD" as const },
};
const detail = {
  reference: created.reference,
  status: "AWAITING_PAYMENT",
  stay: { checkIn: "2026-12-01", checkOut: "2026-12-05" },
  branch: { slug: contact.slug, name: "New Cairo" },
  units: [],
  paymentMethod: "ONLINE",
  price: null,
};

beforeEach(() => {
  sessionStorage.clear();
  getGuestReservation.mockReset();
  vi.useFakeTimers({
    toFake: ["Date", "performance", "setTimeout", "clearTimeout"],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const advance = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const heading = (name: string) => screen.getByRole("heading", { name });
const retry = () => screen.getByRole("button", { name: "Check again" });

function open() {
  return render(<PaymentReturn contact={contact} times={stayTimes} />);
}

function savePending(slug = contact.slug) {
  expect(saveBookingResult(slug, created)).toBe(true);
}

function answer(patch: Partial<typeof detail> = {}) {
  return { ok: true, data: { ...detail, ...patch } };
}

it("uses the server status and ignores query strings while checking in the same tab", async () => {
  savePending();
  window.history.replaceState(
    null,
    "",
    "/?status=CONFIRMED&success=true&token=foreign",
  );
  getGuestReservation
    .mockResolvedValueOnce(answer())
    .mockResolvedValueOnce(answer({ status: "CONFIRMED" }));
  open();
  await advance();

  expect(heading("Checking your booking")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull();
  expect(getGuestReservation).toHaveBeenCalledWith(
    { kind: "MANAGE_LINK", token },
    { signal: expect.any(AbortSignal) },
  );

  await advance(2000);
  expect(heading("Confirmed")).toBeVisible();
  expect(screen.getByText(created.reference)).toBeVisible();
  expect(screen.getByText("Online payment")).toBeVisible();
  await advance(120_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(2);
});

it("slows down at 20 seconds and stops at two minutes until the guest checks again", async () => {
  savePending();
  getGuestReservation.mockResolvedValue(answer());
  open();
  await advance(19_999);
  expect(getGuestReservation).toHaveBeenCalledTimes(10);
  await advance(1);
  expect(getGuestReservation).toHaveBeenCalledTimes(11);
  await advance(4999);
  expect(getGuestReservation).toHaveBeenCalledTimes(11);
  await advance(1);
  expect(getGuestReservation).toHaveBeenCalledTimes(12);
  await advance(95_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(30);
  expect(heading("Still waiting for the payment result")).toBeVisible();
  await advance(10000);
  expect(getGuestReservation).toHaveBeenCalledTimes(30);

  getGuestReservation.mockResolvedValue(answer({ status: "CONFIRMED" }));
  fireEvent.click(retry());
  await advance();
  expect(getGuestReservation).toHaveBeenCalledTimes(31);
  expect(heading("Confirmed")).toBeVisible();
});

it("checks one request at a time and aborts a slow final request after two minutes", async () => {
  savePending();
  const times: number[] = [];
  let finalSignal: AbortSignal | undefined;
  getGuestReservation.mockImplementation((_access, { signal }) => {
    times.push(performance.now());
    return new Promise((resolve) => {
      if (performance.now() >= 115_000) {
        finalSignal = signal;
        signal.addEventListener(
          "abort",
          () => resolve(answer({ status: "CONFIRMED" })),
          { once: true },
        );
      } else {
        setTimeout(() => resolve(answer()), 4000);
      }
    });
  });
  open();
  await advance(3999);
  expect(times).toEqual([0]);
  await advance(2001);
  expect(times).toEqual([0, 6000]);
  await advance(114_000);
  expect(finalSignal?.aborted).toBe(true);
  expect(heading("Still waiting for the payment result")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull();
});

it("cancels the scheduled check when leaving the page", async () => {
  savePending();
  getGuestReservation.mockResolvedValue(answer());
  const page = open();
  await advance();
  const signal = getGuestReservation.mock.calls[0]?.[1].signal;
  page.unmount();
  expect(signal.aborted).toBe(true);
  await advance(120_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(1);
});

it("shows failure only after the server ends the hold and links to this branch", async () => {
  savePending();
  getGuestReservation.mockResolvedValue(answer({ status: "PAYMENT_FAILED" }));
  open();
  await advance();
  expect(heading("Payment not completed")).toBeVisible();
  expect(screen.getByRole("link", { name: "Search again" })).toHaveAttribute(
    "href",
    "/new-cairo/book",
  );
  await advance(120_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(1);
});

it.each([
  ["missing", () => {}],
  ["other branch", () => savePending("giza")],
  [
    "pay at hotel",
    () => saveBookingResult(contact.slug, { ...created, status: "CONFIRMED" }),
  ],
  [
    "blocked storage",
    () =>
      vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
        throw new Error("Blocked");
      }),
  ],
])(
  "uses the same neutral fallback for %s tab storage",
  async (_name, prepare) => {
    prepare();
    open();
    await advance();
    expect(heading("Open your booking message")).toBeVisible();
    expect(screen.getByRole("link", { name: contact.email })).toHaveAttribute(
      "href",
      `mailto:${contact.email}`,
    );
    expect(getGuestReservation).not.toHaveBeenCalled();
  },
);

it.each([401, 404])(
  "uses the same neutral fallback for server refusal %s",
  async (status) => {
    savePending();
    getGuestReservation.mockResolvedValue({ ok: false, problem: { status } });
    open();
    await advance();
    expect(heading("Open your booking message")).toBeVisible();
  },
);

it.each([
  ["branch", { branch: { slug: "giza", name: "Giza" } }],
  ["reference", { reference: "DEMO-456" }],
  ["payment method", { paymentMethod: "PAY_AT_HOTEL" }],
])("withholds details when the returned %s differs", async (_name, patch) => {
  savePending();
  getGuestReservation.mockResolvedValue(
    answer({ status: "CONFIRMED", ...patch }),
  );
  open();
  await advance();
  expect(heading("Open your booking message")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull();
  expect(screen.queryByText(created.reference)).toBeNull();
});

it("pauses on a temporary error and respects the server's retry delay", async () => {
  savePending();
  getGuestReservation
    .mockResolvedValueOnce({
      ok: false,
      problem: { status: 429, retryAfter: 5 },
    })
    .mockResolvedValueOnce({ ok: false, problem: { status: null } })
    .mockResolvedValue(answer({ status: "CONFIRMED" }));
  open();
  await advance(4999);
  expect(heading("We couldn’t check your booking")).toBeVisible();
  expect(retry()).toBeDisabled();
  fireEvent.click(retry());
  expect(getGuestReservation).toHaveBeenCalledTimes(1);

  await advance(1);
  expect(retry()).toBeEnabled();
  fireEvent.click(retry());
  await advance();
  expect(heading("We couldn’t check your booking")).toBeVisible();
  await advance(10_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(2);
  fireEvent.click(retry());
  expect(
    screen.getByRole("region", { name: "Booking payment result" }),
  ).toHaveFocus();
  await advance();
  expect(heading("Confirmed")).toBeVisible();
});

it("stops for another reservation status without confirmation or payment failure", async () => {
  savePending();
  getGuestReservation.mockResolvedValue(answer({ status: "CANCELLED" }));
  open();
  await advance();
  expect(heading("Check your current booking status")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Payment not completed" }),
  ).toBeNull();
  await advance(120_000);
  expect(getGuestReservation).toHaveBeenCalledTimes(1);
});
