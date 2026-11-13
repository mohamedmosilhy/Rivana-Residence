import type { PublicationStatus } from "@/domain/shared/types";

export type PublicationCounts = Readonly<Record<PublicationStatus, number>>;

export type RecentContentKind = "PAGE" | "ROOM" | "FACILITY" | "SETTINGS";

export type RecentContentItem = Readonly<{
  kind: RecentContentKind;
  id: string;
  title: string;
  status: PublicationStatus | null;
  updatedAt: Date;
}>;

export type AdminOverviewDto = Readonly<{
  timeZone: string;
  pages: Readonly<{ published: number; total: number }>;
  rooms: PublicationCounts;
  facilities: PublicationCounts;
  media: Readonly<{ ready: number; missingAltText: number; failed: number }>;
  enquiries: Readonly<{ new: number; deliveryFailed: number }>;
  recent: readonly RecentContentItem[];
}>;

/** Read-only aggregate queries for the admin overview. */
export interface AdminOverviewReader {
  read(now: Date, recentLimit: number): Promise<AdminOverviewDto>;
}
