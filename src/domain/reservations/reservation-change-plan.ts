import type { NormalizedService, ServiceKind } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import type { ReservationNightSnapshot } from "./reservation";
import { planNightlyRepricing } from "./stay-modification";

export type CurrentChangeLine = Readonly<{
  id: string;
  roomTypeId: string;
  physicalRoomId: string | null;
  occupancy: Occupancy;
  nights: readonly ReservationNightSnapshot[];
}>;
export type RequestedChangeLine = Readonly<{
  roomTypeId: string;
  occupancy: Occupancy;
}>;

export type PlannedChangeLine = Readonly<{
  roomTypeId: string;
  occupancy: Occupancy;
  /** The existing line this one continues, or null for an added unit. */
  continuesLineId: string | null;
  /**
   * The unit this line is assigned to now. The caller keeps it only while it
   * is still valid for the new stay (free of other assignments and blocks);
   * otherwise the assignment is dropped and made again at the desk.
   */
  assignedPhysicalRoomId: string | null;
  retained: readonly ReservationNightSnapshot[];
  needsCurrentPrice: readonly LocalDate[];
}>;

type CurrentChangeService = Readonly<{
  kind: string;
  vehicles: number | null;
  details: string | null;
}>;

type PlannedService = Readonly<
  | {
      kind: ServiceKind;
      added: true;
      index: number;
      request: NormalizedService;
    }
  | (CurrentChangeService & {
      added: false;
      changedVehiclesAt: number | null;
      detailsChanged: boolean;
    })
>;

export type ReservationChangePlan = Readonly<{
  lines: readonly PlannedChangeLine[];
  removedLineIds: readonly string[];
  stayChanged: boolean;
  /** Stay, units or occupancy differ from the reservation. */
  structureChanged: boolean;
  services: readonly PlannedService[];
  removedServices: readonly string[];
  /** Listings of the old and the new lines, sorted: the set to lock (Decision 1). */
  roomTypeIds: readonly string[];
  /** Nights of the new stay that were not in the old one for that unit. */
  repricedNightCount: number;
}>;

function invalid(path: string, message: string): never {
  throw new DomainValidationError("Check the change.", [{ path, message }]);
}

function planServiceChanges(
  current: readonly CurrentChangeService[],
  requested: readonly NormalizedService[] | undefined,
) {
  const kept = (service: CurrentChangeService): PlannedService => ({
    ...service,
    added: false,
    changedVehiclesAt: null,
    detailsChanged: false,
  });
  const services =
    requested === undefined
      ? current.map(kept)
      : requested.map((service, index): PlannedService => {
          const previous = current.find((line) => line.kind === service.kind);
          if (!previous)
            return { kind: service.kind, added: true, index, request: service };
          const vehicles = service.vehicles ?? previous.vehicles;
          const details =
            service.details === undefined
              ? previous.details
              : service.details || null;
          return {
            kind: service.kind,
            added: false,
            vehicles,
            details,
            changedVehiclesAt: vehicles === previous.vehicles ? null : index,
            detailsChanged: details !== previous.details,
          };
        });
  const removedServices = current
    .filter((line) => !services.some((service) => service.kind === line.kind))
    .map((line) => line.kind);
  return { services, removedServices };
}

/**
 * Pure comparison of a reservation with a requested stay, units and services (Q-19,
 * PR-11). Units are matched by listing: an exact occupancy match first, then
 * the next unit of the same listing in id order. Unchanged nights keep their
 * stored amount; only new nights need today's rate. Services are matched by kind.
 *
 * Rules for a stay that has started (check in before branch `today`): the
 * check in and the nights before today are history and cannot change, units
 * cannot be added, removed or moved to another listing, and only the check
 * out may move (not before today). Otherwise a new check in must be today or
 * later. On started stays, only service details can be edited. A request that
 * changes nothing throws, unless `allowPriceOnly` (a
 * staff price override on an otherwise unchanged stay), so a no-op never
 * writes a history row.
 */
export function planReservationChange(
  current: Readonly<{
    stay: StayRange;
    lines: readonly CurrentChangeLine[];
    snapshot?: Readonly<{
      serviceLines: readonly CurrentChangeService[];
    }> | null;
  }>,
  requested: Readonly<{
    stay: StayRange;
    lines: readonly RequestedChangeLine[];
    services?: readonly NormalizedService[] | undefined;
  }>,
  options: Readonly<{ today: LocalDate; allowPriceOnly: boolean }>,
): ReservationChangePlan {
  if (requested.lines.length < 1 || requested.lines.length > 5)
    invalid("lines", "Choose one to five units.");
  const stayChanged =
    current.stay.checkIn.compare(requested.stay.checkIn) !== 0 ||
    current.stay.checkOut.compare(requested.stay.checkOut) !== 0;
  const checkInChanged =
    current.stay.checkIn.compare(requested.stay.checkIn) !== 0;
  const roomTypesOf = (lines: readonly { roomTypeId: string }[]) =>
    lines
      .map((line) => line.roomTypeId)
      .sort()
      .join("|");
  const started = current.stay.checkIn.compare(options.today) < 0;
  if (started) {
    if (checkInChanged)
      invalid(
        "stay.checkIn",
        "The stay has started: its check in cannot change.",
      );
    const historyEnd =
      current.stay.checkOut.compare(options.today) < 0
        ? current.stay.checkOut
        : options.today;
    if (requested.stay.checkOut.compare(historyEnd) < 0)
      invalid("stay.checkOut", "Nights before today cannot be removed.");
    if (
      requested.stay.checkOut.compare(current.stay.checkOut) > 0 &&
      current.stay.checkOut.compare(options.today) < 0
    )
      invalid("stay.checkOut", "Nights before today cannot be added.");
    if (roomTypesOf(current.lines) !== roomTypesOf(requested.lines))
      invalid(
        "lines",
        "The stay has started: units cannot be added, removed or moved to another listing.",
      );
  } else if (
    checkInChanged &&
    requested.stay.checkIn.compare(options.today) < 0
  ) {
    invalid(
      "stay.checkIn",
      "Choose a check-in date from the branch's today onwards.",
    );
  }
  const available = [...current.lines].sort((a, b) => a.id.localeCompare(b.id));
  const matched: (CurrentChangeLine | null)[] = requested.lines.map(() => null);
  // Each requested unit takes the best remaining unit of its listing: an
  // assigned unit with the same occupancy, then the same occupancy, then any
  // assigned unit, then any. Assigned units win so that a change never moves
  // the physical room to another unit of the booking without need.
  const exact = (line: RequestedChangeLine, candidate: CurrentChangeLine) =>
    candidate.occupancy.adults === line.occupancy.adults &&
    candidate.occupancy.children === line.occupancy.children;
  const passes: ((
    line: RequestedChangeLine,
    candidate: CurrentChangeLine,
  ) => boolean)[] = [
    (line, candidate) => exact(line, candidate) && !!candidate.physicalRoomId,
    exact,
    (_line, candidate) => !!candidate.physicalRoomId,
    () => true,
  ];
  for (const pass of passes)
    requested.lines.forEach((line, index) => {
      if (matched[index] !== null) return;
      const at = available.findIndex(
        (candidate) =>
          candidate.roomTypeId === line.roomTypeId && pass(line, candidate),
      );
      if (at >= 0) matched[index] = available.splice(at, 1)[0]!;
    });

  let repricedNightCount = 0;
  const lines = requested.lines.map((line, index): PlannedChangeLine => {
    const previous = matched[index] ?? null;
    const plan = planNightlyRepricing(
      previous && { roomTypeId: previous.roomTypeId, nights: previous.nights },
      { roomTypeId: line.roomTypeId, stay: requested.stay },
    );
    repricedNightCount += plan.needsCurrentPrice.length;
    return {
      roomTypeId: line.roomTypeId,
      occupancy: line.occupancy,
      continuesLineId: previous?.id ?? null,
      assignedPhysicalRoomId: previous?.physicalRoomId ?? null,
      retained: plan.retained,
      needsCurrentPrice: plan.needsCurrentPrice,
    };
  });
  const unchangedUnits =
    available.length === 0 &&
    lines.every((line, index) => {
      const previous = matched[index];
      return (
        previous !== null &&
        previous !== undefined &&
        previous.occupancy.adults === line.occupancy.adults &&
        previous.occupancy.children === line.occupancy.children
      );
    });
  const structureChanged = stayChanged || !unchangedUnits;
  const { services, removedServices } = planServiceChanges(
    current.snapshot?.serviceLines ?? [],
    requested.services,
  );
  const selectionOrCarsChanged =
    removedServices.length > 0 ||
    services.some(
      (service) => service.added || service.changedVehiclesAt !== null,
    );
  if (started && selectionOrCarsChanged)
    invalid(
      "services",
      "Once a stay has started, only service details can be changed.",
    );
  const servicesChanged =
    selectionOrCarsChanged ||
    services.some((service) => !service.added && service.detailsChanged);
  if (!structureChanged && !servicesChanged && !options.allowPriceOnly)
    invalid("stay", "Nothing was changed.");
  return Object.freeze({
    lines: Object.freeze(lines),
    removedLineIds: Object.freeze(available.map((line) => line.id)),
    stayChanged,
    structureChanged,
    services: Object.freeze(services),
    removedServices: Object.freeze(removedServices),
    roomTypeIds: Object.freeze(
      [
        ...new Set([
          ...current.lines.map((line) => line.roomTypeId),
          ...requested.lines.map((line) => line.roomTypeId),
        ]),
      ].sort(),
    ),
    repricedNightCount,
  });
}

/** What a history row and the audit event may say about a reservation: no personal values. */
export type ChangeSummary = Readonly<{
  status: string;
  /** Units with a physical room assigned, so a dropped assignment shows in before and after. */
  assignedUnits: number;
  checkIn: string;
  checkOut: string;
  units: readonly Readonly<{
    roomTypeId: string;
    adults: number;
    children: number;
  }>[];
  accommodationMinor: number | null;
  services: readonly Readonly<{
    kind: string;
    vehicles: number | null;
    detailsChanged: boolean;
  }>[];
  servicesMinor: number | null;
  discountMinor: number | null;
  vatMinor: number | null;
  totalMinor: number | null;
}>;

export function summarizeReservation(
  reservation: Readonly<{
    status: string;
    stay: StayRange;
    lines: readonly Readonly<{
      roomTypeId: string;
      occupancy: Occupancy;
      physicalRoomId: string | null;
    }>[];
    snapshot: Readonly<{
      accommodationMinor: number;
      serviceLines: readonly Pick<CurrentChangeService, "kind" | "vehicles">[];
      servicesMinor: number;
      discountMinor: number;
      vatMinor: number;
      totalMinor: number;
    }> | null;
  }>,
  changedDetails: readonly string[] = [],
): ChangeSummary {
  const snapshot = reservation.snapshot;
  return {
    status: reservation.status,
    assignedUnits: reservation.lines.filter(
      (line) => line.physicalRoomId !== null,
    ).length,
    checkIn: reservation.stay.checkIn.value,
    checkOut: reservation.stay.checkOut.value,
    units: reservation.lines.map((line) => ({
      roomTypeId: line.roomTypeId,
      adults: line.occupancy.adults,
      children: line.occupancy.children,
    })),
    accommodationMinor: snapshot?.accommodationMinor ?? null,
    services: (snapshot?.serviceLines ?? []).map(({ kind, vehicles }) => ({
      kind,
      vehicles,
      detailsChanged: changedDetails.includes(kind),
    })),
    servicesMinor: snapshot?.servicesMinor ?? null,
    discountMinor: snapshot?.discountMinor ?? null,
    vatMinor: snapshot?.vatMinor ?? null,
    totalMinor: snapshot?.totalMinor ?? null,
  };
}
