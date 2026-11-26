import { LocalDate } from "@/domain/shared/local-date";
import { DEFAULT_STAY_POLICY } from "@/domain/shared/stay-policy";

import {
  splitSiteSessions,
  summarizeSession,
  type SessionEvent,
} from "./site-session";

// One UTC day of raw events, counted for the website report (ADR 029, Q-87).
// Raw events are deleted after 90 days, so these totals are all that remains.

export type TotalledEvent = SessionEvent &
  Readonly<{
    visitorHash: string | null;
    branchId: string | null;
    roomId: string | null;
    referrerHost: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    device: string | null;
    outcome: string | null;
    /** `YYYY-MM-DD`. */
    stayCheckIn: string | null;
    stayCheckOut: string | null;
  }>;

export type DailyDimension =
  | "TOTAL"
  | "FUNNEL_STEP"
  | "DROP_OFF"
  | "VERIFY_ABANDONED"
  | "LANDING_PAGE"
  | "EXIT_PAGE"
  | "REFERRER"
  | "UTM_SOURCE"
  | "UTM_MEDIUM"
  | "UTM_CAMPAIGN"
  | "DEVICE"
  | "UNMET_DATE"
  | "REFUSAL"
  | "LISTING_VIEW"
  | "LISTING_QUOTE"
  | "LISTING_BOOKING";

export type DailyTotal = Readonly<{
  branchId: string;
  dimension: DailyDimension;
  key: string;
  visitors: number;
  sessions: number;
  count: number;
}>;

/** Every visit once. Adding branch rows would count a two branch visit twice. */
export const WHOLE_SITE = "*";
/** Pages that belong to no branch, such as the branch chooser. */
export const OUTSIDE_BRANCH = "";

const VISIT_ATTRIBUTES = [
  ["REFERRER", "referrerHost"],
  ["UTM_SOURCE", "utmSource"],
  ["UTM_MEDIUM", "utmMedium"],
  ["UTM_CAMPAIGN", "utmCampaign"],
  ["DEVICE", "device"],
] as const;

export function utcDay(instant: Date) {
  return instant.toISOString().slice(0, 10);
}

type Bucket = {
  branchId: string;
  dimension: DailyDimension;
  key: string;
  visitors: Set<string>;
  sessions: Set<string>;
  count: number;
};

class Tally {
  private readonly buckets = new Map<string, Bucket>();

  add(
    branchId: string,
    dimension: DailyDimension,
    key: string,
    values: Readonly<{
      session?: string | null;
      visitors?: Iterable<string>;
      count: number;
    }>,
  ) {
    const id = JSON.stringify([branchId, dimension, key]);
    let bucket = this.buckets.get(id);
    if (!bucket) {
      bucket = {
        branchId,
        dimension,
        key,
        visitors: new Set(),
        sessions: new Set(),
        count: 0,
      };
      this.buckets.set(id, bucket);
    }
    if (values.session) bucket.sessions.add(values.session);
    for (const visitor of values.visitors ?? []) bucket.visitors.add(visitor);
    bucket.count += values.count;
  }

  rows(): DailyTotal[] {
    return [...this.buckets.values()].map(
      ({ visitors, sessions, ...bucket }) => ({
        ...bucket,
        visitors: visitors.size,
        sessions: sessions.size,
      }),
    );
  }
}

/**
 * Code requests and confirmations carry no branch. They belong to the branch
 * the visit was last on.
 */
function scopesOf(events: readonly TotalledEvent[]) {
  let latest: string | null = null;
  return events.map((event) => {
    const inherits =
      event.name === "CODE_REQUESTED" || event.name === "PHONE_VERIFIED";
    if (event.branchId) latest = event.branchId;
    return {
      event,
      scope: (inherits ? latest : event.branchId) ?? OUTSIDE_BRANCH,
    };
  });
}

function countVisit(
  tally: Tally,
  visit: string,
  day: string,
  events: readonly TotalledEvent[],
) {
  // The visitor hash changes at midnight: one visit must not count twice.
  const visitors = new Set(
    events.flatMap((event) =>
      event.visitorHash && utcDay(event.occurredAt) === day
        ? [event.visitorHash]
        : [],
    ),
  );
  const scoped = scopesOf(events);
  const scopes = new Set(scoped.map((entry) => entry.scope));
  for (const scope of [WHOLE_SITE, ...scopes]) {
    const own =
      scope === WHOLE_SITE
        ? events
        : scoped
            .filter((entry) => entry.scope === scope)
            .map((entry) => entry.event);
    const add = (dimension: DailyDimension, key: string, count = 1) =>
      tally.add(scope, dimension, key, { session: visit, visitors, count });
    const pages = own.filter((event) => event.name === "PAGE_VIEW");
    const summary = summarizeSession(own);

    add("TOTAL", "", pages.length);
    for (const step of summary.reachedSteps) add("FUNNEL_STEP", String(step));
    if (summary.dropOffStep !== null)
      add("DROP_OFF", String(summary.dropOffStep));
    if (summary.reachedSteps.includes(5) && !summary.reachedSteps.includes(6))
      add("VERIFY_ABANDONED", "");
    const landing = pages.find((event) => event.path !== null)?.path;
    if (landing) add("LANDING_PAGE", landing);
    if (summary.exitPage !== null) add("EXIT_PAGE", summary.exitPage);
    // Where the visit came from belongs to the whole visit, in every scope.
    for (const [dimension, field] of VISIT_ATTRIBUTES) {
      const value = events.find((event) => event[field] !== null)?.[field];
      if (value) add(dimension, value);
    }

    for (const event of own) {
      if (!event.roomId) continue;
      if (event.name === "PAGE_VIEW" && event.funnelStep === 2)
        add("LISTING_VIEW", event.roomId);
      if (event.name === "QUOTE") add("LISTING_QUOTE", event.roomId);
      if (event.name === "BOOKING_CONFIRMED")
        add("LISTING_BOOKING", event.roomId);
    }
  }
}

/** Unmet demand and refusals are counted on the day they happened. */
function countOccurrence(tally: Tally, event: TotalledEvent) {
  const keys: [DailyDimension, string][] = [];
  if (
    event.outcome === "NO_AVAILABILITY" &&
    event.stayCheckIn &&
    event.stayCheckOut
  ) {
    const first = LocalDate.parse(event.stayCheckIn);
    const nights = Math.min(
      first.daysUntil(LocalDate.parse(event.stayCheckOut)),
      DEFAULT_STAY_POLICY.maxStayNights,
    );
    for (let night = 0; night < nights; night += 1)
      keys.push(["UNMET_DATE", first.addDays(night).value]);
  }
  if (event.name === "CHECKOUT_REFUSED" && event.outcome)
    keys.push(["REFUSAL", event.outcome]);
  for (const [dimension, key] of keys)
    for (const scope of [WHOLE_SITE, event.branchId ?? OUTSIDE_BRANCH])
      tally.add(scope, dimension, key, {
        session: event.sessionId,
        visitors: event.visitorHash ? [event.visitorHash] : [],
        count: 1,
      });
}

/**
 * The totals of one UTC day. `events` must also hold the neighbouring days, so
 * a visit that crosses midnight is seen whole and counted on the day it
 * started. The whole site `TOTAL` row is always present: it marks the day done.
 */
export function dailyTotals(day: string, events: readonly TotalledEvent[]) {
  const tally = new Tally();
  tally.add(WHOLE_SITE, "TOTAL", "", { count: 0 });
  splitSiteSessions(events).forEach((visit, index) => {
    const first = visit.events[0];
    if (first && utcDay(first.occurredAt) === day)
      countVisit(tally, String(index), day, visit.events);
  });
  for (const event of events)
    if (utcDay(event.occurredAt) === day) countOccurrence(tally, event);
  return tally.rows();
}
