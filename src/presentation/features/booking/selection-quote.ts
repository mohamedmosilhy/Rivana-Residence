import { useEffect, useState } from "react";

import {
  requestQuote,
  type QuoteInput,
} from "@/presentation/api-client/quotes";

type QuoteResult = Awaited<ReturnType<typeof requestQuote>>;
type Lines = QuoteInput["lines"];
type Stay = QuoteInput["stay"];

const QUOTE_DELAY_MS = 250;

export function useSelectionQuote(
  branchSlug: string,
  { checkIn, checkOut }: Stay,
  lines: Lines,
) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{
    lines: Lines;
    attempt: number;
    result: QuoteResult;
  } | null>(null);

  useEffect(() => {
    if (lines.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await requestQuote(
        { branchSlug, stay: { checkIn, checkOut }, lines, services: [] },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setAnswer({ lines, attempt, result });
    }, QUOTE_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [branchSlug, checkIn, checkOut, lines, attempt]);

  return {
    result:
      answer?.lines === lines && answer.attempt === attempt
        ? answer.result
        : null,
    retry: () => setAttempt((previous) => previous + 1),
  };
}

/** Selection handoff to the details page, as specified in 0007. */
export function bookingDetailsHref(
  branchSlug: string,
  { checkIn, checkOut }: Stay,
  lines: Lines,
) {
  const query = new URLSearchParams({
    checkIn,
    checkOut,
    u: lines
      .map(
        ({ roomSlug, occupancy }) =>
          `${roomSlug}.${occupancy.adults}.${occupancy.children}`,
      )
      .join(","),
  });
  return `/${branchSlug}/book/details?${query}`;
}
