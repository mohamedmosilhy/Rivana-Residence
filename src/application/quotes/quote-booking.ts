import type { Clock } from "@/application/ports/providers";
import {
  couponInvalid,
  failure,
  invalid,
  serviceUnavailable,
  success,
  type Result,
} from "@/application/shared/result";
import {
  CouponPolicy,
  normalizeCouponCode,
  type CouponValue,
} from "@/domain/coupons";
import { AvailabilityCalculator } from "@/domain/inventory";
import {
  NightlyPriceResolver,
  QuoteCalculator,
  parseQuoteRequest,
  type NightlyPriceResult,
  type QuoteRequest,
  type Quote,
  type QuoteServiceLine,
} from "@/domain/pricing";
import {
  selectRequestedServices,
  type ServiceOffering,
} from "@/domain/services";
import type { DomainIssue } from "@/domain/shared/domain-error";
import type { StayRange } from "@/domain/shared/stay-range";
import {
  DEFAULT_STAY_POLICY,
  validatePublicStay,
  type StayPolicy,
} from "@/domain/shared/stay-policy";
import type { AccommodationType } from "@/domain/shared/types";
import { localDateAt } from "@/domain/shared/zoned-time";

import type { QuoteBookingReaders } from "./ports";

export type QuoteLineView = Readonly<{
  roomSlug: string;
  roomName: string;
  accommodationType: AccommodationType;
  occupancy: Readonly<{ adults: number; children: number }>;
  /** Every night is priced when a quote exists. */
  nights: Quote["lines"][number]["nights"];
  accommodationMinor: number;
}>;

export type QuoteView = Readonly<{
  stay: StayRange;
  lines: readonly QuoteLineView[];
  serviceLines: readonly QuoteServiceLine[];
  accommodationMinor: number;
  servicesMinor: number;
  subtotalMinor: number;
  appliedCoupon: Readonly<{
    code: string;
    kind: "PERCENT" | "FIXED";
    percentBasisPoints: number | null;
    amountMinor: number | null;
  }> | null;
  discountMinor: number;
  taxableMinor: number;
  vatRateBasisPoints: number;
  vatMinor: number;
  totalMinor: number;
}>;

export type QuoteResult = Readonly<{
  branchId: string;
  branchSlug: string;
  available: boolean;
  /** Indexes into the request `lines` that cannot be booked for the stay. */
  unavailableLines: readonly number[];
  /** The branch accepts online bookings and the quote is available. */
  bookable: boolean;
  /** Null only when a line is unavailable. */
  quote: QuoteView | null;
}>;

const BRANCH_NOT_FOUND = "This branch was not found.";

/**
 * The one server side quote (API-P6, ADR 027). The client sends what it
 * wants, never what it costs. Order follows spec 0004 Decision 10: stay and
 * branch, listings and occupancy, availability (no lock, no hold), nightly
 * prices, services, coupon, VAT. It writes, locks, and caches nothing.
 */
export class QuoteBooking {
  constructor(
    private readonly deps: QuoteBookingReaders &
      Readonly<{ clock: Clock; stayPolicy?: StayPolicy }>,
  ) {}

  async execute(input: unknown): Promise<Result<QuoteResult>> {
    const parsed = parseQuoteRequest(input);
    if (!parsed.ok) return invalid("Check the quote details.", parsed.issues);
    return this.compose(parsed.value, true);
  }

  /**
   * The CMS can unpublish or delete a listing between the catalog read and the
   * night read. One retry re-reads the catalog, so the vanished listing becomes
   * the usual 422 field error instead of a 404 for a branch that exists.
   */
  private async compose(
    request: QuoteRequest,
    canRetry: boolean,
  ): Promise<Result<QuoteResult>> {
    const branch = await this.deps.branches.findActiveRowBySlug(
      request.branchSlug,
    );
    if (!branch) return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    const now = this.deps.clock.now();
    const stayIssues = validatePublicStay(
      request.stay,
      localDateAt(now, branch.timeZone),
      this.deps.stayPolicy ?? DEFAULT_STAY_POLICY,
    );
    if (stayIssues.length > 0) {
      return invalid(
        "Check the stay dates.",
        stayIssues.map((issue) => ({ ...issue, path: `stay.${issue.path}` })),
      );
    }

    // Listings of this branch only; the branch never comes from the client.
    const published = new Map(
      (await this.deps.rooms.listPublished(branch.id))
        .filter(
          (room) => room.branchId === branch.id && room.status === "PUBLISHED",
        )
        .map((room) => [room.slug, room]),
    );
    const lineIssues: DomainIssue[] = [];
    const resolved = request.lines.map((line, index) => {
      const room = published.get(line.roomSlug);
      if (!room) {
        lineIssues.push({
          path: `lines.${index}.roomSlug`,
          message: "Choose a listing of this branch.",
        });
        return null;
      }
      if (!line.occupancy.fits(room)) {
        lineIssues.push({
          path: `lines.${index}.occupancy`,
          message: `This listing sleeps at most ${room.maxAdults} adults and ${room.maxChildren} children.`,
        });
        return null;
      }
      return { room, occupancy: line.occupancy };
    });
    if (lineIssues.length > 0) {
      return invalid("Check the units.", lineIssues);
    }
    const lines = resolved.flatMap((line) => (line ? [line] : []));

    // Repeated listings share one inventory check for the summed quantity.
    const groups = new Map<string, { roomId: string; indexes: number[] }>();
    for (const [index, line] of lines.entries()) {
      const group = groups.get(line.room.id) ?? {
        roomId: line.room.id,
        indexes: [],
      };
      group.indexes.push(index);
      groups.set(line.room.id, group);
    }
    const roomIds = [...groups.keys()];
    const [nights, rates] = await Promise.all([
      this.deps.inventory.readNights({
        branchId: branch.id,
        roomTypeIds: roomIds,
        nights: [...request.stay.nights()],
      }),
      this.deps.rates.readMany(roomIds, request.stay),
    ]);
    if (!nights.ok) {
      return canRetry && nights.error.code === "NOT_FOUND"
        ? this.compose(request, false)
        : nights;
    }

    const prices = new Map<
      string,
      Extract<NightlyPriceResult, { priced: true }>
    >();
    const unavailable = new Set<number>();
    for (const group of groups.values()) {
      const rate = rates.get(group.roomId) ?? { baseRate: null, periods: [] };
      const price = NightlyPriceResolver.resolve({
        stay: request.stay,
        baseRate: rate.baseRate?.amount ?? null,
        periods: rate.periods.map(({ id, range, amount, active, label }) => ({
          id,
          range,
          amount,
          active,
          label,
        })),
      });
      const free = AvailabilityCalculator.check({
        stay: request.stay,
        quantity: group.indexes.length,
        nights: nights.value.filter((row) => row.roomTypeId === group.roomId),
      });
      if (!price.priced || !free.available) {
        for (const index of group.indexes) unavailable.add(index);
      } else {
        prices.set(group.roomId, price);
      }
    }
    if (unavailable.size > 0) {
      return success({
        branchId: branch.id,
        branchSlug: branch.slug,
        available: false,
        unavailableLines: [...unavailable].sort((a, b) => a - b),
        bookable: false,
        quote: null,
      });
    }

    // Services: unit and prices come from the branch's rows, never the client.
    const offerings: ServiceOffering[] = (
      await this.deps.services.listByBranch(branch.id)
    ).map((offering) => ({
      kind: offering.kind,
      unit: offering.priceUnit,
      price: offering.price,
      childPrice: offering.childPrice,
      active: offering.active,
    }));
    const selected = selectRequestedServices(request.services, offerings);
    if (!selected.ok) {
      return "kind" in selected
        ? serviceUnavailable(selected.kind)
        : invalid("Check the services.", selected.issues);
    }

    // Coupon: one refusal shape for every reason, so a guesser learns only
    // whether this code works here. Nothing about other codes or guests.
    let coupon: CouponValue | undefined;
    let couponView: QuoteView["appliedCoupon"] = null;
    if (request.couponCode !== undefined) {
      const code = normalizeCouponCode(request.couponCode);
      if (!code.ok) return couponInvalid("NOT_FOUND");
      const record = await this.deps.coupons.findByCode(code.code);
      const counts = record
        ? await this.deps.redemptions.count({
            code: code.code,
            phone: request.phone,
          })
        : { total: 0, forPhone: 0 };
      const verdict = CouponPolicy.validate(record, {
        branchId: branch.id,
        phone: request.phone,
        now,
        redemptionsTotal: counts.total,
        redemptionsForPhone: counts.forPhone,
      });
      if (!verdict.valid) return couponInvalid(verdict.reason);
      coupon = verdict.value;
      couponView = {
        code: code.code,
        kind: verdict.value.kind,
        percentBasisPoints:
          verdict.value.kind === "PERCENT"
            ? verdict.value.percentBasisPoints
            : null,
        amountMinor:
          verdict.value.kind === "FIXED"
            ? verdict.value.amount.amountMinor
            : null,
      };
    }

    const { vatRateBasisPoints } = await this.deps.settings.read();
    const quote = QuoteCalculator.compute({
      lines: lines.map((line) => ({
        nights: prices.get(line.room.id)!.nights,
      })),
      guests: {
        adults: lines.reduce((sum, line) => sum + line.occupancy.adults, 0),
        children: lines.reduce((sum, line) => sum + line.occupancy.children, 0),
      },
      services: selected.services.map((service) => ({
        kind: service.kind,
        unit: service.unit,
        price: service.price,
        childPrice: service.childPrice,
      })),
      ...(coupon ? { coupon } : {}),
      vatRateBasisPoints,
    });

    return success({
      branchId: branch.id,
      branchSlug: branch.slug,
      available: true,
      unavailableLines: [],
      bookable: branch.onlineBookingEnabled,
      quote: {
        stay: request.stay,
        lines: lines.map((line, index) => ({
          roomSlug: line.room.slug,
          roomName: line.room.name,
          accommodationType: line.room.accommodationType,
          occupancy: {
            adults: line.occupancy.adults,
            children: line.occupancy.children,
          },
          nights: quote.lines[index]!.nights,
          accommodationMinor: quote.lines[index]!.accommodationMinor,
        })),
        serviceLines: quote.serviceLines,
        accommodationMinor: quote.accommodationMinor,
        servicesMinor: quote.servicesMinor,
        subtotalMinor: quote.subtotalMinor,
        appliedCoupon: couponView,
        discountMinor: quote.discountMinor,
        taxableMinor: quote.taxableMinor,
        vatRateBasisPoints: quote.vatRateBasisPoints,
        vatMinor: quote.vatMinor,
        totalMinor: quote.totalMinor,
      },
    });
  }
}
