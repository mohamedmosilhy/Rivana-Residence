import type { Clock } from "@/application/ports/providers";

import type { PublicRateLimitStore } from "./public-rate-limit-ports";

export class CleanupPublicThrottles {
  constructor(
    private readonly store: Pick<
      PublicRateLimitStore,
      "cleanupExpiredAvailability"
    >,
    private readonly clock: Clock,
  ) {}

  async execute() {
    return {
      deleted: await this.store.cleanupExpiredAvailability(this.clock.now()),
    };
  }
}
