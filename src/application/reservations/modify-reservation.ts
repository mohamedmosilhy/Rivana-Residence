import { type StaffPrincipal, authorize } from "@/application/auth";
import { InventoryGuard } from "@/application/inventory";
import type { QueueReservationMessages } from "@/application/notifications";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  priceChanged,
  type Result,
  staleVersion,
  success,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  canModifyReservationStay,
  summarizeReservation,
  type ReservationChangePlan,
} from "@/domain/reservations";
import { parseRequestedServices } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

import type {
  ReservationUnitOfWork,
  StoredReservation,
  StoredReservationLine,
  StoredReservationSnapshot,
} from "./ports";
import {
  materializeChangedLines,
  quoteReservationChange,
  type ChangeQuoteReaders,
  type RequestedChange,
  type ChangePriceOverride,
} from "./reservation-change-quote";
import { manualNights, type Amounts } from "./staff-reservation-input";
import {
  findStaffReservation,
  staffReservationView,
  type StaffReservationReader,
  type StaffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

// Operational limit, as for S3: the public stay policy does not apply to staff.
const MAX_STAFF_STAY_NIGHTS = 366;

export type ModifyReservationContext = ReservationStorageContext &
  ChangeQuoteReaders &
  Readonly<{
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

export type ModifyReservationInput = Readonly<{
  stay: { checkIn: string; checkOut: string };
  lines: readonly {
    roomTypeId: string;
    occupancy: { adults: number; children: number };
  }[];
  services?: readonly unknown[] | undefined;
  acceptedTotal: { amountMinor: number; currency: "USD" };
  priceOverride?: { lines: readonly Amounts[]; reason: string } | undefined;
  notifyGuest?: boolean | undefined;
}>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<ModifyReservationContext>;
  reads: Pick<StaffReservationReader, "findVisible">;
  ids: IdGenerator;
  clock: Clock;
}>;

type Loaded = Readonly<{
  at: Date;
  locked: StoredReservation;
  plan: ReservationChangePlan;
  lines:
    | readonly Omit<StoredReservationLine, "stay" | "consumesInventory">[]
    | null;
  snapshot: StoredReservationSnapshot;
  originalTotalMinor: number;
}>;

const notFound = () => failure("NOT_FOUND", "This reservation was not found.");

function parseRequest(input: ModifyReservationInput): {
  requested: RequestedChange;
  override: ChangePriceOverride | null;
} {
  const stay = StayRange.create(
    LocalDate.parse(input.stay.checkIn),
    LocalDate.parse(input.stay.checkOut),
  );
  if (stay.nightCount > MAX_STAFF_STAY_NIGHTS)
    throw new DomainValidationError("Check the stay dates.", [
      {
        path: "stay.checkOut",
        message: `Use a stay of at most ${MAX_STAFF_STAY_NIGHTS} nights.`,
      },
    ]);
  if (input.lines.length < 1 || input.lines.length > 5)
    throw new DomainValidationError("Check the units.", [
      { path: "lines", message: "Choose one to five units." },
    ]);
  const lines = input.lines.map((line) => ({
    roomTypeId: line.roomTypeId,
    occupancy: Occupancy.create(line.occupancy),
  }));
  let override: ChangePriceOverride | null = null;
  if (input.priceOverride) {
    const reason = input.priceOverride.reason.trim();
    if (
      reason.length < 1 ||
      reason.length > 500 ||
      /[\p{Cc}\p{Cf}]/u.test(reason) ||
      input.priceOverride.lines.length !== lines.length
    )
      throw new DomainValidationError("Check the price override.", [
        {
          path: "priceOverride",
          message: "Supply a reason and nightly prices for every unit.",
        },
      ]);
    override = {
      nights: manualNights(
        stay,
        input.priceOverride.lines,
        "priceOverride.lines",
      ),
      reason,
    };
  }
  if (input.services === undefined)
    return { requested: { stay, lines }, override };
  const services = parseRequestedServices(input.services);
  if (!services.ok)
    throw new DomainValidationError("Check the services.", services.issues);
  return { requested: { stay, lines, services: services.value }, override };
}

function changedServiceDetails(plan: ReservationChangePlan) {
  return plan.services.flatMap((service) =>
    !service.added && service.detailsChanged ? [service.kind] : [],
  );
}

/**
 * Staff entry point of the shared change engine (Q-83). Every write happens
 * inside one `InventoryGuard` transaction. Lock order: listings by id
 * (old and new), then the reservation row. Availability and prices are read
 * only after those locks are held.
 */
export class ModifyReservation {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    input: ModifyReservationInput | Result<ModifyReservationInput>,
  ): Promise<Result<{ reservation: StaffReservationView }>> {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:modify",
    );
    if (!found.ok) return found;
    const { row, principal } = found.value;
    if (expectedVersion === null)
      return failure("PRECONDITION_REQUIRED", "Send an If-Match header.");
    const submitted = "ok" in input ? input : success(input);
    if (submitted.ok && submitted.value.priceOverride) {
      const allowed = authorize(principal, "pricing:override");
      if (!allowed.ok) return allowed;
    }
    // The version is checked before anything is planned, so a stale caller
    // always gets 412 and never a 422 about a request built on old state.
    if (row.version !== expectedVersion) return staleVersion(row.version);
    if (!submitted.ok) return submitted;
    const change = submitted.value;
    if (!canModifyReservationStay(row.status))
      return invalidTransition(
        row.status,
        "Only a confirmed reservation can be changed.",
      );
    try {
      const { requested, override } = parseRequest(change);
      // The unlocked read only decides which listings to lock. Everything
      // that matters is read again under the locks.
      const lockSet = [
        ...new Set([
          ...row.lines.map((line) => line.roomTypeId),
          ...requested.lines.map((line) => line.roomTypeId),
        ]),
      ];
      const result = await new InventoryGuard(this.deps.unitOfWork).execute({
        branchId: row.branchId,
        roomTypeIds: lockSet,
        load: (context) =>
          this.load(
            context,
            row.branchId,
            id,
            expectedVersion,
            lockSet,
            requested,
            override,
            change.acceptedTotal.amountMinor,
          ),
        validate: success,
        mutate: async (context, state) => {
          const stored = await context.reservations.replaceStay({
            branchId: row.branchId,
            reservationId: id,
            stay: requested.stay,
            lines: state.lines,
            snapshot: state.snapshot,
            flagPmsUpdate: state.locked.pmsEnteredAt !== null,
            at: state.at,
          });
          await context.reservations.appendChange({
            id: this.deps.ids.next(),
            branchId: row.branchId,
            reservationId: id,
            kind: "STAY",
            actorType: "STAFF",
            actorId: principal.id,
            before: summarizeReservation(state.locked),
            after: summarizeReservation(
              stored,
              changedServiceDetails(state.plan),
            ),
            oldTotalMinor: state.locked.snapshot?.totalMinor ?? null,
            newTotalMinor: state.snapshot.totalMinor,
            override: override
              ? {
                  fromMinor: state.originalTotalMinor,
                  toMinor: state.snapshot.totalMinor,
                  reason: override.reason,
                }
              : null,
            at: state.at,
          });
          if (change.notifyGuest)
            await context.messages.enqueue(row.branchId, id, {
              kind: "reservation.modified",
              notifyGuest: true,
              ...(state.locked.snapshot
                ? {
                    previous: {
                      checkIn: state.locked.stay.checkIn.value,
                      checkOut: state.locked.stay.checkOut.value,
                      totalMinor: state.locked.snapshot.totalMinor,
                    },
                  }
                : {}),
            });
          return success(stored);
        },
        audit: async (context, state, stored) => {
          await context.audit.append(
            auditEvent({
              occurredAt: state.at,
              actorType: "STAFF",
              actorId: principal.id,
              action: "reservation.stay-modified",
              entityType: "Reservation",
              entityId: id,
              branchId: row.branchId,
              reason: override?.reason ?? null,
              changes: {
                reference: stored.reference.value,
                changeSeq: stored.changeSeq,
                before: summarizeReservation(state.locked),
                after: summarizeReservation(
                  stored,
                  changedServiceDetails(state.plan),
                ),
                oldTotalMinor: state.locked.snapshot?.totalMinor ?? null,
                newTotalMinor: state.snapshot.totalMinor,
                priceOverridden: override !== null,
                overrideFromMinor: override ? state.originalTotalMinor : null,
                overrideToMinor: override ? state.snapshot.totalMinor : null,
                flagPmsUpdate: state.locked.pmsEnteredAt !== null,
                guestNotified: change.notifyGuest === true,
              },
            }),
          );
        },
      });
      if (!result.ok) return result;
      return success({
        reservation: staffReservationView(
          result.value,
          principal,
          result.value.updatedAt,
        ),
      });
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return invalid("Check the change.", error.issues);
    }
  }

  private async load(
    context: ModifyReservationContext,
    branchId: string,
    id: string,
    expectedVersion: number,
    lockedListings: readonly string[],
    requested: RequestedChange,
    override: ChangePriceOverride | null,
    acceptedTotalMinor: number,
  ): Promise<Result<Loaded>> {
    const locked = await context.reservations.lockById(branchId, id);
    if (!locked.ok) return locked;
    const current = locked.value;
    if (!current) return notFound();
    if (current.version !== expectedVersion)
      return staleVersion(current.version);
    if (!canModifyReservationStay(current.status))
      return invalidTransition(
        current.status,
        "Only a confirmed reservation can be changed.",
      );
    if (
      ![...current.lines, ...requested.lines].every((line) =>
        lockedListings.includes(line.roomTypeId),
      )
    )
      return failure("TRY_AGAIN", "The reservation changed. Try again.");
    const at = this.deps.clock.now();
    const evaluated = await quoteReservationChange(
      context,
      current,
      requested,
      at,
      { override },
    );
    if (!evaluated.ok) return evaluated;
    if (!evaluated.value.available)
      return { ok: false, error: evaluated.value.error };
    const { plan, snapshot, originalTotalMinor } = evaluated.value;
    if (acceptedTotalMinor !== snapshot.totalMinor)
      return priceChanged({
        totalMinor: snapshot.totalMinor,
        accommodationMinor: snapshot.accommodationMinor,
        servicesMinor: snapshot.servicesMinor,
        discountMinor: snapshot.discountMinor,
        vatMinor: snapshot.vatMinor,
      });
    const lines =
      plan.structureChanged || override
        ? await materializeChangedLines(
            context,
            current,
            requested.stay,
            evaluated.value,
            this.deps.ids,
          )
        : null;
    return success({
      at,
      locked: current,
      plan,
      lines,
      snapshot,
      originalTotalMinor,
    });
  }
}
