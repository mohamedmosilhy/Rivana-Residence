import {
  authorize,
  authorizeBranch,
  branchScope,
  type StaffPrincipal,
} from "@/application/auth";
import { InventoryGuard } from "@/application/inventory";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  success,
  type ApplicationError,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  parseRejectionReason,
  REQUEST_REASON_MAX,
} from "@/domain/reservations";
import { parseRequestedServices } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import { zonedLocalToUtc } from "@/domain/shared/zoned-time";
import { applyBookingChange } from "./apply-booking-change";
import type {
  ChangeRequestListQuery,
  ChangeRequestReader,
  ChangeRequestRecord,
} from "./change-request-ports";
import { lockBookingGuest } from "./guest-reservation-write-access";
import type { ModifyReservationContext } from "./modify-reservation";
import type { GuestChangeContext } from "./guest-reservation-changes";
import type {
  BookingCrypto,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import {
  quoteReservationChange,
  type AvailableReservationChange,
} from "./reservation-change-quote";
import { staffReservationView } from "./staff-reservation-reads";

const notFound = () =>
  failure("NOT_FOUND", "This change request was not found.");

export class ListChangeRequests {
  constructor(private readonly reader: Pick<ChangeRequestReader, "list">) {}

  async execute(staff: StaffPrincipal | null, query: ChangeRequestListQuery) {
    const access = query.branchId
      ? authorizeBranch(staff, "cancellations:decide", query.branchId)
      : authorize(staff, "cancellations:decide");
    if (!access.ok) return access;
    const scope = query.branchId ? [query.branchId] : branchScope(access.value);
    return success(await this.reader.list(scope, query));
  }
}

export type ChangeRequestDecisionContext = ModifyReservationContext &
  Pick<
    GuestChangeContext,
    | "verifications"
    | "changeRequests"
    | "branches"
    | "payments"
    | "cancellationRequests"
  >;

type RequestLocation = NonNullable<
  Awaited<ReturnType<ChangeRequestReader["locate"]>>
>;

async function lockOpenRequest(
  context: ChangeRequestDecisionContext,
  found: RequestLocation,
) {
  const locked = await context.reservations.lockById(
    found.branchId,
    found.reservationId,
  );
  if (!locked.ok) return locked;
  const reservation = locked.value;
  if (!reservation) return notFound();
  const request = await context.changeRequests.findById(found.id);
  if (!request || request.reservationId !== reservation.id) return notFound();
  return request.status === "OPEN"
    ? success({ reservation, request })
    : invalidTransition(
        request.status,
        "This request has already been decided or closed.",
      );
}

type ApprovalRecheck =
  | {
      kind: "READY";
      stay: StayRange;
      quote: AvailableReservationChange;
      branch: { phone: string | null; email: string | null };
    }
  | { kind: "CONFLICT"; error: ApplicationError };

const conflict = (error: ApplicationError): ApprovalRecheck => ({
  kind: "CONFLICT",
  error,
});

async function recheckApproval(
  context: ChangeRequestDecisionContext,
  reservation: StoredReservation,
  request: ChangeRequestRecord,
  lockedIds: ReadonlySet<string>,
  phoneBlocked: boolean,
  now: Date,
): Promise<ApprovalRecheck> {
  const invalidState = (message: string) =>
    conflict({
      code: "INVALID_TRANSITION",
      message,
      context: { status: reservation.status },
    });
  if (reservation.version !== request.reservationVersion)
    return conflict({
      code: "CONFLICT",
      message: "The booking changed after the guest submitted this request.",
    });
  if (
    reservation.status !== "CONFIRMED" ||
    reservation.paymentMethod !== "ONLINE" ||
    reservation.paymentStatus !== "PAID" ||
    (await context.cancellationRequests.findActive(reservation.id))
  )
    return invalidState(
      "This booking can no longer be changed through a request.",
    );
  if (phoneBlocked) return invalidState("The guest's phone is blocked.");
  const payment = await context.payments.findPaidPayment(reservation.id);
  if (payment?.amountMinor !== request.paidTotalMinor)
    return invalidState(
      "The successful payment for this request could not be confirmed.",
    );

  const branch = await context.branches.findRowById(reservation.branchId);
  if (!branch) throw new Error("The reservation has no branch.");
  const { requested } = request;
  const stay = StayRange.create(
    LocalDate.parse(requested.checkIn),
    LocalDate.parse(requested.checkOut),
  );
  const arrivalPassed = (date: LocalDate) => {
    const arrival = branch.checkInTime
      ? zonedLocalToUtc(`${date.value}T${branch.checkInTime}`, branch.timeZone)
      : null;
    return arrival === null || arrival <= now;
  };
  if (arrivalPassed(reservation.stay.checkIn) || arrivalPassed(stay.checkIn))
    return invalidState("The original or proposed check-in time has passed.");

  const hasLock = ({ roomTypeId }: { roomTypeId: string }) =>
    lockedIds.has(roomTypeId);
  if (!reservation.lines.every(hasLock) || !requested.lines.every(hasLock))
    return conflict({
      code: "TRY_AGAIN",
      message: "The booking changed. Try again.",
    });

  const services =
    requested.services && parseRequestedServices(requested.services);
  if (services && !services.ok)
    throw new Error("The stored change request has invalid services.");
  const result = await quoteReservationChange(
    context,
    reservation,
    {
      stay,
      lines: requested.lines.map(({ roomTypeId, adults, children }) => ({
        roomTypeId,
        occupancy: Occupancy.create({ adults, children }),
      })),
      services: services?.value,
    },
    now,
    {
      override: null,
      publicListings: true,
      contactChanged: Object.keys(requested.contact).length > 0,
    },
  );
  if (!result.ok) return conflict(result.error);
  if (!result.value.available) return conflict(result.value.error);
  if (result.value.snapshot.totalMinor !== request.previewTotalMinor)
    return conflict({
      code: "PRICE_CHANGED",
      message: "The price changed after the guest submitted this request.",
      context: { quote: { totalMinor: result.value.snapshot.totalMinor } },
    });
  return { kind: "READY", stay, quote: result.value, branch };
}

export class DecideChangeRequest {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<ChangeRequestDecisionContext>;
      reader: Pick<ChangeRequestReader, "locate">;
      reservations: Pick<
        ChangeRequestDecisionContext["reservations"],
        "findById"
      >;
      ids: IdGenerator;
      crypto: BookingCrypto;
      clock: Clock;
    }>,
  ) {}

  private async locate(staff: StaffPrincipal | null, id: string) {
    const access = authorize(staff, "cancellations:decide");
    if (!access.ok) return access;
    if (id.length === 0 || id.length > 32) return notFound();
    const found = await this.deps.reader.locate(id, branchScope(access.value));
    if (
      !found ||
      !authorizeBranch(access.value, "cancellations:decide", found.branchId).ok
    )
      return notFound();
    return success({ found, principal: access.value });
  }

  async approve(
    staff: StaffPrincipal | null,
    id: string,
    input: { note?: string | undefined },
  ) {
    const located = await this.locate(staff, id);
    if (!located.ok) return located;
    const { found, principal } = located.value;
    const note = input.note?.trim() || null;
    if (
      note &&
      (note.length > REQUEST_REASON_MAX || /[\p{Cc}\p{Cf}]/u.test(note))
    )
      return invalid("Check the note.", [
        { path: "note", message: "Use plain text of at most 500 characters." },
      ]);
    const original = await this.deps.reservations.findById(
      found.branchId,
      found.reservationId,
    );
    if (!original) return notFound();
    const ids = new Set([
      ...original.lines.map((line) => line.roomTypeId),
      ...found.requestedListingIds,
    ]);
    type Approved = ReturnType<typeof staffReservationView>;
    type Outcome =
      | { kind: "APPLIED"; reservation: Approved }
      | { kind: "CONFLICT"; error: ApplicationError };
    let loadedRequest = false;
    const result = await new InventoryGuard(this.deps.unitOfWork).execute({
      branchId: found.branchId,
      roomTypeIds: [...ids],
      prepare: async (context) => {
        const guest = await lockBookingGuest(context, original);
        return guest.ok
          ? success({ done: false, prepared: guest.value } as const)
          : guest;
      },
      load: async (context, guest) => {
        loadedRequest = true;
        const locked = await lockOpenRequest(context, found);
        if (!locked.ok) return locked;
        const { reservation, request } = locked.value;
        const now = this.deps.clock.now();
        let checked: ApprovalRecheck;
        try {
          checked = await recheckApproval(
            context,
            reservation,
            request,
            ids,
            Boolean(guest?.blockedAt),
            now,
          );
        } catch (error) {
          if (!(error instanceof DomainValidationError)) throw error;
          checked = conflict({
            code: "INVALID_TRANSITION",
            message: "The requested stay can no longer be applied.",
            context: { status: reservation.status },
          });
        }
        return success({ reservation, request, now, checked });
      },
      validate: success,
      mutate: async (
        context,
        { reservation, request, now, checked },
      ): Promise<Result<Outcome>> => {
        if (checked.kind === "CONFLICT") {
          await context.changeRequests.recordConflict(
            id,
            checked.error.code === "CONFLICT"
              ? "STALE_VERSION"
              : checked.error.code,
            now,
          );
          // A failed Result rolls back. Commit the conflict before returning
          // the HTTP error, without writing any part of the booking change.
          return success(checked);
        }
        const saved = await applyBookingChange(context, this.deps, {
          current: reservation,
          stay: checked.stay,
          quote: checked.quote,
          contact: request.requested.contact,
          branch: checked.branch,
          now,
          actor: { type: "STAFF", id: principal.id, changeRequestId: id },
        });
        await context.changeRequests.decide({
          id,
          staffId: principal.id,
          status: "APPROVED",
          at: now,
        });
        await context.audit.append(
          auditEvent({
            occurredAt: now,
            actorType: "STAFF",
            actorId: principal.id,
            action: "change-request.approved",
            entityType: "ChangeRequest",
            entityId: id,
            branchId: saved.branchId,
            reason: note,
            changes: {
              reservationId: saved.id,
              noteProvided: note !== null,
              paidTotalMinor: request.paidTotalMinor,
              newTotalMinor: checked.quote.snapshot.totalMinor,
            },
          }),
        );
        await context.messages.enqueue(saved.branchId, saved.id, {
          kind: "change-request.approved",
        });
        return success({
          kind: "APPLIED",
          reservation: staffReservationView(saved, principal, now),
        });
      },
      audit: async () => {},
    });
    // A deleted requested listing can make the listing lock itself fail.
    // Record that conflict under the reservation lock after rechecking OPEN.
    if (!result.ok && result.error.code === "NOT_FOUND" && !loadedRequest) {
      const recorded = await this.deps.unitOfWork.run(async (context) => {
        const locked = await lockOpenRequest(context, found);
        if (!locked.ok) return locked;
        await context.changeRequests.recordConflict(
          id,
          "NOT_FOUND",
          this.deps.clock.now(),
        );
        return success(undefined);
      });
      return recorded.ok ? result : recorded;
    }
    if (!result.ok) return result;
    if (result.value.kind === "CONFLICT")
      return { ok: false as const, error: result.value.error };
    const { reservation } = result.value;
    return success(reservation);
  }

  async reject(
    staff: StaffPrincipal | null,
    id: string,
    input: { reason: string },
  ) {
    const located = await this.locate(staff, id);
    if (!located.ok) return located;
    const { found, principal } = located.value;
    let reason: string;
    try {
      reason = parseRejectionReason(input.reason);
    } catch (error) {
      if (error instanceof DomainValidationError)
        return invalid(error.message, error.issues);
      throw error;
    }
    if (/[\p{Cc}\p{Cf}]/u.test(reason))
      return invalid("Check the reason.", [
        {
          path: "reason",
          message: "Use plain text without control characters.",
        },
      ]);

    return this.deps.unitOfWork.run(async (context) => {
      const locked = await lockOpenRequest(context, found);
      if (!locked.ok) return locked;
      const { reservation } = locked.value;
      const now = this.deps.clock.now();
      const rejected = await context.changeRequests.decide({
        id,
        staffId: principal.id,
        status: "REJECTED",
        reason,
        at: now,
      });
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "change-request.rejected",
          entityType: "ChangeRequest",
          entityId: id,
          branchId: reservation.branchId,
          reason: null,
          changes: { reservationId: reservation.id },
        }),
      );
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "change-request.rejected",
        reason,
      });
      return success({ request: rejected, branchId: reservation.branchId });
    });
  }
}
