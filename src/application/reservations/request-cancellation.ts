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
import {
  guestCancellationEligibility,
  guestPhoneBlocked,
  guestReservationNotFound,
  guestTokenHash,
  invalidLink,
  invalidSession,
  manageTokenMatches,
  reservationForSession,
  sessionPhone,
  unlinkedReservationPhone,
  type SessionDependencies,
} from "./guest-reservation-reads";
import type {
  CancellationRequestStore,
  GuestCancellationRequest,
  ReservationRepository,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";

type Access =
  | Readonly<{ kind: "MANAGE_TOKEN"; token: string | null }>
  | Readonly<{
      kind: "GUEST_SESSION";
      token: string | null;
      reference: unknown;
    }>;

type LocatedReservation = Readonly<{
  reservation: StoredReservation;
  tokenHash: string;
}>;

export type RequestCancellationContext = Readonly<{
  reservations: Pick<ReservationRepository, "lockById">;
  guests: Pick<GuestRepository, "lockById" | "lockByPhone" | "findByPhone">;
  verifications: Pick<
    PhoneVerificationRepository,
    "findByTokenHash" | "lockPhone"
  >;
  branches: Pick<BranchRepository, "findRowById">;
  cancellationRequests: Pick<
    CancellationRequestStore,
    "findCurrent" | "create"
  >;
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

  private async locate(access: Access): Promise<Result<LocatedReservation>> {
    const tokenHash = guestTokenHash(this.deps.crypto, access.token);
    if (tokenHash === null)
      return access.kind === "MANAGE_TOKEN" ? invalidLink() : invalidSession();
    if (access.kind === "MANAGE_TOKEN") {
      const record = await this.deps.reader.findByManageTokenHash(tokenHash);
      if (
        !record ||
        !manageTokenMatches(record.stored, tokenHash, this.deps.clock.now())
      )
        return invalidLink();
      return success({ reservation: record.stored, tokenHash });
    }

    const phone = await sessionPhone(this.deps, tokenHash);
    if (!phone.ok) return phone;
    const record = await reservationForSession(
      this.deps.reader,
      phone.value,
      access.reference,
    );
    if (!record.ok) return record;
    return success({ reservation: record.value.stored, tokenHash });
  }

  async execute(
    access: Access,
    input: Readonly<{ reason?: string | undefined }>,
  ): Promise<Result<GuestCancellationRequest>> {
    const found = await this.locate(access);
    if (!found.ok) return found;
    const { reservation, tokenHash } = found.value;
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
      // Blocking and contact changes follow guest before reservation lock order.
      const unlinkedPhone = unlinkedReservationPhone(reservation);
      if (unlinkedPhone) {
        // A phone block must wait even if a profile for this number is
        // created after we look it up. Blocking takes this same lock first.
        const phoneLock = await context.verifications.lockPhone(unlinkedPhone);
        if (!phoneLock.ok) return phoneLock;
      }
      const guest =
        reservation.guestId !== null
          ? await context.guests.lockById(reservation.guestId)
          : unlinkedPhone
            ? await context.guests.lockByPhone(unlinkedPhone)
            : success(null);
      if (!guest.ok) return guest;
      const locked = await context.reservations.lockById(
        reservation.branchId,
        reservation.id,
      );
      if (!locked.ok) return locked;
      const current = locked.value;
      const now = this.deps.clock.now();

      if (access.kind === "MANAGE_TOKEN") {
        if (
          !current ||
          !manageTokenMatches(current, tokenHash, now) ||
          current.guestId !== reservation.guestId ||
          (current.guestId === null &&
            current.contact.phone !== reservation.contact.phone)
        )
          return invalidLink();
      } else {
        const phone = await sessionPhone(
          {
            guests: context.guests,
            verifications: context.verifications,
            clock: { now: () => now },
          },
          tokenHash,
        );
        if (!phone.ok) return phone;
        if (
          !current ||
          !guest.value ||
          current.guestId !== guest.value.id ||
          guest.value.phone !== phone.value.value
        )
          return guestReservationNotFound();
      }

      const branch = await context.branches.findRowById(current.branchId);
      if (!branch) throw new Error("The reservation has no branch.");
      const request = await context.cancellationRequests.findCurrent(
        current.id,
      );
      const { deadline, eligibility } = guestCancellationEligibility(
        current,
        branch,
        request,
        Boolean(guest.value?.blockedAt),
        now,
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
