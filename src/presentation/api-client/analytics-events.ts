import type { z } from "zod";

import type { AnalyticsEventRequest } from "@/contracts/api/v1/analytics";

import { analyticsSessionId } from "./analytics-session";

// API-P11. Sending only: when to send is the beacon's job (M10-T10). It stays
// apart from the request module so public pages load as little as possible.

export type AnalyticsEvent = z.input<
  typeof AnalyticsEventRequest
>["events"][number];

const URL_P11 = "/api/v1/analytics/events";
/** The most events one request may carry. */
const BATCH = 20;

/** The last guard: no query, fragment or full referrer address ever leaves. */
function withoutAddressSecrets(event: AnalyticsEvent): AnalyticsEvent {
  const { referrer, ...rest } = event;
  let origin: string | undefined;
  try {
    if (referrer) origin = new URL(referrer).origin;
  } catch {
    origin = undefined;
  }
  return {
    ...rest,
    path: event.path.split(/[?#]/, 1)[0]!,
    // Addresses such as `about:blank` have the origin "null".
    ...(origin && origin !== "null" ? { referrer: origin } : {}),
  };
}

/** P11 refuses a whole request for one bad path. */
const hasUsablePath = ({ path }: AnalyticsEvent) =>
  path.startsWith("/") && path.length <= 200;

function deliver(body: string) {
  try {
    // A string beacon travels as `text/plain`, which P11 accepts.
    if (navigator.sendBeacon?.(URL_P11, body)) return;
  } catch {
    // Fall through to `fetch`.
  }
  void fetch(URL_P11, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
    keepalive: true,
    cache: "no-store",
    credentials: "same-origin",
  }).catch(() => undefined);
}

/** Fire and forget. It never throws and never reports a failure. */
export function sendAnalyticsEvents(events: readonly AnalyticsEvent[]): void {
  try {
    const sessionId = analyticsSessionId();
    if (!sessionId) return;
    const usable = events.map(withoutAddressSecrets).filter(hasUsablePath);
    for (let start = 0; start < usable.length; start += BATCH) {
      deliver(
        JSON.stringify({
          sessionId,
          events: usable.slice(start, start + BATCH),
        }),
      );
    }
  } catch {
    // Tracking never disturbs a page.
  }
}
