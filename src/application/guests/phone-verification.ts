import {
  PhoneNumber,
  checkVerificationRequest,
  confirmVerificationCode,
  verificationCodeExpiresAt,
  VERIFICATION_POLICY,
} from "@/domain/guests";
import type {
  VerificationCodeEmail,
  WhatsAppSender,
} from "@/application/notifications";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  rateLimited,
  success,
  type Result,
  type ApplicationError,
} from "@/application/shared/result";
import type {
  GuestRepository,
  PhoneVerificationCrypto,
  PhoneVerificationRepository,
  VerificationChannelReadiness,
} from "./ports";
import {
  parseVerificationConfirmation,
  parseVerificationRequest,
} from "./phone-verification-input";

export type VerificationContext = Readonly<{
  guests: GuestRepository;
  verifications: PhoneVerificationRepository;
}>;
type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<VerificationContext>;
  verifications: PhoneVerificationRepository;
  crypto: PhoneVerificationCrypto | null;
  clock: Clock;
  ids: IdGenerator;
}>;
export type VerificationRequestView = Readonly<{
  verificationId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}>;
export type VerificationTokenView = Readonly<{
  token: string;
  expiresAt: Date;
}>;

const blocked = () =>
  failure("PHONE_BLOCKED", "Please contact the hotel to continue.");
const expired = () =>
  failure("VERIFICATION_EXPIRED", "Request a new verification code.");
const unavailable = (): Result<never> => ({
  ok: false,
  error: {
    code: "VERIFICATION_UNAVAILABLE",
    message: "The code could not be delivered. Please try again shortly.",
    retryAfterSeconds: 60,
  },
});

/** Public callers must not learn which internal record was busy. */
function guestLockFailure(
  result: Readonly<{ ok: false; error: ApplicationError }>,
): Result<never> {
  return result.error.code === "TRY_AGAIN"
    ? failure("TRY_AGAIN", "Verification is busy. Please try again shortly.")
    : result;
}

/** The stricter of two rolling limit outcomes; a block always wins. */
function combineLimits(
  ...outcomes: ReturnType<typeof checkVerificationRequest>[]
): ReturnType<typeof checkVerificationRequest> {
  const refused = outcomes.filter((outcome) => !outcome.allowed);
  if (refused.length === 0) return { allowed: true };
  const blockedOutcome = refused.find(
    (outcome) => outcome.code === "PHONE_BLOCKED",
  );
  if (blockedOutcome) return blockedOutcome;
  return {
    allowed: false,
    code: "RATE_LIMITED",
    retryAfterSeconds: Math.max(
      ...refused.map((outcome) => outcome.retryAfterSeconds ?? 0),
    ),
  };
}

/**
 * P9. Sends a code by WhatsApp (M8) or, when the guest asks, by email (ADR 031).
 * An email code proves the email only: the phone stays a claimed contact.
 */
export class RequestPhoneVerification {
  constructor(
    private readonly deps: Dependencies &
      Readonly<{
        channels: VerificationChannelReadiness;
        sender: WhatsAppSender;
        emailSender: VerificationCodeEmail;
      }>,
  ) {}

  async execute(
    input: unknown,
    clientKey: string,
  ): Promise<Result<VerificationRequestView>> {
    const parsed = parseVerificationRequest(input);
    if (!parsed.ok) return parsed;
    const { phone, purpose, channel, email } = parsed.value;
    if (!(await this.deps.channels.isReady(channel)))
      return channel === "WHATSAPP"
        ? failure(
            "WHATSAPP_NOT_CONFIGURED",
            "Please contact the hotel to book.",
          )
        : failure("EMAIL_NOT_CONFIGURED", "Please contact the hotel to book.");
    const crypto = this.deps.crypto;
    if (!crypto) return unavailable();
    const id = this.deps.ids.next();
    const code = crypto.generateCode();
    const result = await this.deps.unitOfWork.run(
      async ({ guests, verifications }) => {
        // Lock order: phone, guest row, email, verification row.
        const phoneLock = await verifications.lockPhone(phone);
        if (!phoneLock.ok) return phoneLock;
        const guest = await guests.lockByPhone(phone);
        if (!guest.ok) return guestLockFailure(guest);
        if (email !== null) {
          const emailLock = await verifications.lockEmail(email);
          if (!emailLock.ok) return emailLock;
        }
        const now = this.deps.clock.now();
        const since = new Date(
          now.getTime() - VERIFICATION_POLICY.dailyWindowMs,
        );
        const history = await verifications.requestHistory(phone, since);
        // GV-1 applies per email as it does per phone (ADR 031).
        const emailHistory =
          email === null
            ? null
            : await verifications.emailRequestHistory(email, since);
        const allowed = combineLimits(
          checkVerificationRequest(
            history,
            now,
            Boolean(guest.value?.blockedAt),
          ),
          ...(emailHistory
            ? [checkVerificationRequest(emailHistory, now, false)]
            : []),
        );
        if (!allowed.allowed)
          return allowed.code === "PHONE_BLOCKED"
            ? blocked()
            : rateLimited(
                "Please wait before requesting another code.",
                allowed.retryAfterSeconds!,
              );
        const expiresAt = verificationCodeExpiresAt(now);
        await verifications.insert({
          id,
          phone: phone.value,
          purpose,
          channel,
          email,
          codeHash: crypto.codeHash(
            { id, phone: phone.value, purpose, channel, email },
            code,
          ),
          attempts: 0,
          expiresAt,
          verifiedAt: null,
          tokenHash: null,
          tokenExpiresAt: null,
          consumedAt: null,
          clientKey,
          createdAt: now,
        });
        const next = combineLimits(
          checkVerificationRequest([...history, now], now, false),
          ...(emailHistory
            ? [checkVerificationRequest([...emailHistory, now], now, false)]
            : []),
        );
        return success({
          verificationId: id,
          expiresAt,
          resendAvailableAt: new Date(
            now.getTime() +
              (!next.allowed ? next.retryAfterSeconds! * 1000 : 0),
          ),
        });
      },
    );
    if (!result.ok) return result;
    // No provider I/O in a database transaction, and no plaintext code in an outbox.
    let sent = false;
    try {
      sent =
        email === null
          ? (
              await this.deps.sender.send({
                purpose: "VERIFICATION_CODE",
                language: "en",
                to: phone,
                variables: { code },
              })
            ).ok
          : (await this.deps.emailSender.send({ id, to: email, code })).ok;
    } catch {
      // Provider exceptions must not log the code or request details.
    }
    if (!sent) {
      await this.deps.verifications.invalidate(id);
      return unavailable();
    }
    return result;
  }
}

export class ConfirmPhoneVerification {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    id: unknown,
    input: unknown,
  ): Promise<Result<VerificationTokenView>> {
    const parsed = parseVerificationConfirmation(id, input);
    if (!parsed.ok) return parsed;
    const crypto = this.deps.crypto;
    if (!crypto) return unavailable();
    const initial = await this.deps.verifications.findById(parsed.value.id);
    if (!initial) return expired();
    // Identity is immutable. Read it first so the guest lock precedes the verification lock.
    const phone = PhoneNumber.parse(initial.phone);
    const transaction = await this.deps.unitOfWork.run(
      async ({ guests, verifications }) => {
        const guest = await guests.lockByPhone(phone);
        if (!guest.ok) return guestLockFailure(guest);
        const locked = await verifications.lock(initial.id);
        if (!locked.ok) return locked;
        const record = locked.value;
        if (!record) return success(expired());
        const outcome = confirmVerificationCode(
          record,
          crypto.codeMatches(
            {
              id: record.id,
              phone: record.phone,
              purpose: record.purpose,
              channel: record.channel,
              email: record.email,
            },
            parsed.value.code,
            record.codeHash,
          ),
          this.deps.clock.now(),
          Boolean(guest.value?.blockedAt),
        );
        if (!outcome.valid) {
          if (outcome.code === "PHONE_BLOCKED") return success(blocked());
          if (outcome.code !== "VERIFICATION_CODE_INVALID")
            return success(expired());
          await verifications.saveConfirmation(record.id, {
            attempts: outcome.attempts,
            verifiedAt: null,
            tokenHash: null,
            tokenExpiresAt: null,
          });
          // An invalid code is a committed outcome, not a transaction rollback.
          const refusal: Result<VerificationTokenView> = {
            ok: false,
            error: {
              code: "VERIFICATION_CODE_INVALID",
              message: "The verification code is incorrect.",
              context: { attemptsLeft: outcome.attemptsLeft },
            },
          };
          return success(refusal);
        }
        const token = crypto.generateToken();
        await verifications.saveConfirmation(record.id, {
          attempts: outcome.attempts,
          verifiedAt: outcome.verifiedAt,
          tokenHash: crypto.tokenHash(token),
          tokenExpiresAt: outcome.tokenExpiresAt,
        });
        return success(success({ token, expiresAt: outcome.tokenExpiresAt }));
      },
    );
    return transaction.ok ? transaction.value : transaction;
  }
}
