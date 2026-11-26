import "server-only";

import type { AnalyticsSaltStore } from "./ports";

export class RotateAnalyticsSalt {
  constructor(
    private readonly salts: AnalyticsSaltStore,
    private readonly makeSalt: () => Uint8Array,
  ) {}

  execute(now: Date) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    return this.salts.current(day, this.makeSalt);
  }
}
