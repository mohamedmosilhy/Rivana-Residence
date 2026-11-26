import type { BookingStep, Device, SiteEventName } from "@/domain/analytics";

export type RecordedSiteEvent = Readonly<{
  occurredAt: Date;
  name: SiteEventName;
  path: string;
  funnelStep: number | null;
  bookingStep: BookingStep | null;
  branchId: string | null;
  roomId: string | null;
  sessionId: string;
  visitorHash: string | null;
  device: Device | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}>;

export interface SiteEventStore {
  branchIdFor(slug: string): Promise<string | null>;
  roomIdFor(branchId: string, slug: string): Promise<string | null>;
  record(events: readonly RecordedSiteEvent[]): Promise<void>;
}

export interface AnalyticsSaltStore {
  current(day: Date, makeSalt: () => Uint8Array): Promise<Uint8Array | null>;
}
