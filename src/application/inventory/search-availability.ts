import type { Clock } from "@/application/shared/providers";
import type { RateBatchReader, RateReadModel } from "@/application/pricing";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import {
  AvailabilityCalculator,
  MAX_UNITS_REQUESTED,
  parseAvailabilitySearch,
} from "@/domain/inventory";
import { NightlyPriceResolver } from "@/domain/pricing";
import type { Money } from "@/domain/shared/money";
import type { Occupancy } from "@/domain/shared/occupancy";
import type { StayRange } from "@/domain/shared/stay-range";
import {
  DEFAULT_STAY_POLICY,
  validatePublicStay,
  type StayPolicy,
} from "@/domain/shared/stay-policy";
import { localDateAt } from "@/domain/shared/zoned-time";

import { readListingNights } from "./read-listing-nights";
import type {
  AvailabilityCatalog,
  CatalogRoomType,
  InventoryNightRecord,
  InventoryReader,
} from "./ports";

export type SearchRefusal = "UNPRICED" | "OCCUPANCY" | "SOLD_OUT";

/** Only what the public may learn: a capped quantity and prices, no counts. */
export type ListingSearchResult = Readonly<{
  roomTypeId: string;
  name: string;
  available: boolean;
  unitsAvailable: number;
  pricePerNight: readonly Money[];
  accommodationTotal: Money | null;
  reason?: SearchRefusal;
}>;

export type SearchAvailabilityResult = Readonly<{
  stay: StayRange;
  occupancy: Occupancy;
  unitsRequested: number;
  results: readonly ListingSearchResult[];
}>;

const BRANCH_NOT_FOUND = "This branch was not found.";

/**
 * Availability for a stay across the published listings of an active branch
 * (API-P5, exposed in M6-T10). A read: no lock, no cache, and never a hold. The
 * caller supplies a branch id it resolved on the server; online booking being
 * disabled does not block a search (Q-70).
 */
export class SearchAvailability {
  constructor(
    private readonly deps: Readonly<{
      catalog: AvailabilityCatalog;
      reader: InventoryReader;
      rates: RateBatchReader;
      clock: Clock;
      stayPolicy?: StayPolicy;
    }>,
  ) {}

  async execute(
    branchId: string,
    input: unknown,
  ): Promise<Result<SearchAvailabilityResult>> {
    const branch = await this.deps.catalog.findBranch(branchId);
    if (!branch?.active) return failure("NOT_FOUND", BRANCH_NOT_FOUND);

    const parsed = parseAvailabilitySearch(input);
    if (!parsed.ok) return invalid("Check the search details.", parsed.issues);
    const { stay, occupancy, unitsRequested } = parsed.value;
    const policyIssues = validatePublicStay(
      stay,
      localDateAt(this.deps.clock.now(), branch.timeZone),
      this.deps.stayPolicy ?? DEFAULT_STAY_POLICY,
    );
    if (policyIssues.length > 0) {
      return invalid("Check the stay dates.", policyIssues);
    }

    const read = await readListingNights(this.deps, {
      branchId,
      scope: "PUBLISHED",
      nights: [...stay.nights()],
    });
    if (!read.ok) return read;
    const { roomTypes, records } = read.value;
    if (roomTypes.length === 0) {
      return success({ stay, occupancy, unitsRequested, results: [] });
    }
    const rates = await this.deps.rates.readMany(
      roomTypes.map((roomType) => roomType.id),
      stay,
    );

    const inventory = new Map<string, InventoryNightRecord[]>();
    for (const record of records) {
      const rows = inventory.get(record.roomTypeId) ?? [];
      rows.push(record);
      inventory.set(record.roomTypeId, rows);
    }

    const results = roomTypes.map((roomType) =>
      this.evaluate({
        roomType,
        stay,
        occupancy,
        unitsRequested,
        nights: inventory.get(roomType.id) ?? [],
        rates: rates.get(roomType.id) ?? { baseRate: null, periods: [] },
      }),
    );
    return success({ stay, occupancy, unitsRequested, results });
  }

  private evaluate(
    input: Readonly<{
      roomType: CatalogRoomType;
      stay: StayRange;
      occupancy: Occupancy;
      unitsRequested: number;
      nights: readonly InventoryNightRecord[];
      rates: RateReadModel;
    }>,
  ): ListingSearchResult {
    const { roomType, stay, occupancy, unitsRequested } = input;
    const price = NightlyPriceResolver.resolve({
      stay,
      baseRate: input.rates.baseRate?.amount ?? null,
      periods: input.rates.periods.map(
        ({ id, range, amount, active, label }) => ({
          id,
          range,
          amount,
          active,
          label,
        }),
      ),
      quantity: unitsRequested,
    });
    // The calculator reports the first night short of one unit; the selectable
    // quantity is the smallest free count over the stay, capped for disclosure.
    const free = AvailabilityCalculator.check({
      stay,
      quantity: 1,
      nights: input.nights,
    }).nights.map((night) => night.free);
    const selectable = Math.min(
      MAX_UNITS_REQUESTED,
      Math.max(0, Math.min(...free)),
    );

    if (!price.priced) {
      return {
        roomTypeId: roomType.id,
        name: roomType.name,
        available: false,
        unitsAvailable: 0,
        pricePerNight: [],
        accommodationTotal: null,
        reason: "UNPRICED",
      };
    }
    const pricePerNight = price.nights.map((night) => {
      if (!night.amount)
        throw new Error("A priced stay has an unpriced night.");
      return night.amount;
    });
    const base = {
      roomTypeId: roomType.id,
      name: roomType.name,
      pricePerNight,
      accommodationTotal: price.accommodationTotal,
    };
    if (!occupancy.fits(roomType)) {
      return {
        ...base,
        available: false,
        unitsAvailable: 0,
        reason: "OCCUPANCY",
      };
    }
    const available = selectable >= unitsRequested;
    return {
      ...base,
      available,
      unitsAvailable: selectable,
      ...(available ? {} : { reason: "SOLD_OUT" as const }),
    };
  }
}
