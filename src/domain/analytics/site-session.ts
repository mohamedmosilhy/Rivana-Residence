import type { BookingStep, SiteEventName } from "./site-event";

type FunnelInput = Readonly<{
  name: SiteEventName;
  path?: string | null;
  roomId?: string | null;
  sessionId?: string | null;
  step?: BookingStep;
}>;

const SERVER_STEPS = {
  QUOTE: 4,
  CODE_REQUESTED: 5,
  PHONE_VERIFIED: 6,
  BOOKING_SUBMITTED: 7,
  BOOKING_CONFIRMED: 8,
  CHECKOUT_REFUSED: null,
} as const;

export function funnelStepFor(event: FunnelInput) {
  switch (event.name) {
    case "PAGE_VIEW":
      return event.path === "/{branch}/stay/[slug]" && event.roomId ? 2 : 1;
    case "STEP_VIEW":
      return event.step === "SEARCH" && event.path === "/{branch}/book"
        ? 3
        : null;
    case "SEARCH":
      return event.sessionId ? 3 : null;
    default:
      return SERVER_STEPS[event.name];
  }
}

type SessionEvent = Readonly<{
  id: bigint;
  occurredAt: Date;
  sessionId: string | null;
  name: SiteEventName;
  path: string | null;
  funnelStep: number | null;
}>;

const SESSION_GAP_MS = 30 * 60_000;

function summarizeSession(events: readonly SessionEvent[]) {
  const steps = new Set<number>();
  let exitPage = null;
  for (const event of events) {
    if (event.funnelStep !== null) steps.add(event.funnelStep);
    if (event.name === "PAGE_VIEW" && event.path !== null) {
      steps.add(1);
      exitPage = event.path;
    }
  }
  const reachedSteps = [...steps].sort((left, right) => left - right);
  const furthestStep = reachedSteps.at(-1) ?? null;
  return {
    reachedSteps,
    furthestStep,
    dropOffStep: furthestStep === 8 ? null : furthestStep,
    exitPage: furthestStep === 8 ? null : exitPage,
  };
}

export function summarizeSiteSessions(events: readonly SessionEvent[]) {
  const byId = new Map<string, SessionEvent[]>();
  for (const event of events) {
    if (!event.sessionId) continue;
    const group = byId.get(event.sessionId);
    if (group) group.push(event);
    else byId.set(event.sessionId, [event]);
  }
  return [...byId].flatMap(([sessionId, group]) => {
    // All events in a batch share a timestamp. The row id keeps their
    // insertion order even when the caller supplies rows in a different order.
    group.sort(
      (left, right) =>
        +left.occurredAt - +right.occurredAt || Number(left.id - right.id),
    );
    const sessions: SessionEvent[][] = [];
    let latest: SessionEvent | undefined;
    for (const event of group) {
      if (!latest || +event.occurredAt - +latest.occurredAt >= SESSION_GAP_MS) {
        sessions.push([]);
      }
      sessions.at(-1)?.push(event);
      latest = event;
    }
    return sessions.map((session) => ({
      sessionId,
      ...summarizeSession(session),
    }));
  });
}
