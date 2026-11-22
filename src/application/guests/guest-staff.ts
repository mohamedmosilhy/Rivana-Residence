import type {
  GuestHistoryItem,
  GuestHistoryReader,
  AuditLog,
} from "@/application/audit";
import { authorize } from "@/application/auth/authorize";
import { branchScope } from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { PhoneNumber, parseGuestBlockReason } from "@/domain/guests";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type {
  GuestDetail,
  GuestDirectoryQuery,
  GuestDirectoryReader,
  GuestRepository,
  PhoneVerificationRepository,
} from "./ports";

// S50 to S53. A guest is one global phone identity (Q-29). Staff read every
// guest, but reservation counts and lists only cover the caller's branches.

const notFound = () => failure("NOT_FOUND", "This guest was not found.");

export type GuestView = GuestDetail &
  Readonly<{ history: readonly GuestHistoryItem[] }>;

export class ListGuests {
  constructor(private readonly reader: Pick<GuestDirectoryReader, "list">) {}

  async execute(staff: StaffPrincipal | null, query: GuestDirectoryQuery) {
    const access = authorize(staff, "guests:read");
    if (!access.ok) return access;
    const scope = branchScope(access.value);
    if (scope !== "ALL" && scope.length === 0)
      return success({
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
      });
    return success(await this.reader.list(scope, query));
  }
}

async function loadGuestView(
  reader: Pick<GuestDirectoryReader, "find">,
  history: GuestHistoryReader,
  staff: StaffPrincipal,
  id: string,
): Promise<Result<GuestView>> {
  const scope = branchScope(staff);
  // Same rule as the list and S2: a branch scoped role with no branches sees nothing.
  if (
    id.length === 0 ||
    id.length > 32 ||
    (scope !== "ALL" && scope.length === 0)
  )
    return notFound();
  const found = await reader.find(id, scope);
  if (!found) return notFound();
  return success({ ...found, history: await history.listForGuest(id) });
}

export class GetGuest {
  constructor(
    private readonly reader: Pick<GuestDirectoryReader, "find">,
    private readonly history: GuestHistoryReader,
  ) {}

  async execute(staff: StaffPrincipal | null, id: string) {
    const access = authorize(staff, "guests:read");
    if (!access.ok) return access;
    return loadGuestView(this.reader, this.history, access.value, id);
  }
}

export type ChangeGuestBlockContext = Readonly<{
  guests: GuestRepository;
  verifications: PhoneVerificationRepository;
  audit: AuditLog;
}>;

/**
 * S52 and S53. Lock order: the phone advisory lock, then the guest row, then
 * the verification rows. Code requests take the same order; confirmation and
 * booking start at the guest row, which is a prefix of it, so no cycle exists.
 * A block can therefore never land halfway through a booking or a code check.
 */
export class ChangeGuestBlock {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<ChangeGuestBlockContext>;
      reader: Pick<GuestDirectoryReader, "find">;
      history: GuestHistoryReader;
      clock: Clock;
    }>,
    private readonly mode: "BLOCK" | "UNBLOCK",
  ) {}

  async execute(staff: StaffPrincipal | null, id: string, rawReason: unknown) {
    const access = authorize(staff, "guests:block");
    if (!access.ok) return access;
    const principal = access.value;
    const scope = branchScope(principal);
    if (
      id.length === 0 ||
      id.length > 32 ||
      (scope !== "ALL" && scope.length === 0)
    )
      return notFound();
    let reason: string;
    try {
      reason = parseGuestBlockReason(rawReason);
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return invalid(
        error.message,
        error.issues.map((issue) => ({
          path: "reason",
          message: issue.message,
        })),
      );
    }
    // A block is global, but a branch scoped role can only act on guests it
    // can see: those with a reservation in its own branches.
    if (scope !== "ALL" && !(await this.deps.reader.find(id, scope)))
      return notFound();
    const done = await this.deps.unitOfWork.run(async (context) => {
      const known = await context.guests.findById(id);
      if (!known) return notFound();
      const phone = PhoneNumber.parse(known.phone);
      const phoneLock = await context.verifications.lockPhone(phone);
      if (!phoneLock.ok) return phoneLock;
      const locked = await context.guests.lockById(id);
      if (!locked.ok) return locked;
      const guest = locked.value;
      // The phone was read before its lock; it never changes, but check anyway.
      if (!guest || guest.phone !== known.phone) return notFound();
      const blocked = guest.blockedAt !== null;
      // Repeating the same change is a no-op, so one decision writes one audit row.
      if (blocked === (this.mode === "BLOCK")) return success(false);
      const at = this.deps.clock.now();
      if (this.mode === "BLOCK") {
        await context.guests.setBlocked({ id, by: principal.id, reason, at });
        const invalidated = await context.verifications.invalidateOpenForPhone(
          phone,
          at,
        );
        await context.audit.append(
          auditEvent({
            occurredAt: at,
            actorType: "STAFF",
            actorId: principal.id,
            action: "guest.blocked",
            entityType: "Guest",
            entityId: id,
            branchId: null,
            reason,
            changes: { verificationsInvalidated: invalidated },
          }),
        );
      } else {
        await context.guests.clearBlocked({ id, at });
        await context.audit.append(
          auditEvent({
            occurredAt: at,
            actorType: "STAFF",
            actorId: principal.id,
            action: "guest.unblocked",
            entityType: "Guest",
            entityId: id,
            branchId: null,
            reason,
            changes: {},
          }),
        );
      }
      return success(true);
    });
    if (!done.ok) return done;
    return loadGuestView(this.deps.reader, this.deps.history, principal, id);
  }
}
