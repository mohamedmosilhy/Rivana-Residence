import type { PaymentCallbackStore } from "@/application/payments";
import type { BranchRepository } from "@/application/branches";
import {
  InventoryGuard,
  type AvailabilityCatalog,
} from "@/application/inventory";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  priceChanged,
  rateLimited,
  staleVersion,
  success,
  type ApplicationError,
  type ChangeNotAllowedError,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { parseGuestContact } from "@/domain/guests";
import {
  CancellationDeadline,
  canGuestChange,
  decideChangeApplication,
} from "@/domain/reservations";
import { parseRequestedServices } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { validatePublicStay } from "@/domain/shared/stay-policy";
import { StayRange } from "@/domain/shared/stay-range";
import { localDateAt } from "@/domain/shared/zoned-time";
import {
  locateGuestReservation,
  lockBookingGuest,
  lockGuestBooking,
  type GuestReservationAccess,
} from "./guest-reservation-write-access";
import {
  guestReservationView,
  sessionPhone,
  type GuestReservationRecord,
  type SessionDependencies,
} from "./guest-reservation-reads";
import {
  guestChangePreview,
  type GuestChangeListing,
} from "./guest-change-preview";
import {
  applyBookingChange,
  type ChangeContactPatch,
} from "./apply-booking-change";
import type {
  ChangeRequestStore,
  GuestChangeRequest,
  RequestedGuestChange,
} from "./change-request-ports";
import type { ModifyReservationContext } from "./modify-reservation";
import type {
  BookingCrypto,
  CancellationRequestStore,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import type { RequestCancellationContext } from "./request-cancellation";
import {
  quoteReservationChange,
  type AvailableReservationChange,
  type ChangeQuoteReaders,
} from "./reservation-change-quote";

const DAY_MS = 86_400_000;
const MAX_GUEST_CHANGES = 5;

type ChangeCatalog = Omit<AvailabilityCatalog, "listRoomTypes"> & {
  listRoomTypes(
    branchId: string,
    scope: "ALL" | "PUBLISHED",
  ): Promise<readonly GuestChangeListing[]>;
};
type PreviewReaders = Omit<ChangeQuoteReaders, "catalog"> & {
  catalog: ChangeCatalog;
};
export type GuestChangeContext = Omit<ModifyReservationContext, "catalog"> &
  PreviewReaders &
  Pick<RequestCancellationContext, "verifications"> & {
    branches: Pick<BranchRepository, "findRowById">;
    cancellationRequests: Pick<
      CancellationRequestStore,
      "findCurrent" | "findActive"
    >;
    changeRequests: ChangeRequestStore;
    payments: Pick<PaymentCallbackStore, "findPaidPayment">;
  };

export type GuestChangeInput = Readonly<{
  stay?: { checkIn: string; checkOut: string } | undefined;
  lines?:
    | readonly {
        roomSlug: string;
        occupancy: { adults: number; children: number };
      }[]
    | undefined;
  services?: readonly unknown[] | undefined;
  guest?:
    | {
        fullName?: string | undefined;
        email?: string | undefined;
        specialRequests?: string | undefined;
      }
    | undefined;
}>;
export type ApplyGuestChangeInput = GuestChangeInput & {
  expectedTotal: { currency: "USD"; amountMinor: number };
};
type PreviewDependencies = SessionDependencies & { readers: PreviewReaders };
type ApplyDependencies = SessionDependencies & {
  catalog: ChangeCatalog;
  unitOfWork: ReservationUnitOfWork<GuestChangeContext>;
  ids: IdGenerator;
  crypto: BookingCrypto;
  clock: Clock;
};
type ChangeReason = ChangeNotAllowedError["context"]["reason"];

function changeNotAllowed(
  reason: ChangeReason,
  info?: Pick<ChangeNotAllowedError["context"], "deadline" | "branch">,
): Result<never> {
  return {
    ok: false,
    error: {
      code: "CHANGE_NOT_ALLOWED",
      message: "Please contact the hotel about changing this reservation.",
      context: { reason, ...info },
    },
  };
}

function guestAccessError(error: ApplicationError): Result<never> {
  return error.code === "PHONE_BLOCKED"
    ? changeNotAllowed("PHONE_BLOCKED")
    : { ok: false, error };
}

function requestedStay(current: StoredReservation, input: GuestChangeInput) {
  return input.stay
    ? StayRange.create(
        LocalDate.parse(input.stay.checkIn),
        LocalDate.parse(input.stay.checkOut),
      )
    : current.stay;
}

function checkEligibility(
  record: GuestReservationRecord,
  stay: StayRange,
  now: Date,
) {
  const { stored, cancellationTiming, currentCancellationRequest } = record;
  if (record.phoneBlocked) return changeNotAllowed("PHONE_BLOCKED");
  if (!stored.snapshot) return changeNotAllowed("STATUS");
  const currentDeadline = CancellationDeadline.for(
    cancellationTiming,
    stored.stay.checkIn,
  );
  const newDeadline = CancellationDeadline.for(
    cancellationTiming,
    stay.checkIn,
  );
  const deadline =
    currentDeadline && newDeadline
      ? new Date(Math.min(currentDeadline.getTime(), newDeadline.getTime()))
      : null;
  const decision = canGuestChange({
    reservationStatus: stored.status,
    paymentStatus: stored.paymentStatus,
    requestStatuses: currentCancellationRequest
      ? [currentCancellationRequest.status]
      : [],
    changeRequestOpen: record.currentChangeRequest?.status === "OPEN",
    cancellationRequestActive: record.cancellationRequestActive,
    phoneBlocked: record.phoneBlocked,
    now,
    currentDeadline,
    newDeadline,
  });
  if (!decision.allowed) {
    switch (decision.code) {
      case "PHONE_BLOCKED":
        return changeNotAllowed("PHONE_BLOCKED");
      case "REQUEST_ALREADY_OPEN":
      case "REFUND_IN_PROGRESS":
        return changeNotAllowed("REQUEST_OPEN");
      case "NOT_CONFIRMED":
        return changeNotAllowed("STATUS");
      case "DEADLINE_PASSED":
        return changeNotAllowed("DEADLINE_PASSED", {
          deadline: deadline?.toISOString() ?? null,
          branch: record.branch,
        });
    }
  }
  if (stored.paymentMethod === "ONLINE" && record.paidTotalMinor === null)
    return changeNotAllowed("STATUS");
  // Only changed dates use the public horizon. An existing long staff stay can
  // still receive a contact correction without altering the dates.
  if (
    stored.stay.checkIn.compare(stay.checkIn) !== 0 ||
    stored.stay.checkOut.compare(stay.checkOut) !== 0
  ) {
    const issues = validatePublicStay(
      stay,
      localDateAt(now, cancellationTiming.timeZone),
    );
    if (issues.length)
      return invalid(
        "Check the stay dates.",
        issues.map((issue) => ({ ...issue, path: `stay.${issue.path}` })),
      );
  }
  return success({
    deadline: deadline!.toISOString(),
    current: stored.snapshot,
  });
}

function resolveLines(
  listings: readonly GuestChangeListing[],
  current: StoredReservation,
  input: GuestChangeInput,
) {
  if (!input.lines) return success(current.lines);
  const bySlug = new Map(listings.map((listing) => [listing.slug, listing]));
  const lines = [];
  for (const line of input.lines) {
    const listing = bySlug.get(line.roomSlug);
    if (!listing) return failure("NOT_FOUND", "This listing was not found.");
    lines.push({
      roomTypeId: listing.id,
      occupancy: Occupancy.create(line.occupancy),
    });
  }
  return success(lines);
}

function guestContactPatch(
  current: StoredReservation,
  input: GuestChangeInput,
): ChangeContactPatch {
  const { guest } = input;
  if (!guest) return {};
  try {
    const contact = parseGuestContact({
      fullName: guest.fullName ?? current.contact.fullName,
      email: guest.email,
      specialRequests: guest.specialRequests,
    });
    return {
      ...(guest.fullName !== undefined &&
      contact.fullName !== current.contact.fullName
        ? { fullName: contact.fullName }
        : {}),
      ...(guest.email !== undefined && contact.email !== current.contact.email
        ? { email: contact.email }
        : {}),
      ...(guest.specialRequests !== undefined &&
      contact.specialRequests !== current.contact.specialRequests
        ? { specialRequests: contact.specialRequests }
        : {}),
    };
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    throw new DomainValidationError(
      error.message,
      error.issues.map((issue) => ({ ...issue, path: `guest.${issue.path}` })),
    );
  }
}

function domainFailure(error: unknown): Result<never> {
  if (!(error instanceof DomainValidationError)) throw error;
  return invalid("Check the change.", error.issues);
}

function proposedQuote(stay: StayRange, quote: AvailableReservationChange) {
  return {
    stay,
    snapshot: quote.snapshot,
    lines: quote.plan.lines.map((line, index) => ({
      roomTypeId: line.roomTypeId,
      occupancy: line.occupancy,
      nights: quote.pricedLines[index]!,
      accommodationMinor: quote.subtotals[index]!,
    })),
  };
}

export class PreviewGuestChange {
  constructor(private readonly deps: PreviewDependencies) {}

  async execute(
    access: GuestReservationAccess,
    submitted: Result<GuestChangeInput>,
  ) {
    const found = await locateGuestReservation(this.deps, access);
    if (!found.ok) return guestAccessError(found.error);
    if (!submitted.ok) return submitted;
    const { record, tokenHash } = found.value;
    if (access.kind === "GUEST_SESSION") {
      const session = await sessionPhone(this.deps, tokenHash);
      if (!session.ok) return guestAccessError(session.error);
    }

    try {
      const input = submitted.value;
      const now = this.deps.clock.now();
      const stay = requestedStay(record.stored, input);
      const checked = checkEligibility(record, stay, now);
      if (!checked.ok) return checked;
      const listings = await this.deps.readers.catalog.listRoomTypes(
        record.stored.branchId,
        "ALL",
      );
      const units = resolveLines(listings, record.stored, input);
      if (!units.ok) return units;
      const services =
        input.services === undefined
          ? null
          : parseRequestedServices(input.services);
      if (services && !services.ok)
        return invalid("Check the services.", services.issues);
      const result = await quoteReservationChange(
        this.deps.readers,
        record.stored,
        { stay, lines: units.value, services: services?.value },
        now,
        {
          override: null,
          publicListings: true,
          contactChanged:
            Object.keys(guestContactPatch(record.stored, input)).length > 0,
        },
      );
      if (!result.ok) return result;
      const { current, deadline } = checked.value;
      return success({
        version: record.stored.version,
        preview: guestChangePreview(
          record.stored,
          current,
          result.value.available ? proposedQuote(stay, result.value) : null,
          new Map(listings.map((listing) => [listing.id, listing])),
          deadline,
          result.value.available ? [] : result.value.unavailableLines,
          record.paidTotalMinor,
        ),
      });
    } catch (error) {
      return domainFailure(error);
    }
  }
}

type AppliedGuestChange =
  | {
      kind: "APPLIED";
      version: number;
      reservation: ReturnType<typeof guestReservationView>;
    }
  | { kind: "REQUESTED"; version: number; request: GuestChangeRequest };

export class ApplyGuestChange {
  constructor(private readonly deps: ApplyDependencies) {}

  async execute(
    access: GuestReservationAccess,
    expectedVersion: number | null,
    submitted: Result<ApplyGuestChangeInput>,
  ) {
    const found = await locateGuestReservation(this.deps, access);
    if (!found.ok) return guestAccessError(found.error);
    const { record, phone } = found.value;
    const { stored } = record;
    if (expectedVersion === null)
      return failure("PRECONDITION_REQUIRED", "Send an If-Match header.");
    if (stored.version !== expectedVersion) return staleVersion(stored.version);
    if (!submitted.ok) return submitted;
    const input = submitted.value;

    try {
      const stay = requestedStay(stored, input);
      const checked = checkEligibility(record, stay, this.deps.clock.now());
      if (!checked.ok) return checked;
      // Use the expected total only to choose the lock path. The server
      // rechecks both totals under the booking lock before writing anything.
      const requestOnly =
        record.paidTotalMinor !== null &&
        input.expectedTotal.amountMinor !== record.paidTotalMinor;
      const lockSet = new Set<string>();
      if (!requestOnly) {
        const units = resolveLines(
          input.lines
            ? await this.deps.catalog.listRoomTypes(stored.branchId, "ALL")
            : [],
          stored,
          input,
        );
        if (!units.ok) return units;
        for (const line of [...stored.lines, ...units.value])
          lockSet.add(line.roomTypeId);
      }
      const services =
        input.services === undefined
          ? null
          : parseRequestedServices(input.services);
      if (services && !services.ok)
        return invalid("Check the services.", services.issues);

      return await new InventoryGuard(this.deps.unitOfWork).execute({
        branchId: stored.branchId,
        roomTypeIds: [...lockSet],
        prepare: async (context) => {
          const guest = await lockBookingGuest(context, stored);
          return guest.ok
            ? success({ done: false, prepared: guest.value } as const)
            : guest;
        },
        load: async (context, guest) => {
          const locked = await lockGuestBooking(
            context,
            found.value,
            guest,
            this.deps.clock,
          );
          if (!locked.ok) return guestAccessError(locked.error);
          const { current, now } = locked.value;
          if (current.version !== expectedVersion)
            return staleVersion(current.version);
          const branch = await context.branches.findRowById(current.branchId);
          if (!branch) throw new Error("The reservation has no branch.");
          const paidPayment =
            current.paymentMethod === "ONLINE" &&
            current.paymentStatus === "PAID"
              ? await context.payments.findPaidPayment(current.id)
              : null;
          const accessRecord = {
            ...record,
            stored: current,
            branch: {
              name: branch.name,
              slug: branch.slug,
              phone: branch.phone,
              email: branch.email,
            },
            cancellationTiming: branch,
            phoneBlocked: Boolean(guest?.blockedAt),
            currentCancellationRequest:
              await context.cancellationRequests.findCurrent(current.id),
            cancellationRequestActive:
              (await context.cancellationRequests.findActive(current.id)) !==
              null,
            currentChangeRequest: await context.changeRequests.findCurrent(
              current.id,
            ),
            paidTotalMinor: paidPayment?.amountMinor ?? null,
          };
          const eligibility = checkEligibility(accessRecord, stay, now);
          if (!eligibility.ok) return eligibility;

          const recent = await context.reservations.recentGuestChanges(
            current.id,
            new Date(now.getTime() - DAY_MS),
            MAX_GUEST_CHANGES,
          );
          if (recent.length === MAX_GUEST_CHANGES)
            return rateLimited(
              "This reservation has reached its daily change limit.",
              (recent[MAX_GUEST_CHANGES - 1]!.getTime() +
                DAY_MS -
                now.getTime()) /
                1000,
            );

          const listings = await context.catalog.listRoomTypes(
            current.branchId,
            "ALL",
          );
          const resolved = resolveLines(listings, current, input);
          if (!resolved.ok) return resolved;
          if (
            !requestOnly &&
            ![...current.lines, ...resolved.value].every((line) =>
              lockSet.has(line.roomTypeId),
            )
          )
            return failure("TRY_AGAIN", "The reservation changed. Try again.");
          const contact = guestContactPatch(current, input);
          const contactFields = Object.keys(contact);
          const quote = await quoteReservationChange(
            context,
            current,
            { stay, lines: resolved.value, services: services?.value },
            now,
            {
              override: null,
              publicListings: true,
              contactChanged: contactFields.length > 0,
            },
          );
          if (!quote.ok) return quote;
          if (!quote.value.available)
            return {
              ok: false,
              error: {
                ...quote.value.error,
                context: {
                  firstUnavailableNight:
                    quote.value.error.context.firstUnavailableNight,
                },
              },
            } as const;
          const { snapshot } = quote.value;
          if (snapshot.totalMinor !== input.expectedTotal.amountMinor)
            return priceChanged({
              totalMinor: snapshot.totalMinor,
              preview: guestChangePreview(
                current,
                eligibility.value.current,
                proposedQuote(stay, quote.value),
                new Map(listings.map((listing) => [listing.id, listing])),
                eligibility.value.deadline,
                [],
                accessRecord.paidTotalMinor,
              ),
            });
          return success({
            accessRecord,
            current,
            now,
            quote: quote.value,
            oldTotalMinor: eligibility.value.current.totalMinor,
            contact,
            listings,
          });
        },
        validate: success,
        mutate: async (
          context,
          {
            current,
            now,
            quote,
            oldTotalMinor,
            contact,
            accessRecord,
            listings,
          },
        ): Promise<Result<AppliedGuestChange>> => {
          const { paidTotalMinor } = accessRecord;
          if (
            paidTotalMinor !== null &&
            decideChangeApplication({
              paymentMethod: current.paymentMethod,
              paidTotalMinor,
              newTotalMinor: quote.snapshot.totalMinor,
            }) === "REQUEST_APPROVAL"
          ) {
            const requested: RequestedGuestChange = {
              checkIn: stay.checkIn.value,
              checkOut: stay.checkOut.value,
              lines: quote.plan.lines.map(({ roomTypeId, occupancy }) => ({
                roomTypeId,
                adults: occupancy.adults,
                children: occupancy.children,
              })),
              ...(services
                ? {
                    services: services.value.map(
                      ({ kind, vehicles, details }) => ({
                        kind,
                        ...(vehicles !== undefined ? { vehicles } : {}),
                        ...(details !== undefined ? { details } : {}),
                      }),
                    ),
                  }
                : {}),
              contact,
            };
            const request = await context.changeRequests.create({
              id: this.deps.ids.next(),
              reservationId: current.id,
              reservationVersion: current.version,
              requested,
              requestedSummary: {
                checkIn: requested.checkIn,
                checkOut: requested.checkOut,
                units: requested.lines,
                services: quote.snapshot.serviceLines.map(
                  ({ kind, vehicles }) => ({ kind, vehicles }),
                ),
                contactFieldsChanged: Object.keys(contact),
              },
              oldTotalMinor,
              paidTotalMinor,
              previewTotalMinor: quote.snapshot.totalMinor,
              at: now,
            });
            await context.audit.append(
              auditEvent({
                occurredAt: now,
                actorType: "GUEST",
                actorId: current.guestId ?? current.id,
                action: "change-request.created",
                entityType: "ChangeRequest",
                entityId: request.id,
                branchId: current.branchId,
                reason: null,
                changes: {
                  reservationId: current.id,
                  access: access.kind,
                  previewTotalMinor: request.previewTotalMinor,
                },
              }),
            );
            await context.messages.enqueue(current.branchId, current.id, {
              kind: "change-request.received",
            });
            await context.messages.enqueue(current.branchId, current.id, {
              kind: "request.staff-alert",
              requestKind: "CHANGE",
            });
            return success({
              kind: "REQUESTED",
              request,
              version: current.version,
            });
          }
          if (requestOnly)
            return failure(
              "TRY_AGAIN",
              "The payment changed. Preview the change again.",
            );
          const reservation = await applyBookingChange(context, this.deps, {
            current,
            stay,
            quote,
            contact,
            branch: accessRecord.branch,
            now,
            actor: { type: "GUEST", id: current.guestId ?? current.id },
          });
          return success({
            kind: "APPLIED",
            version: reservation.version,
            reservation: guestReservationView(
              {
                ...accessRecord,
                stored: reservation,
                roomNames: Object.fromEntries(
                  listings.map((listing) => [listing.id, listing.name]),
                ),
              },
              phone
                ? { kind: "GUEST_SESSION", phone }
                : { kind: "MANAGE_TOKEN", reservationId: reservation.id },
              now,
            ),
          });
        },
        // The shared apply step and the request creation record their own audit rows.
        audit: async () => {},
      });
    } catch (error) {
      return domainFailure(error);
    }
  }
}
