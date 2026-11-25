import type { AuditLog } from "@/application/audit";
import type { BranchRepository } from "@/application/branches";
import type {
  GuestRepository,
  PhoneVerificationRepository,
} from "@/application/guests";
import type { QueueReservationMessages } from "@/application/notifications";
import type { IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { REQUEST_REASON_MAX } from "@/domain/reservations";
import type { ChangeRequestStore } from "./change-request-ports";
import {
  guestCancellationEligibility,
  guestPhoneBlocked,
  type SessionDependencies,
} from "./guest-reservation-reads";
import {
  locateGuestReservation,
  lockBookingGuest,
  lockGuestBooking,
  type GuestReservationAccess,
} from "./guest-reservation-write-access";
import type {
  CancellationRequestStore,
  GuestCancellationRequest,
  ReservationRepository,
  ReservationUnitOfWork,
} from "./ports";

export type RequestCancellationContext = Readonly<{
  reservations: Pick<ReservationRepository, "lockById">;
  guests: Pick<GuestRepository, "lockById" | "lockByPhone" | "findByPhone">;
  verifications: Pick<
    PhoneVerificationRepository,
    "findByTokenHash" | "lockPhone"
  >;
  branches: Pick<BranchRepository, "findRowById">;
  cancellationRequests: Pick<CancellationRequestStore, "findActive" | "create">;
  changeRequests: Pick<ChangeRequestStore, "findCurrent">;
  audit: AuditLog;
  messages: Pick<QueueReservationMessages, "enqueue">;
}>;

export class RequestCancellation {
  constructor(
    private readonly deps: SessionDependencies &
      Readonly<{
        unitOfWork: ReservationUnitOfWork<RequestCancellationContext>;
        ids: IdGenerator;
      }>,
  ) {}

  async execute(
    access: GuestReservationAccess,
    input: Readonly<{ reason?: string | undefined }>,
  ): Promise<Result<GuestCancellationRequest>> {
    const found = await locateGuestReservation(this.deps, access);
    if (!found.ok) return found;
    const reason = input.reason?.trim() || null;
    if (
      reason &&
      (reason.length > REQUEST_REASON_MAX || /[\p{Cc}\p{Cf}]/u.test(reason))
    )
      return invalid("Check the reason.", [
        {
          path: "reason",
          message: `Use plain text of at most ${REQUEST_REASON_MAX} characters.`,
        },
      ]);

    return this.deps.unitOfWork.run(async (context) => {
      const guest = await lockBookingGuest(context, found.value.record.stored);
      if (!guest.ok) return guest;
      const locked = await lockGuestBooking(
        context,
        found.value,
        guest.value,
        this.deps.clock,
      );
      if (!locked.ok) return locked;
      const { current, now } = locked.value;

      const branch = await context.branches.findRowById(current.branchId);
      if (!branch) throw new Error("The reservation has no branch.");
      const cancellation = await context.cancellationRequests.findActive(
        current.id,
      );
      const change = await context.changeRequests.findCurrent(current.id);
      const { deadline, eligibility } = guestCancellationEligibility(
        current,
        branch,
        null,
        Boolean(guest.value?.blockedAt),
        now,
        {
          changeRequestOpen: change?.status === "OPEN",
          cancellationRequestActive: cancellation !== null,
        },
      );
      if (!eligibility.allowed) {
        switch (eligibility.code) {
          case "DEADLINE_PASSED":
            return {
              ok: false,
              error: {
                code: "CANCELLATION_WINDOW_CLOSED",
                message:
                  "Please contact the hotel about cancelling this reservation.",
                context: {
                  deadline: deadline?.toISOString() ?? null,
                  branch: {
                    name: branch.name,
                    slug: branch.slug,
                    phone: branch.phone,
                    email: branch.email,
                  },
                },
              },
            };
          case "REQUEST_ALREADY_OPEN":
            return failure(
              "CANCELLATION_REQUEST_EXISTS",
              "This reservation already has an active request.",
            );
          case "PHONE_BLOCKED":
            return guestPhoneBlocked();
          case "REFUND_IN_PROGRESS":
            return invalidTransition(
              current.status,
              "This reservation is awaiting a refund.",
            );
          case "NOT_CONFIRMED":
            return invalidTransition(
              current.status,
              "Only a confirmed reservation can have a cancellation request.",
            );
        }
      }

      const created = await context.cancellationRequests.create({
        id: this.deps.ids.next(),
        reservationId: current.id,
        guestReason: reason,
        at: now,
      });
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "GUEST",
          actorId: current.guestId ?? current.id,
          action: "cancellation-request.created",
          entityType: "CancellationRequest",
          entityId: created.id,
          branchId: current.branchId,
          reason: null,
          changes: {
            reservationId: current.id,
            access: access.kind,
            ...(found.value.session
              ? { sessionChannel: found.value.session.channel }
              : {}),
            actorIdentity:
              current.guestId === null ? "RESERVATION_LINK" : "GUEST_PROFILE",
            reasonProvided: reason !== null,
          },
        }),
      );
      await context.messages.enqueue(current.branchId, current.id, {
        kind: "cancellation-request.received",
      });
      await context.messages.enqueue(current.branchId, current.id, {
        kind: "request.staff-alert",
      });
      return success(created);
    });
  }
}
