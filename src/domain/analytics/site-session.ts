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

export type SessionEvent = Readonly<{
  id: bigint;
  occurredAt: Date;
  sessionId: string | null;
  name: SiteEventName;
  path: string | null;
  funnelStep: number | null;
}>;

const SESSION_GAP_MS = 30 * 60_000;

export function summarizeSession(events: readonly SessionEvent[]) {
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

/**
 * Splits events into visits: one session id, cut at activity gaps of 30
 * minutes or more. A booking confirmation is the server's answer to a payment,
 * not visitor activity: it joins the visit before it however late it arrives,
 * and never keeps a visit open. Events without a session id belong to no visit.
 */
export function splitSiteSessions<Event extends SessionEvent>(
  events: readonly Event[],
) {
  const byId = new Map<string, Event[]>();
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
    const sessions: Event[][] = [];
    let latest: Event | undefined;
    for (const event of group) {
      const confirmation = event.name === "BOOKING_CONFIRMED";
      if (
        sessions.length === 0 ||
        (!confirmation &&
          (!latest || +event.occurredAt - +latest.occurredAt >= SESSION_GAP_MS))
      ) {
        sessions.push([]);
      }
      sessions.at(-1)?.push(event);
      if (!confirmation) latest = event;
    }
    return sessions.map((session) => ({ sessionId, events: session }));
  });
}

export function summarizeSiteSessions(events: readonly SessionEvent[]) {
  return splitSiteSessions(events).map((session) => ({
    sessionId: session.sessionId,
    ...summarizeSession(session.events),
  }));
}
