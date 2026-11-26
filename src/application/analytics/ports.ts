import type {
  BookingStep,
  DailyTotal,
  Device,
  SiteEventName,
  TotalledEvent,
} from "@/domain/analytics";

export type RecordedSiteEvent = Readonly<{
  occurredAt: Date;
  name: SiteEventName;
  /** Null on server side steps, which are not page views. */
  path: string | null;
  funnelStep: number | null;
  bookingStep: BookingStep | null;
  branchId: string | null;
  roomId: string | null;
  /** Null only on a search that found nothing and sent no session id. */
  sessionId: string | null;
  visitorHash: string | null;
  device: Device | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  outcome?: string | null;
  stayCheckIn?: Date | null;
  stayCheckOut?: Date | null;
}>;

export interface SiteEventStore {
  branchIdFor(slug: string): Promise<string | null>;
  roomIdFor(branchId: string, slug: string): Promise<string | null>;
  record(events: readonly RecordedSiteEvent[]): Promise<void>;
  /**
   * Whether this session already has a row with the same name, branch and
   * listing since the instant. Best effort: totals count a session once, so a
   * concurrent duplicate changes no report figure.
   */
  recordedSince(
    event: Readonly<
      Pick<RecordedSiteEvent, "name" | "branchId" | "roomId"> & {
        sessionId: string;
      }
    >,
    since: Date,
  ): Promise<boolean>;
}

export interface AnalyticsSaltStore {
  current(day: Date, makeSalt: () => Uint8Array): Promise<Uint8Array | null>;
}

/** Days are `YYYY-MM-DD` in UTC. */
export interface SiteRollupStore {
  /** Days before `today` that hold raw events and have no totals yet. */
  daysWithoutTotals(today: string): Promise<readonly string[]>;
  /** The days among these that hold raw events. */
  daysWithEvents(days: readonly string[]): Promise<readonly string[]>;
  /** Raw events from `from` up to, not including, `to`. */
  eventsBetween(from: Date, to: Date): Promise<readonly TotalledEvent[]>;
  /** Replaces every total of the day in one transaction. */
  replaceTotals(day: string, totals: readonly DailyTotal[]): Promise<void>;
  /** Deletes raw events older than the instant whose day has totals. */
  deleteTotalledBefore(cutoff: Date): Promise<number>;
}
