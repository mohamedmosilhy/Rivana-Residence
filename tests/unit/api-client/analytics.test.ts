import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsEventRequest } from "@/contracts/api/v1/analytics";
import {
  analyticsSessionId,
  sendAnalyticsEvents,
  type AnalyticsEvent,
} from "@/presentation/api-client";

import { answer, resetBrowser, setPrivacy, stubFetch } from "./support";

// covers: M10-T1 visit id helper and API-P11 sender (AC-11, AC-13).

afterEach(resetBrowser);

const KEY = "rivana.analytics.session";
const view: AnalyticsEvent = { name: "PAGE_VIEW", path: "/new-cairo" };

describe("analyticsSessionId", () => {
  it("creates 32 hexadecimal characters once per tab, without a cookie", () => {
    const first = analyticsSessionId();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(analyticsSessionId()).toBe(first);
    expect(window.sessionStorage.getItem(KEY)).toBe(first);
    expect(document.cookie).toBe("");
    window.sessionStorage.clear();
    expect(analyticsSessionId()).not.toBe(first);
  });

  it("replaces a stored value of the wrong shape", () => {
    window.sessionStorage.setItem(KEY, "guest@example.test");
    expect(analyticsSessionId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    ["globalPrivacyControl", true],
    ["doNotTrack", "1"],
  ] as const)("creates nothing and forgets under %s", (name, value) => {
    analyticsSessionId();
    setPrivacy(name, value);
    expect(analyticsSessionId()).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each(["getItem", "setItem"] as const)(
    "gives no id when storage refuses %s",
    (method) => {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
      expect(analyticsSessionId()).toBeNull();
    },
  );

  it("gives no id on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(analyticsSessionId()).toBeNull();
  });

  it("works without randomUUID, as on an insecure origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(10),
    });
    expect(analyticsSessionId()).toBe("0a".repeat(16));
  });
});

function stubBeacon(result: boolean | Error = true) {
  const beacon = vi.fn<(url: string, body: string) => boolean>(() => {
    if (result instanceof Error) throw result;
    return result;
  });
  Object.defineProperty(navigator, "sendBeacon", {
    value: beacon,
    configurable: true,
  });
  return {
    beacon,
    body: (call = 0) =>
      AnalyticsEventRequest.parse(JSON.parse(beacon.mock.calls[call]![1])),
  };
}

describe("sendAnalyticsEvents", () => {
  it("sends a body the contract accepts through the beacon only", () => {
    const wire = stubFetch();
    const { beacon, body } = stubBeacon();
    sendAnalyticsEvents([view]);
    expect(beacon.mock.calls[0]![0]).toBe("/api/v1/analytics/events");
    expect(body()).toEqual({
      sessionId: analyticsSessionId(),
      events: [view],
    });
    expect(wire.fetch).not.toHaveBeenCalled();
  });

  it("strips queries, fragments and the referrer's address", () => {
    const { beacon, body } = stubBeacon();
    sendAnalyticsEvents([
      {
        ...view,
        path: "/reservations/manage#t=secret-token",
        referrer: "https://www.google.com/search?q=private+words#x",
      },
      { ...view, path: "/new-cairo/book?room=a", referrer: "not a url" },
    ]);
    expect(body().events).toEqual([
      {
        name: "PAGE_VIEW",
        path: "/reservations/manage",
        referrer: "https://www.google.com",
      },
      { name: "PAGE_VIEW", path: "/new-cairo/book" },
    ]);
    expect(beacon.mock.calls[0]![1]).not.toMatch(/secret-token|private/);
  });

  it("drops an event P11 would refuse, so the rest still arrive", () => {
    const { beacon, body } = stubBeacon();
    sendAnalyticsEvents([
      { ...view, path: "?room=a" },
      { ...view, path: `/${"a".repeat(200)}` },
      view,
    ]);
    expect(body().events).toEqual([view]);
    sendAnalyticsEvents([{ ...view, path: "#t=secret-token" }]);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("leaves out a referrer that has no web origin", () => {
    const { body } = stubBeacon();
    sendAnalyticsEvents([{ ...view, referrer: "about:blank" }]);
    expect(body().events).toEqual([view]);
  });

  it("splits more than 20 events into several requests", () => {
    const { beacon, body } = stubBeacon();
    sendAnalyticsEvents(Array.from({ length: 41 }, () => view));
    expect(beacon).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((call) => body(call).events.length)).toEqual([
      20, 20, 1,
    ]);
  });

  it.each([
    ["refuses", false],
    ["throws", new TypeError("blocked")],
  ])("falls back to fetch when the beacon %s", (_name, result) => {
    const wire = stubFetch(() => answer(204, null));
    stubBeacon(result);
    sendAnalyticsEvents([view]);
    expect(wire.sent().init).toMatchObject({
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  });

  it("falls back to fetch without a beacon and swallows its failure", async () => {
    const wire = stubFetch(() => Promise.reject(new TypeError("offline")));
    expect(() => sendAnalyticsEvents([view])).not.toThrow();
    expect(wire.fetch).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it("sends nothing under an opt out or for no events", () => {
    const wire = stubFetch();
    const { beacon } = stubBeacon();
    sendAnalyticsEvents([]);
    setPrivacy("globalPrivacyControl", true);
    sendAnalyticsEvents([view]);
    expect(beacon).not.toHaveBeenCalled();
    expect(wire.fetch).not.toHaveBeenCalled();
  });
});
