import { vi } from "vitest";

export type Sent = Readonly<{
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  init: RequestInit;
}>;

export function answer(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(
    status === 204
      ? null
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
    { status, headers },
  );
}

/** Replaces `fetch` and records what the client sent. */
export function stubFetch(
  respond: () => Response | Promise<Response> = () => answer(200, {}),
) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => respond(),
  );
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    sent(call = 0): Sent {
      const [url, init] = fetch.mock.calls[call]!;
      return {
        url,
        init,
        method: init.method!,
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
    },
  };
}

export function setPrivacy(
  name: "globalPrivacyControl" | "doNotTrack",
  value: unknown,
) {
  Object.defineProperty(navigator, name, { value, configurable: true });
}

export function resetBrowser() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
  Reflect.deleteProperty(navigator, "globalPrivacyControl");
  Reflect.deleteProperty(navigator, "doNotTrack");
  Reflect.deleteProperty(navigator, "sendBeacon");
}
