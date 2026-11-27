import { useEffect, useEffectEvent, useState } from "react";

import {
  requestQuote,
  type QuoteInput,
} from "@/presentation/api-client/quotes";

export type QuoteResult = Awaited<ReturnType<typeof requestQuote>>;

const QUOTE_DELAY_MS = 250;

/**
 * The booking pages' one price check (API-P6): it waits for edits to settle,
 * cancels the request a newer edit replaced, and reports only the answer to the
 * current request. Pass a memoized input, or null when nothing needs a price.
 */
export function useDebouncedQuote(
  input: QuoteInput | null,
  onAnswer?: (result: QuoteResult, sent: QuoteInput) => void,
) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{
    input: QuoteInput;
    attempt: number;
    result: QuoteResult;
  } | null>(null);
  const report = useEffectEvent((result: QuoteResult, sent: QuoteInput) =>
    onAnswer?.(result, sent),
  );

  useEffect(() => {
    if (!input) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await requestQuote(input, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAnswer({ input, attempt, result });
      report(result, input);
    }, QUOTE_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, attempt]);

  return {
    result:
      input && answer?.input === input && answer.attempt === attempt
        ? answer.result
        : null,
    retry: () => setAttempt((previous) => previous + 1),
  };
}
