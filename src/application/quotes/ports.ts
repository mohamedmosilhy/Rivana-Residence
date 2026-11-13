import type { BranchRepository } from "@/application/branches";
import type {
  CouponLookup,
  CouponRedemptionReader,
} from "@/application/coupons";
import type { CommercialSettingsRepository } from "@/application/commercial";
import type { InventoryReader } from "@/application/inventory";
import type { RoomRepository } from "@/application/ports/repositories";
import type { RateBatchReader } from "@/application/pricing";
import type { ServiceOfferingRepository } from "@/application/services";

/**
 * Everything `QuoteBooking` reads. Every port is a read: a quote writes,
 * locks, and caches nothing. The adapters are the existing M6 and M7 ones.
 */
export type QuoteBookingReaders = Readonly<{
  branches: Pick<BranchRepository, "findActiveRowBySlug">;
  rooms: Pick<RoomRepository, "listPublished">;
  inventory: InventoryReader;
  rates: RateBatchReader;
  services: Pick<ServiceOfferingRepository, "listByBranch">;
  coupons: CouponLookup;
  redemptions: CouponRedemptionReader;
  settings: Pick<CommercialSettingsRepository, "read">;
}>;
