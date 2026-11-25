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
import { parseGuestContact, PhoneNumber } from "@/domain/guests";
import {
  CancellationDeadline,
  canGuestChange,
  summarizeReservation,
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
import { manageTokenExpiry } from "./manage-token";
import type { ModifyReservationContext } from "./modify-reservation";
import type {
  BookingCrypto,
  CancellationRequestStore,
  ReservationContactPatch,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import type { RequestCancellationContext } from "./request-cancellation";
import {
  materializeChangedLines,
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
    cancellationRequests: Pick<CancellationRequestStore, "findCurrent">;
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
type ContactPatch = Pick<
  ReservationContactPatch,
  "fullName" | "email" | "specialRequests"
>;
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
  if (stored.paymentMethod !== "PAY_AT_HOTEL" || !stored.snapshot)
    return changeNotAllowed("STATUS");
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
): ContactPatch {
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
        ),
      });
    } catch (error) {
      return domainFailure(error);
    }
  }
}

function replacementLink(
  current: StoredReservation,
  contact: ContactPatch,
  stay: StayRange,
  now: Date,
  crypto: BookingCrypto,
) {
  const previousEmail =
    contact.email !== undefined ? current.contact.email : null;
  if (previousEmail !== null) {
    try {
      PhoneNumber.parse(current.contact.phone);
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return {
        previousEmail,
        token: null,
        manageAccess: { hash: null, expiresAt: null },
      };
    }
    const token = crypto.generateToken();
    return {
      previousEmail,
      token,
      manageAccess: {
        hash: crypto.sha256(token),
        expiresAt: manageTokenExpiry(stay.checkOut),
      },
    };
  }

  // Update expiry on an existing, still valid link after a checkout date change.
  if (
    current.stay.checkOut.compare(stay.checkOut) !== 0 &&
    current.manageTokenHash !== null &&
    current.manageTokenExpiresAt !== null &&
    current.manageTokenExpiresAt > now
  )
    return {
      previousEmail,
      token: null,
      manageAccess: {
        hash: current.manageTokenHash,
        expiresAt: manageTokenExpiry(stay.checkOut),
      },
    };
  return { previousEmail, token: null, manageAccess: undefined };
}

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
      const units = resolveLines(
        input.lines
          ? await this.deps.catalog.listRoomTypes(stored.branchId, "ALL")
          : [],
        stored,
        input,
      );
      if (!units.ok) return units;
      const lockSet = new Set(
        [...stored.lines, ...units.value].map((line) => line.roomTypeId),
      );
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
          const { snapshot, plan } = quote.value;
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
              ),
            });
          const lines = plan.structureChanged
            ? await materializeChangedLines(
                context,
                current,
                stay,
                quote.value,
                this.deps.ids,
              )
            : null;
          return success({
            accessRecord,
            current,
            now,
            snapshot,
            plan,
            contact,
            contactFields,
            lines,
            roomNames: Object.fromEntries(
              listings.map((listing) => [listing.id, listing.name]),
            ),
            link: replacementLink(
              current,
              contact,
              stay,
              now,
              this.deps.crypto,
            ),
          });
        },
        validate: success,
        mutate: async (context, state) => {
          const {
            current,
            now,
            snapshot,
            plan,
            contact,
            contactFields,
            lines,
            link,
            accessRecord,
            roomNames,
          } = state;
          const reservation = await context.reservations.replaceStay({
            branchId: current.branchId,
            reservationId: current.id,
            stay,
            lines,
            snapshot,
            guestContact: contact,
            ...(link.manageAccess ? { manageAccess: link.manageAccess } : {}),
            flagPmsUpdate: current.pmsEnteredAt !== null,
            at: now,
          });
          const before = summarizeReservation(current);
          const after = {
            ...summarizeReservation(
              reservation,
              plan.services.flatMap((service) =>
                !service.added && service.detailsChanged ? [service.kind] : [],
              ),
            ),
            contactFieldsChanged: contactFields,
          };
          await context.reservations.appendChange({
            id: this.deps.ids.next(),
            branchId: current.branchId,
            reservationId: current.id,
            kind: "STAY",
            actorType: "GUEST",
            actorId: current.guestId ?? current.id,
            before,
            after,
            oldTotalMinor: before.totalMinor,
            newTotalMinor: after.totalMinor,
            override: null,
            at: now,
          });
          await context.messages.enqueue(current.branchId, current.id, {
            kind: "reservation.modified",
            notifyGuest: true,
            previous: {
              checkIn: before.checkIn,
              checkOut: before.checkOut,
              totalMinor: before.totalMinor ?? 0,
            },
          });
          await context.messages.enqueue(current.branchId, current.id, {
            kind: "reservation.change-staff-alert",
            previous: {
              checkIn: before.checkIn,
              checkOut: before.checkOut,
              totalMinor: before.totalMinor ?? 0,
            },
          });
          if (link.previousEmail !== null) {
            await context.messages.enqueue(current.branchId, current.id, {
              kind: "reservation.email-changed",
              previousEmail: link.previousEmail,
              hotelPhone: accessRecord.branch.phone,
              hotelEmail: accessRecord.branch.email,
            });
          }
          if (link.token !== null) {
            await context.messages.enqueue(current.branchId, current.id, {
              kind: "reservation.manage-link",
              manageToken: link.token,
              whatsappOnly: true,
            });
          }
          return success({
            version: reservation.version,
            before,
            after,
            reservation: guestReservationView(
              { ...accessRecord, stored: reservation, roomNames },
              phone
                ? { kind: "GUEST_SESSION", phone }
                : { kind: "MANAGE_TOKEN", reservationId: reservation.id },
              now,
            ),
          });
        },
        audit: async (context, { current, now }, result) => {
          await context.audit.append(
            auditEvent({
              occurredAt: now,
              actorType: "GUEST",
              actorId: current.guestId ?? current.id,
              action: "reservation.stay-modified",
              entityType: "Reservation",
              entityId: current.id,
              branchId: current.branchId,
              reason: null,
              changes: {
                reference: current.reference.value,
                changeSeq: current.changeSeq + 1,
                before: result.before,
                after: result.after,
                oldTotalMinor: result.before.totalMinor,
                newTotalMinor: result.after.totalMinor,
                priceOverridden: false,
                overrideFromMinor: null,
                overrideToMinor: null,
                flagPmsUpdate: current.pmsEnteredAt !== null,
                guestNotified: true,
              },
            }),
          );
        },
      });
    } catch (error) {
      return domainFailure(error);
    }
  }
}
