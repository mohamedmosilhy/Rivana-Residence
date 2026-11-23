import { DomainValidationError } from "@/domain/shared/domain-error";

const MINUTE = 60_000;

function assertInstant(value: Date, path: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new DomainValidationError("The instant is invalid.", [
      { path, message: "Supply a valid UTC instant." },
    ]);
}

/** PY-2, PY-6, Q-60: hold length, gateway session length, and the per phone limit. */
export const HoldPolicy = Object.freeze({
  holdMinutes: 15,
  /** The session ends before the hold so a payment in progress finishes first. */
  sessionLeadMinutes: 2,
  maxOpenHoldsPerPhone: 1,

  holdExpiresAt(createdAt: Date): Date {
    assertInstant(createdAt, "createdAt");
    return new Date(createdAt.getTime() + HoldPolicy.holdMinutes * MINUTE);
  },
  sessionExpiresAt(holdExpiresAt: Date): Date {
    assertInstant(holdExpiresAt, "holdExpiresAt");
    return new Date(
      holdExpiresAt.getTime() - HoldPolicy.sessionLeadMinutes * MINUTE,
    );
  },
  /** A hold is over at its expiry instant, not after it. */
  isExpired(holdExpiresAt: Date, now: Date): boolean {
    assertInstant(holdExpiresAt, "holdExpiresAt");
    assertInstant(now, "now");
    return now.getTime() >= holdExpiresAt.getTime();
  },
  canOpenHold(openHoldsForPhone: number): boolean {
    if (!Number.isSafeInteger(openHoldsForPhone) || openHoldsForPhone < 0)
      throw new DomainValidationError("The hold count is invalid.", [
        {
          path: "openHoldsForPhone",
          message: "Supply a non-negative whole number.",
        },
      ]);
    return openHoldsForPhone < HoldPolicy.maxOpenHoldsPerPhone;
  },
});
