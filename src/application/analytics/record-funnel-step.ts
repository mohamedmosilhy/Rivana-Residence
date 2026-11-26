import "server-only";

import {
  deviceFor,
  funnelStepFor,
  omitSiteEvent,
  REPEAT_SKIPPED_STEPS,
  REPEAT_WINDOW_MS,
  storedWithoutSession,
  type FunnelStep,
} from "@/domain/analytics";

import type { RecordedSiteEvent, SiteEventStore } from "./ports";
import { visitorHashFor, type VisitorHashing } from "./visitor-hash";

type Dependencies = VisitorHashing &
  Readonly<{
    events: SiteEventStore;
    reportFailure(): void;
  }>;

export type FunnelStepInput = Readonly<{
  /** Read after the booking work is done. A step may need one more lookup. */
  steps(): readonly FunnelStep[] | Promise<readonly FunnelStep[]>;
  sessionId: string | null;
  /** When the booking use case returned, even if recording runs later. */
  occurredAt: Date;
  /** The browser request, or null for a payment callback or a job. */
  request: Readonly<{
    headers: Headers;
    clientAddress: string | null;
  }> | null;
}>;

const date = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * Stores the booking steps the server saw (ADR 029). It runs after a use case
 * returned, outside its transaction, and never fails its caller.
 */
export class RecordFunnelStep {
  constructor(private readonly deps: Dependencies) {}

  async execute(input: FunnelStepInput) {
    const { request, sessionId, occurredAt } = input;
    try {
      if (request && omitSiteEvent(request.headers)) return;
      const steps = (await input.steps()).filter(
        (step) => sessionId !== null || storedWithoutSession(step),
      );
      const userAgent = request?.headers.get("user-agent") ?? "";
      const rows: RecordedSiteEvent[] = [];
      for (const step of steps) {
        const branchId =
          step.branchId ??
          (step.branchSlug
            ? await this.deps.events.branchIdFor(step.branchSlug)
            : null);
        const roomId = step.roomId ?? null;
        if (
          sessionId !== null &&
          REPEAT_SKIPPED_STEPS.has(step.name) &&
          (await this.deps.events.recordedSince(
            { sessionId, name: step.name, branchId, roomId },
            new Date(occurredAt.getTime() - REPEAT_WINDOW_MS),
          ))
        )
          continue;
        rows.push({
          occurredAt,
          name: step.name,
          path: null,
          funnelStep: funnelStepFor({ name: step.name, sessionId }),
          bookingStep: null,
          branchId,
          roomId,
          sessionId,
          visitorHash: null,
          device: userAgent ? deviceFor(userAgent) : null,
          referrerHost: null,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          outcome: step.outcome ?? null,
          stayCheckIn: step.stay ? date(step.stay.checkIn) : null,
          stayCheckOut: step.stay ? date(step.stay.checkOut) : null,
        });
      }
      if (rows.length === 0) return;
      const visitorHash = await visitorHashFor(
        this.deps,
        occurredAt,
        request?.clientAddress ?? null,
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
