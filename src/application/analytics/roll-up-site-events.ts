import "server-only";

import type { Clock } from "@/application/shared/providers";
import { dailyTotals, utcDay } from "@/domain/analytics";

import type { SiteRollupStore } from "./ports";
import type { RotateAnalyticsSalt } from "./rotate-analytics-salt";

const DAY_MS = 24 * 60 * 60_000;
/** Raw events are kept this long (Q-87). */
export const RAW_EVENT_RETENTION_MS = 90 * DAY_MS;
/** Finished days counted again each run, for events that arrived late. */
const RECOUNTED_DAYS = 2;

export type RollUpSummary = Readonly<{
  rolledUpDays: number;
  failedDays: number;
  deletedEvents: number;
}>;

type Dependencies = Readonly<{
  clock: Clock;
  store: SiteRollupStore;
  salt: Pick<RotateAnalyticsSalt, "execute">;
}>;

/**
 * The hourly job (ADR 029, Q-87): writes daily totals, then deletes raw events
 * older than 90 days whose day has totals, and drops old visitor salts. Running
 * it again gives the same totals. One failing day never stops the others.
 */
export class RollUpSiteEvents {
  constructor(private readonly deps: Dependencies) {}

  async execute(): Promise<RollUpSummary> {
    const { clock, store, salt } = this.deps;
    const now = clock.now();
    // Also on a day without visits, so yesterday's secret never lingers.
    await salt.execute(now);

    const today = utcDay(now);
    const midnight = Date.parse(`${today}T00:00:00Z`);
    const recent = Array.from({ length: RECOUNTED_DAYS }, (_, index) =>
      utcDay(new Date(midnight - (index + 1) * DAY_MS)),
    );
    const days = [
      ...new Set([
        ...(await store.daysWithoutTotals(today)),
        ...(await store.daysWithEvents(recent)),
      ]),
    ].sort();

    let rolledUpDays = 0;
    let failedDays = 0;
    for (const day of days) {
      try {
        const start = Date.parse(`${day}T00:00:00Z`);
        const events = await store.eventsBetween(
          new Date(start - DAY_MS),
          new Date(start + 2 * DAY_MS),
        );
        await store.replaceTotals(day, dailyTotals(day, events));
        rolledUpDays += 1;
      } catch {
        failedDays += 1;
      }
    }
    const deletedEvents = await store.deleteTotalledBefore(
      new Date(now.getTime() - RAW_EVENT_RETENTION_MS),
    );
    return { rolledUpDays, failedDays, deletedEvents };
  }
}
