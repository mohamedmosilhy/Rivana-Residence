import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type {
  QuoteInput,
  requestQuote as realRequestQuote,
} from "@/presentation/api-client/quotes";
import { useSelectionQuote } from "@/presentation/features/booking/selection-quote";

const { requestQuote } = vi.hoisted(() => ({
  requestQuote: vi.fn<typeof realRequestQuote>(),
}));
vi.mock("@/presentation/api-client/quotes", () => ({ requestQuote }));

type QuoteResult = Awaited<ReturnType<typeof realRequestQuote>>;

function pendingQuote() {
  let resolve!: (value: QuoteResult) => void;
  const promise = new Promise<QuoteResult>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  requestQuote.mockReset();
});

it("ignores a late response from an earlier selection and clears the subtotal while checking", async () => {
  vi.useFakeTimers();
  const oldQuote = pendingQuote();
  const currentQuote = pendingQuote();
  requestQuote
    .mockReturnValueOnce(oldQuote.promise)
    .mockReturnValueOnce(currentQuote.promise);
  const stay = { checkIn: "2026-12-04", checkOut: "2026-12-06" };
  const room = { roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } };
  const apartment = {
    roomSlug: "apartment",
    occupancy: { adults: 2, children: 1 },
  };
  const { result, rerender } = renderHook(
    ({ lines }: { lines: QuoteInput["lines"] }) =>
      useSelectionQuote("new-cairo", stay, lines),
    { initialProps: { lines: [room] } },
  );
  await act(async () => vi.runOnlyPendingTimersAsync());
  const oldSignal = requestQuote.mock.calls[0]?.[1]?.signal;
  expect(oldSignal?.aborted).toBe(false);
  rerender({ lines: [room, apartment] });
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.result).toBeNull();
  await act(async () => vi.runOnlyPendingTimersAsync());
  const unavailable: QuoteResult = {
    ok: true,
    status: 200,
    data: {
      available: false,
      unavailableLines: [1],
      bookable: false,
      paymentMethods: [],
      quote: null,
    },
  };
  await act(async () => currentQuote.resolve(unavailable));
  await act(async () =>
    oldQuote.resolve({
      ok: false,
      problem: {
        code: "NETWORK",
        status: null,
        title: "Earlier request failed",
      },
    }),
  );
  expect(result.current.result).toEqual(unavailable);

  rerender({ lines: [] });
  expect(result.current.result).toBeNull();
  await act(async () => vi.runOnlyPendingTimersAsync());
  expect(requestQuote).toHaveBeenCalledTimes(2);
});
