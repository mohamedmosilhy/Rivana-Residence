import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import { RecordSiteEvent } from "@/application/analytics";
import { clientAddressFrom } from "@/composition/http";
import type { BrowserSiteEvent } from "@/domain/analytics";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import {
  PrismaAnalyticsSaltStore,
  PrismaSiteEventStore,
} from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";
import { getServerEnv } from "@/lib/env/server";

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

  const client = getPrisma();
  const address = clientAddressFrom(request.headers);
  await new RecordSiteEvent({
    clock: { now: () => new Date() },
    events: new PrismaSiteEventStore(client),
    salts: new PrismaAnalyticsSaltStore(client),
    makeSalt: () => randomBytes(32),
    hashVisitor: (salt, ip, userAgent) =>
      createHmac("sha256", salt)
        .update(JSON.stringify([ip, userAgent]))
        .digest("hex")
        .slice(0, 32),
    reportFailure: () => console.warn("Analytics event recording failed."),
  }).execute({
    ...input,
    headers: request.headers,
    clientAddress: address && isIP(address) ? address : null,
  });
}
