import { afterEach, describe, expect, it, vi } from "vitest";

import { problem } from "@/app/api/v1/_http/problem";
import {
  REQUEST_TIMEOUT_MS,
  createReservation,
  requestQuote,
} from "@/presentation/api-client";

import { booking, quote } from "./calls";
import { answer, resetBrowser, stubFetch } from "./support";

// covers: M10-T1 problem mapping (docs/api/error-model.md).

afterEach(resetBrowser);

const requestId = "request-1";

describe("API problems", () => {
  it("keeps field errors from the server's own serializer", async () => {
    const fieldErrors = { "guest.email": ["Enter an email address."] };
    stubFetch(() =>
      problem("VALIDATION", {
        requestId,
        detail: "Check the form.",
        fieldErrors,
      }),
    );
    expect(await createReservation(booking, "key-12345678")).toEqual({
      ok: false,
      problem: {
        code: "VALIDATION",
        status: 422,
        title: "Some fields need attention",
        detail: "Check the form.",
        fieldErrors,
        requestId,
      },
    });
  });

  it("passes the new quote of a price change through untouched", async () => {
    const context = { quote: { totalMinor: 40_000, anything: ["else"] } };
    stubFetch(() => problem("PRICE_CHANGED", { requestId, context }));
    expect(await createReservation(booking, "key-12345678")).toMatchObject({
      ok: false,
      problem: { code: "PRICE_CHANGED", status: 409, context },
    });
  });

  it.each(["RATE_LIMITED", "TRY_AGAIN"] as const)(
    "reads the wait for %s from Retry-After",
    async (code) => {
      stubFetch(() => problem(code, { requestId, retryAfter: 120 }));
      expect(await requestQuote(quote)).toMatchObject({
        ok: false,
        problem: { code, retryAfter: 120 },
      });
    },
  );

  it("does not retry", async () => {
    const wire = stubFetch(() => problem("TRY_AGAIN", { requestId }));
    await requestQuote(quote);
    expect(wire.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("answers that are not the API's", () => {
  it.each([
    ["a proxy error page", 502, "<html>Bad gateway</html>"],
    ["JSON without a code", 500, { message: "boom" }],
    ["an unreadable success", 200, "not json"],
    ["an empty success", 200, ""],
    ["a list instead of an object", 200, []],
    ["an undocumented success status", 201, {}],
    ["a problem body on a success status", 203, { code: "X", title: "Y" }],
  ])("reports %s as unexpected", async (_name, status, body) => {
    stubFetch(() => answer(status, body));
    expect(await requestQuote(quote)).toEqual({
      ok: false,
      problem: {
        code: "UNEXPECTED_RESPONSE",
        status,
        title: "Something went wrong. Please try again.",
      },
    });
  });

  it("keeps the wait from a proxy's own limit and ignores a date", async () => {
    stubFetch(() => answer(429, "slow down", { "Retry-After": "30" }));
    expect(await requestQuote(quote)).toMatchObject({
      problem: { code: "UNEXPECTED_RESPONSE", retryAfter: 30 },
    });
    stubFetch(() =>
      answer(503, "down", {
        "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT",
      }),
    );
    const result = await requestQuote(quote);
    expect(result.ok || "retryAfter" in result.problem).toBe(false);
  });
});

/** A `fetch` that only ends when its signal is aborted. */
function hangingFetch() {
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("no answer", () => {
  it("reports a network failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await requestQuote(quote)).toMatchObject({
      ok: false,
      problem: { code: "NETWORK", status: null },
    });
  });

  it("reports a connection lost while reading the body", async () => {
    stubFetch(() => {
      const response = answer(200, {});
      vi.spyOn(response, "text").mockRejectedValue(new TypeError("reset"));
      return response;
    });
    expect(await requestQuote(quote)).toMatchObject({
      problem: { code: "NETWORK" },
    });
  });

  it("gives up after the limit, not before", async () => {
    vi.useFakeTimers();
    hangingFetch();
    let settled = false;
    const pending = requestQuote(quote).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ problem: { code: "NETWORK" } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the caller's cancellation apart from a failure", async () => {
    hangingFetch();
    const controller = new AbortController();
    const pending = requestQuote(quote, { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      problem: { code: "ABORTED", status: null },
    });
  });

  it("sends nothing for a request cancelled beforehand", async () => {
    const fetch = hangingFetch();
    expect(
      await requestQuote(quote, { signal: AbortSignal.abort() }),
    ).toMatchObject({ problem: { code: "ABORTED" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves an answered request alone once the limit passes", async () => {
    vi.useFakeTimers();
    const wire = stubFetch();
    await requestQuote(quote);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(wire.sent().init.signal!.aborted).toBe(false);
  });
});
