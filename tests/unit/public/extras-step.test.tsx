import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { requestQuote as realQuote } from "@/presentation/api-client/quotes";
import type { ApiProblem } from "@/presentation/api-client/result";
import { initialExtras } from "@/presentation/features/booking/extras-state";
import { ExtrasStep } from "@/presentation/features/booking/extras-step";

import {
  answerQuote,
  bookingQuote,
  bookingServices,
  usd,
} from "./booking-extras-fixtures";

const { requestQuote } = vi.hoisted(() => ({
  requestQuote: vi.fn<typeof realQuote>(),
}));
vi.mock("@/presentation/api-client/quotes", () => ({ requestQuote }));

const selection = {
  branchSlug: "new-cairo",
  stay: { checkIn: "2026-12-03", checkOut: "2026-12-05" },
  lines: [{ roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } }],
};
const onContinue = vi.fn();

function Harness({ emailVerified = false }: { emailVerified?: boolean }) {
  const [value, setValue] = useState(() =>
    initialExtras(bookingQuote(), ["PAY_AT_HOTEL", "ONLINE"]),
  );
  return (
    <ExtrasStep
      selection={selection}
      services={bookingServices}
      maxVehicles={3}
      value={value}
      emailVerified={emailVerified}
      contact={{ slug: "new-cairo", phone: "+20 2 1234 5678", email: null }}
      onChange={setValue}
      onBack={() => {}}
      onEdit={() => {}}
      onContinue={onContinue}
    />
  );
}

const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const button = (name: string) => screen.getByRole("button", { name });
const coupon = () => screen.getByLabelText("Coupon code (optional)");
const proceed = () => button("Continue to payment");
const click = (element: HTMLElement) => act(() => fireEvent.click(element));
const type = (element: HTMLElement, value: string) =>
  act(() => fireEvent.change(element, { target: { value } }));
/** The wait for edits to settle, then the answer. */
const answer = () => act(() => vi.advanceTimersByTimeAsync(250));
const apply = async (code: string) => {
  await type(coupon(), code);
  await click(button("Apply"));
  await answer();
};
const sent = () => requestQuote.mock.lastCall![0];
const refused = (
  code: ApiProblem["code"],
  extra: Partial<ApiProblem> = {},
) => ({
  ok: false as const,
  problem: { code, status: 422, title: "Refused", ...extra },
});

beforeEach(() => {
  vi.useFakeTimers();
  requestQuote.mockImplementation(async (input) => answerQuote(input));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("chooses nothing in advance and asks for no price until the guest does", async () => {
  render(<Harness />);
  expect(box(/Breakfast/)).not.toBeChecked();
  expect(box(/Airport transfer/)).not.toBeChecked();
  expect(screen.queryByLabelText("Cars")).toBeNull();
  await answer();
  expect(requestQuote).not.toHaveBeenCalled();
  expect(screen.getByText("$184.00")).toBeVisible();
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it("holds Continue and hides the old total until the new price arrives", async () => {
  render(<Harness />);
  await click(box(/Breakfast/));
  expect(screen.getByText("Updating price…")).toBeVisible();
  expect(screen.queryByText(/Total with VAT/)).toBeNull();
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  await click(proceed());
  expect(onContinue).not.toHaveBeenCalled();
  await answer();
  expect(sent()).toStrictEqual({ ...selection, services: ["BREAKFAST"] });
  expect(screen.getByText("$185.00")).toBeVisible();
  await click(proceed());
  expect(onContinue).toHaveBeenCalledTimes(1);
});

it("removes a service and prices the choice without it", async () => {
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  await click(box(/Breakfast/));
  await answer();
  expect(sent().services).toStrictEqual([]);
  expect(screen.getByText("$184.00")).toBeVisible();
});

it("sends the cars with the price check, and never the flight details", async () => {
  render(<Harness />);
  await click(box(/Airport transfer/));
  await answer();
  expect(sent().services).toStrictEqual([
    { kind: "AIRPORT_TRANSFER", vehicles: 1 },
  ]);
  await type(screen.getByLabelText("Cars"), "3");
  await answer();
  expect(sent().services).toStrictEqual([
    { kind: "AIRPORT_TRANSFER", vehicles: 3 },
  ]);
  const calls = requestQuote.mock.calls.length;
  await type(screen.getByLabelText(/Flight number/), "MS 985, 14:30");
  await answer();
  expect(requestQuote).toHaveBeenCalledTimes(calls);
  expect(proceed()).not.toHaveAttribute("aria-disabled");
  expect(JSON.stringify(requestQuote.mock.calls)).not.toContain("MS 985");
});

it("shows only the answer to the latest choice", async () => {
  let release!: () => void;
  requestQuote.mockImplementationOnce(
    (input) =>
      new Promise((resolve) => {
        release = () => resolve(answerQuote(input, { total: usd(1) }));
      }),
  );
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  const first = requestQuote.mock.calls[0]![1]!.signal!;
  await click(box(/Airport transfer/));
  expect(first.aborted).toBe(true);
  await answer();
  await act(async () => release());
  expect(screen.getByText("$186.00")).toBeVisible();
  expect(screen.queryByText("$0.01")).toBeNull();
});

it("applies a code with Enter or Apply, in the server's spelling, once", async () => {
  render(<Harness />);
  await type(coupon(), " save10 ");
  await act(async () => fireEvent.submit(coupon().closest("form")!));
  expect(button("Checking…")).toHaveAttribute("aria-disabled", "true");
  await answer();
  expect(sent().couponCode).toBe("save10");
  expect(screen.getByText("Code SAVE10 applied")).toBeVisible();
  expect(coupon()).toHaveValue("");
  await answer();
  expect(requestQuote).toHaveBeenCalledTimes(1);
  // The same code again changes nothing.
  await apply("Save10");
  expect(requestQuote).toHaveBeenCalledTimes(1);
});

it("removes an applied code and returns to the price without it", async () => {
  render(<Harness />);
  await apply("save10");
  await click(button("Remove coupon SAVE10"));
  expect(coupon()).toHaveFocus();
  await answer();
  expect(sent()).not.toHaveProperty("couponCode");
  expect(screen.getByText("$184.00")).toBeVisible();
});

it("asks for a code before sending an empty field", async () => {
  render(<Harness />);
  await click(button("Apply"));
  await answer();
  expect(coupon()).toHaveAccessibleDescription("Enter a coupon code.");
  expect(requestQuote).not.toHaveBeenCalled();
});

it.each([
  ["NOT_FOUND", "We don’t recognise this code. Check the spelling."],
  ["INACTIVE", "This code is not active."],
  ["NOT_YET_VALID", "This code cannot be used yet."],
  ["EXPIRED", "This code has expired."],
  ["WRONG_BRANCH", "This code cannot be used at this branch."],
  ["LIMIT_REACHED", "This code has been used the maximum number of times."],
  [
    "PHONE_LIMIT_REACHED",
    "You have already used this code the maximum number of times.",
  ],
  ["SOMETHING_NEW", "This code cannot be used for this booking."],
  ["constructor", "This code cannot be used for this booking."],
])(
  "explains a %s refusal and leaves the total unchanged",
  async (reason, words) => {
    requestQuote.mockResolvedValue(
      refused("COUPON_INVALID", { context: { reason } }),
    );
    render(<Harness />);
    await apply("bad-code");
    expect(screen.getByRole("alert")).toHaveTextContent(words);
    expect(coupon()).toHaveAccessibleDescription(words);
    expect(coupon()).toHaveValue("bad-code");
    expect(screen.getByText("$184.00")).toBeVisible();
    // Nothing else to ask: the held price answers the choice again.
    await answer();
    expect(requestQuote).toHaveBeenCalledTimes(1);
  },
);

it("keeps the earlier code when another is refused", async () => {
  render(<Harness />);
  await apply("save10");
  requestQuote.mockResolvedValueOnce(
    refused("COUPON_INVALID", { context: { reason: "EXPIRED" } }),
  );
  await apply("old");
  expect(screen.getByText("Code SAVE10 applied")).toBeVisible();
  expect(coupon()).toHaveAccessibleDescription("This code has expired.");
  expect(screen.getByText("$183.99")).toBeVisible();
  expect(requestQuote).toHaveBeenCalledTimes(2);
});

it("drops a code that stops working, says why, and prices without it", async () => {
  render(<Harness />);
  await apply("save10");
  requestQuote.mockResolvedValueOnce(
    refused("COUPON_INVALID", { context: { reason: "LIMIT_REACHED" } }),
  );
  await click(box(/Breakfast/));
  await answer();
  expect(
    screen.getByText(
      "The code SAVE10 was removed. This code has been used the maximum number of times.",
    ),
  ).toBeVisible();
  await answer();
  expect(sent()).toStrictEqual({ ...selection, services: ["BREAKFAST"] });
  expect(screen.getByText("$185.00")).toBeVisible();
});

it("removes a service the branch switched off and prices the rest", async () => {
  requestQuote.mockResolvedValueOnce(
    refused("SERVICE_UNAVAILABLE", { context: { kind: "BREAKFAST" } }),
  );
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  expect(
    screen.getByText("Breakfast is no longer available, so we removed it."),
  ).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: /Breakfast/ })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Extras and coupon" }),
  ).toHaveFocus();
  expect(screen.getByText("$184.00")).toBeVisible();
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it("offers another check when the service refused was never asked for", async () => {
  requestQuote.mockResolvedValueOnce(
    refused("SERVICE_UNAVAILABLE", { context: { kind: "AIRPORT_TRANSFER" } }),
  );
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  expect(box(/Airport transfer/)).toBeVisible();
  await click(button("Check again"));
  await answer();
  expect(screen.getByText("$185.00")).toBeVisible();
});

it("shows the server's car limit beside Cars until the guest picks again", async () => {
  render(<Harness />);
  await click(box(/Airport transfer/));
  await answer();
  requestQuote.mockResolvedValueOnce(
    refused("VALIDATION", {
      fieldErrors: { "services.0.vehicles": ["Choose from 1 to 2 cars."] },
    }),
  );
  await type(screen.getByLabelText("Cars"), "3");
  await answer();
  expect(screen.getByLabelText("Cars")).toHaveAccessibleDescription(
    "Choose from 1 to 2 cars.",
  );
  // The page never changes the guest's number by itself.
  expect(screen.getByLabelText("Cars")).toHaveValue("3");
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
  await type(screen.getByLabelText("Cars"), "2");
  await answer();
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it.each(["NETWORK", "INTERNAL", "UNEXPECTED_RESPONSE"] as const)(
  "keeps the choices after %s and checks again on request",
  async (code) => {
    requestQuote.mockResolvedValueOnce(refused(code));
    render(<Harness />);
    await click(box(/Breakfast/));
    await answer();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t check the price.",
    );
    expect(box(/Breakfast/)).toBeChecked();
    expect(proceed()).toHaveAttribute("aria-disabled", "true");
    // No retry on its own.
    await answer();
    expect(requestQuote).toHaveBeenCalledTimes(1);
    await click(button("Check again"));
    await answer();
    expect(screen.getByText("$185.00")).toBeVisible();
  },
);

it("shows the wait, and offers to drop the code, when checks are refused", async () => {
  render(<Harness />);
  await apply("save10");
  requestQuote.mockResolvedValueOnce(
    refused("RATE_LIMITED", { retryAfter: 600 }),
  );
  await click(box(/Breakfast/));
  await answer();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Too many price checks. Try again in 10 minutes.",
  );
  await click(button("Remove coupon"));
  await answer();
  expect(sent()).toStrictEqual({ ...selection, services: ["BREAKFAST"] });
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it("offers no coupon removal when no code was sent", async () => {
  requestQuote.mockResolvedValueOnce(refused("RATE_LIMITED"));
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  expect(screen.queryByRole("button", { name: "Remove coupon" })).toBeNull();
});

it("lets a guest drop a code that was never answered", async () => {
  requestQuote.mockResolvedValueOnce(refused("NETWORK"));
  render(<Harness />);
  await apply("save10");
  expect(button("Apply")).not.toHaveAttribute("aria-disabled");
  await type(coupon(), "");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it.each([
  [
    "sold out",
    { available: false, bookable: false, quote: null },
    "Your selection is no longer available.",
    "notice=unavailable",
  ],
  [
    "unreadable",
    null,
    "We can no longer price this selection.",
    "notice=selection",
  ],
])(
  "sends a %s selection back to the results",
  async (_name, data, words, notice) => {
    requestQuote.mockResolvedValueOnce(
      data
        ? {
            ok: true,
            status: 200,
            data: { ...data, unavailableLines: [0], paymentMethods: [] },
          }
        : refused("VALIDATION", {
            fieldErrors: { "stay.checkIn": ["Past."] },
          }),
    );
    render(<Harness />);
    await click(box(/Breakfast/));
    await answer();
    expect(screen.getByRole("alert")).toHaveTextContent(words);
    expect(
      screen.getByRole("link", { name: "Back to the results" }),
    ).toHaveAttribute("href", expect.stringContaining(notice));
    expect(proceed()).toHaveAttribute("aria-disabled", "true");
  },
);

it("shows the hotel contact when online booking closes", async () => {
  requestQuote.mockImplementationOnce(async (input) => {
    const result = answerQuote(input);
    return result.ok
      ? { ...result, data: { ...result.data, bookable: false } }
      : result;
  });
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Online booking is unavailable.",
  );
  expect(proceed()).toHaveAttribute("aria-disabled", "true");
});

it.each([
  [true, true],
  [false, false],
])(
  "email verified %s: a total that cannot be paid online blocks Continue %s",
  async (emailVerified, blocked) => {
    requestQuote.mockImplementation(async (input) =>
      answerQuote(input, { total: usd(0) }, ["PAY_AT_HOTEL"]),
    );
    render(<Harness emailVerified={emailVerified} />);
    await apply("free");
    expect(
      screen.queryByText(/this total cannot be paid online/) !== null,
    ).toBe(blocked);
    await click(proceed());
    expect(onContinue).toHaveBeenCalledTimes(blocked ? 0 : 1);
  },
);

it("tells an email guest without a coupon to contact the hotel only", async () => {
  requestQuote.mockImplementation(async (input) =>
    answerQuote(input, {}, ["PAY_AT_HOTEL"]),
  );
  render(<Harness emailVerified />);
  await click(box(/Breakfast/));
  await answer();
  const warning = screen.getByText(/this total cannot be paid online/);
  expect(warning).toHaveTextContent("Contact the hotel.");
  expect(warning).not.toHaveTextContent("coupon");
});

it("shows a refused code's reason again without asking again", async () => {
  requestQuote.mockResolvedValueOnce(
    refused("COUPON_INVALID", { context: { reason: "EXPIRED" } }),
  );
  render(<Harness />);
  await apply("old");
  await click(proceed());
  expect(coupon()).toHaveAccessibleDescription("Apply the code or clear it.");
  await click(button("Apply"));
  await answer();
  expect(coupon()).toHaveAccessibleDescription("This code has expired.");
  expect(requestQuote).toHaveBeenCalledTimes(1);
  // Typing again, even the same code, is a new question.
  await apply("older");
  await apply("old");
  expect(requestQuote).toHaveBeenCalledTimes(3);
});

it("shows the hotel contact when the branch can no longer be found", async () => {
  requestQuote.mockResolvedValueOnce(refused("NOT_FOUND", { status: 404 }));
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Online booking is unavailable.",
  );
});

it("drops both codes when checks are refused while trying a second one", async () => {
  render(<Harness />);
  await apply("save10");
  requestQuote.mockResolvedValueOnce(refused("RATE_LIMITED"));
  await apply("other");
  expect(screen.getByText("Code SAVE10 applied")).toBeVisible();
  await click(button("Remove coupon"));
  await answer();
  expect(sent()).not.toHaveProperty("couponCode");
  expect(screen.queryByText(/Code SAVE10 applied/)).toBeNull();
  expect(proceed()).not.toHaveAttribute("aria-disabled");
});

it("keeps a code being tried when a service is withdrawn", async () => {
  render(<Harness />);
  await click(box(/Breakfast/));
  await answer();
  requestQuote.mockResolvedValueOnce(
    refused("SERVICE_UNAVAILABLE", { context: { kind: "BREAKFAST" } }),
  );
  await apply("save10");
  await answer();
  expect(sent()).toStrictEqual({
    ...selection,
    services: [],
    couponCode: "save10",
  });
  expect(screen.getByText("Code SAVE10 applied")).toBeVisible();
});

it("keeps both messages when a code and then a service are removed", async () => {
  render(<Harness />);
  await apply("save10");
  requestQuote
    .mockResolvedValueOnce(
      refused("COUPON_INVALID", { context: { reason: "EXPIRED" } }),
    )
    .mockResolvedValueOnce(
      refused("SERVICE_UNAVAILABLE", { context: { kind: "BREAKFAST" } }),
    );
  await click(box(/Breakfast/));
  await answer();
  await answer();
  expect(
    screen.getByText(
      "The code SAVE10 was removed. This code has expired. Breakfast is no longer available, so we removed it.",
    ),
  ).toBeVisible();
});

it("will not leave a typed code behind without a word", async () => {
  render(<Harness />);
  await type(coupon(), "save10");
  await click(proceed());
  expect(onContinue).not.toHaveBeenCalled();
  expect(coupon()).toHaveFocus();
  expect(coupon()).toHaveAccessibleDescription("Apply the code or clear it.");
  await type(coupon(), "  ");
  await click(proceed());
  expect(onContinue).toHaveBeenCalledTimes(1);
});

it("refuses hidden characters in the flight details", async () => {
  render(<Harness />);
  await click(box(/Airport transfer/));
  await answer();
  const flight = screen.getByLabelText(/Flight number/);
  expect(flight).toHaveAttribute("maxlength", "300");
  await type(flight, "MS 985‏");
  await click(proceed());
  expect(onContinue).not.toHaveBeenCalled();
  expect(flight).toHaveFocus();
  expect(flight).toHaveAttribute("aria-invalid", "true");
  await type(flight, "MS 985");
  await click(proceed());
  expect(onContinue).toHaveBeenCalledTimes(1);
});
