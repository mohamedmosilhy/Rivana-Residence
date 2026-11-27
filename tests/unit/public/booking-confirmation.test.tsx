import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BookingConfirmation } from "@/presentation/features/booking/booking-confirmation";
import {
  keepMatchingResult,
  readBookingResult,
  saveBookingResult,
} from "@/presentation/features/booking/booking-result";

const { getGuestReservation } = vi.hoisted(() => ({
  getGuestReservation: vi.fn(),
}));
vi.mock("@/presentation/api-client/guest", () => ({ getGuestReservation }));
const contact = { slug: "new-cairo", phone: null, email: null };
const token = "a".repeat(43);
const created = {
  status: "CONFIRMED" as const,
  reference: "R-123",
  manageUrl: `/reservations/manage#t=${token}`,
  total: { amountMinor: 12000, currency: "USD" as const },
};
const detail = {
  reference: created.reference,
  status: "CONFIRMED",
  stay: { checkIn: "2026-12-01", checkOut: "2026-12-05" },
  branch: contact,
  units: [],
  paymentMethod: "PAY_AT_HOTEL",
  price: null,
};
beforeEach(() => {
  sessionStorage.clear();
  getGuestReservation.mockReset();
});

it("keeps the one-time token scoped to the booking branch and rejects malformed or missing storage", () => {
  expect(saveBookingResult(contact.slug, created)).toBe(true);
  expect(readBookingResult("giza")).toBeNull();
  expect(readBookingResult(contact.slug)).toEqual({
    branchSlug: contact.slug,
    reference: created.reference,
    status: "CONFIRMED",
    token,
  });
  expect(
    saveBookingResult(contact.slug, { ...created, manageUrl: "/invalid" }),
  ).toBe(false);
  expect(readBookingResult(contact.slug)).toBeNull();
  sessionStorage.setItem("rivana.booking.result", "{");
  expect(readBookingResult(contact.slug)).toBeNull();
  const storage = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Blocked");
    });
  try {
    expect(saveBookingResult(contact.slug, created)).toBe(false);
  } finally {
    storage.mockRestore();
  }
});
it("asks for the booking message on a direct visit", async () => {
  render(<BookingConfirmation contact={contact} />);
  expect(await screen.findByText("Open your booking message")).toBeVisible();
  expect(getGuestReservation).not.toHaveBeenCalled();
});
it.each([
  ["branch", { branch: { slug: "giza" } }],
  ["reference", { reference: "R-456" }],
])(
  "withholds another booking's details after a %s mismatch",
  async (_label, patch) => {
    saveBookingResult(contact.slug, created);
    getGuestReservation.mockResolvedValue({
      ok: true,
      data: { ...detail, ...patch },
    });
    render(<BookingConfirmation contact={contact} />);
    expect(await screen.findByText("Open your booking message")).toBeVisible();
    expect(screen.queryByText(created.reference)).toBeNull();
  },
);
it.each(["AWAITING_PAYMENT", "PAYMENT_FAILED", "CANCELLED"])(
  "uses the current server status, including %s",
  async (status) => {
    saveBookingResult(contact.slug, created);
    getGuestReservation.mockResolvedValue({
      ok: true,
      data: { ...detail, status },
    });
    render(<BookingConfirmation contact={contact} />);
    expect(await screen.findByText(created.reference)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull();
  },
);
it("can retry a failed read, and displays confirmation only after G1 succeeds", async () => {
  saveBookingResult(contact.slug, created);
  getGuestReservation
    .mockResolvedValueOnce({ ok: false, problem: { status: 503 } })
    .mockResolvedValueOnce({ ok: true, data: detail });
  render(<BookingConfirmation contact={contact} />);
  fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
  expect(
    await screen.findByRole("heading", { name: "Confirmed" }),
  ).toBeVisible();
  expect(getGuestReservation).toHaveBeenCalledWith(
    { kind: "MANAGE_LINK", token },
    expect.anything(),
  );
  expect(document.documentElement.outerHTML).not.toContain(token);
});
it("an expired link displays recovery without disclosing the reference", async () => {
  saveBookingResult(contact.slug, created);
  getGuestReservation.mockResolvedValue({
    ok: false,
    problem: { status: 401 },
  });
  render(<BookingConfirmation contact={contact} />);
  expect(await screen.findByText("Open your booking message")).toBeVisible();
  expect(screen.queryByText(created.reference)).toBeNull();
});

it("keeps only a matching earlier manage token on replay", () => {
  saveBookingResult(contact.slug, created);
  keepMatchingResult(contact.slug, created.reference);
  expect(readBookingResult(contact.slug)?.token).toBe(token);
  keepMatchingResult(contact.slug, "DIFFERENT");
  expect(readBookingResult(contact.slug)).toBeNull();
});

it("shows every server amount, so the confirmed total can be followed", async () => {
  saveBookingResult(contact.slug, created);
  const usd = (amountMinor: number) => ({ currency: "USD", amountMinor });
  getGuestReservation.mockResolvedValue({
    ok: true,
    data: {
      ...detail,
      units: [
        {
          roomName: "Deluxe Double",
          occupancy: { adults: 2, children: 1 },
          subtotal: usd(40000),
        },
      ],
      price: {
        currency: "USD",
        subtotalMinor: 46000,
        discountMinor: 4600,
        vatRateBasisPoints: 1500,
        vatMinor: 6210,
        totalMinor: 47610,
        services: [
          {
            kind: "AIRPORT_TRANSFER",
            amountMinor: 6000,
            vehicles: 2,
            details: "MS 985",
          },
        ],
      },
    },
  });
  render(<BookingConfirmation contact={contact} />);
  const rows = await screen.findAllByRole("row");
  expect(rows.map((row) => row.textContent)).toEqual([
    "Deluxe Double2 adults, 1 child$400.00",
    "Airport transfer2 cars · MS 985$60.00",
    "Subtotal$460.00",
    "Discount−$46.00",
    "VAT (15%)$62.10",
    "Total$476.10",
  ]);
});
