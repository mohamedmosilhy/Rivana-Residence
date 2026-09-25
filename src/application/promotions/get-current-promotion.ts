import type { PromotionRepository } from "@/application/ports/repositories";
import type { Clock } from "@/application/ports/providers";

export class GetCurrentPromotion {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly clock: Clock,
  ) {}

  execute() {
    return this.promotions.getCurrent(this.clock.now());
  }
}
