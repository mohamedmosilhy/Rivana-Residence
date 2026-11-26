import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { after } from "next/server";

import {
  RecordFunnelStep,
  RecordSiteEvent,
  type FunnelStepInput,
} from "@/application/analytics";
import { clientAddressFrom } from "@/composition/http";
import {
  omitSiteEvent,
  parseSessionId,
  type BrowserSiteEvent,
} from "@/domain/analytics";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import {
  PrismaAnalyticsSaltStore,
  PrismaSiteEventStore,
} from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";
import { getServerEnv } from "@/lib/env/server";

/** The optional request header on P5, P6, P9 and P10 (spec 0007). */
const SESSION_HEADER = "rivana-analytics-session";

function trustedAddress(headers: Headers) {
  const address = clientAddressFrom(headers);
  return address && isIP(address) ? address : null;
}

function dependencies() {
  const client = getPrisma();
  return {
    events: new PrismaSiteEventStore(client),
    salts: new PrismaAnalyticsSaltStore(client),
    makeSalt: () => randomBytes(32),
    hashVisitor: (salt: Uint8Array, ip: string, userAgent: string) =>
      createHmac("sha256", salt)
        .update(JSON.stringify([ip, userAgent]))
        .digest("hex")
        .slice(0, 32),
    reportFailure,
  };
}

function reportFailure() {
  console.warn("Analytics event recording failed.");
}

export async function recordSiteEvent(
  input: Readonly<{ sessionId: string; events: readonly BrowserSiteEvent[] }>,
  request: Request,
) {
  const env = getServerEnv();
  if (!env.ANALYTICS_ENABLED) return;

  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const sameOrigin =
    site !== null
      ? site === "same-origin"
      : origin === new URL(env.APP_URL).origin;
  if (!sameOrigin) return;

  await new RecordSiteEvent({
    ...dependencies(),
    clock: { now: () => new Date() },
  }).execute({
    ...input,
    headers: request.headers,
    clientAddress: trustedAddress(request.headers),
  });
}

/** The visit a browser request named, or null. A bad value is ignored. */
export function analyticsSessionFrom(headers: Headers) {
  return parseSessionId(headers.get(SESSION_HEADER)?.toLowerCase());
}

/**
 * The visit to keep on an online booking and to record its steps under. Null
 * when tracking is off or the guest opted out, so nothing is stored at all.
 */
export function bookingAnalyticsSession(value: unknown, headers: Headers) {
  try {
    return getServerEnv().ANALYTICS_ENABLED && !omitSiteEvent(headers)
      ? parseSessionId(value)
      : null;
  } catch {
    reportFailure();
    return null;
  }
}

/** After the response when a request is open; a command line job waits. */
async function afterResponse(work: () => Promise<void>) {
  try {
    after(work);
  } catch {
    await work();
  }
}

/**
 * Records server side booking steps. Call it after the use case returned. It
 * never throws and never delays a response.
 */
export async function recordFunnelSteps(
  input: Readonly<{
    sessionId: string | null;
    steps: FunnelStepInput["steps"];
    /** The browser request's headers; null for a callback or a job. */
    headers: Headers | null;
    /** Defaults to now. A payment confirmation passes its own time. */
    occurredAt?: Date;
  }>,
) {
  try {
    if (!getServerEnv().ANALYTICS_ENABLED) return;
    const { sessionId, steps, headers } = input;
    const occurredAt = input.occurredAt ?? new Date();
    const request = headers
      ? {
          headers: new Headers(headers),
          clientAddress: trustedAddress(headers),
        }
      : null;
    await afterResponse(async () => {
      try {
        await new RecordFunnelStep(dependencies()).execute({
          sessionId,
          steps,
          occurredAt,
          request,
        });
      } catch {
        reportFailure();
      }
    });
  } catch {
    reportFailure();
  }
}
