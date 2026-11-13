import type { Clock } from "@/application/shared/providers";

import type { PublicRateLimitStore } from "./public-rate-limit-ports";

export class CleanupPublicThrottles {
  constructor(
    private readonly store: Pick<PublicRateLimitStore, "cleanupExpired">,
    private readonly clock: Clock,
  ) {}

  async execute() {
    return {
      deleted: await this.store.cleanupExpired(this.clock.now()),
    };
  }
}
