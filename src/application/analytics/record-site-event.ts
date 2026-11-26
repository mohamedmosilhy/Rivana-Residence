import "server-only";

import type { Clock } from "@/application/shared/providers";
import {
  deviceFor,
  funnelStepFor,
  omitSiteEvent,
  publicPage,
  trafficLabels,
  type BrowserSiteEvent,
} from "@/domain/analytics";

import type { RecordedSiteEvent, SiteEventStore } from "./ports";
import { visitorHashFor, type VisitorHashing } from "./visitor-hash";

type Dependencies = VisitorHashing &
  Readonly<{
    clock: Clock;
    events: SiteEventStore;
    reportFailure(): void;
  }>;

function lookupOnce(
  cache: Map<string, Promise<string | null>>,
  key: string,
  read: () => Promise<string | null>,
) {
  const cached = cache.get(key);
  if (cached) return cached;
  const result = read();
  cache.set(key, result);
  return result;
}

export class RecordSiteEvent {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    input: Readonly<{
      sessionId: string;
      events: readonly BrowserSiteEvent[];
      clientAddress: string | null;
      headers: Headers;
    }>,
  ) {
    if (omitSiteEvent(input.headers)) return;
    try {
      const occurredAt = this.deps.clock.now();
      const userAgent = input.headers.get("user-agent") ?? "";
      const rows: RecordedSiteEvent[] = [];
      const branches = new Map<string, Promise<string | null>>();
      const rooms = new Map<string, Promise<string | null>>();
      for (const event of input.events) {
        const page = publicPage(event.path);
        if (!page) continue;
        const { branchSlug } = page;
        const branchId = branchSlug
          ? await lookupOnce(branches, branchSlug, () =>
              this.deps.events.branchIdFor(branchSlug),
            )
          : null;
        const roomSlug =
          page.roomSlug ??
          (page.path.startsWith("/{branch}/book") ? event.roomSlug : undefined);
        const roomId =
          branchId && roomSlug
            ? await lookupOnce(rooms, `${branchId}:${roomSlug}`, () =>
                this.deps.events.roomIdFor(branchId, roomSlug),
              )
            : null;
        const path = page.path;
        rows.push({
          occurredAt,
          name: event.name,
          path,
          funnelStep: funnelStepFor({ ...event, path, roomId }),
          bookingStep: event.name === "STEP_VIEW" ? event.step : null,
          branchId,
          roomId,
          sessionId: input.sessionId,
          visitorHash: null,
          device: userAgent ? deviceFor(userAgent) : null,
          ...trafficLabels(event),
        });
      }
      if (rows.length === 0) return;
      const visitorHash = await visitorHashFor(
        this.deps,
        occurredAt,
        input.clientAddress,
        userAgent,
      );
      await this.deps.events.record(
        rows.map((row) => ({ ...row, visitorHash })),
      );
    } catch {
      this.deps.reportFailure();
    }
  }
}
