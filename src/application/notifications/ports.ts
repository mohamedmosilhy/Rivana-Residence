import type { PhoneNumber } from "@/domain/guests";
import type {
  WhatsAppCategory,
  WhatsAppPurpose,
  WhatsAppSettingsInput,
  WhatsAppTemplateInput,
  WhatsAppVariableKey,
} from "@/domain/notifications";
import type { RateLimitOutcome } from "@/application/shared/rate-limit";
import type { Result } from "@/application/shared/result";

// WhatsApp setup and sending (spec 0005 Decision 6, ADR 028). The access
// token never crosses these ports: the transport holds it, and use cases see
// only whether it is configured.

export type WhatsAppSettingsRecord = Readonly<{
  businessPhoneNumber: string | null;
  providerPhoneNumberId: string | null;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: Date;
}>;

export type WhatsAppSettingsWrite = Readonly<{
  input: WhatsAppSettingsInput;
  updatedById: string;
  /** Read after the row lock is held, so audit order matches lock order. */
  now: () => Date;
}>;

export type WhatsAppSettingsWriteOutcome = Readonly<{
  before: WhatsAppSettingsRecord;
  after: WhatsAppSettingsRecord;
  changed: boolean;
}>;

export type WhatsAppTestOutcome = Readonly<{
  at: Date;
  ok: boolean;
  /** Sanitized provider text or a setup gap; never a token or a phone. */
  error: string | null;
}>;

export interface WhatsAppSettingsRepository {
  /** The singleton row; the migration creates it with an empty number. */
  read(): Promise<WhatsAppSettingsRecord>;
  /** Locks the row and applies the input. TRY_AGAIN on a lock timeout. */
  update(
    write: WhatsAppSettingsWrite,
  ): Promise<Result<WhatsAppSettingsWriteOutcome>>;
  /**
   * Stores the last test result unless another transaction holds the row
   * (it never waits). Returns whether it was stored.
   */
  recordTest(outcome: WhatsAppTestOutcome): Promise<boolean>;
}

export type WhatsAppTemplateRecord = WhatsAppTemplateInput &
  Readonly<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
  }>;

export interface WhatsAppTemplateRepository {
  /** Every template: purpose, language, newest first. */
  list(): Promise<readonly WhatsAppTemplateRecord[]>;
  findById(id: string): Promise<WhatsAppTemplateRecord | null>;
  /** The active template for a purpose and language, if any. */
  findActive(
    purpose: WhatsAppPurpose,
    language: string,
  ): Promise<WhatsAppTemplateRecord | null>;
  /** CONFLICT when another template is active for the purpose and language. */
  create(
    id: string,
    input: WhatsAppTemplateInput,
    actorId: string,
    now: Date,
  ): Promise<Result<WhatsAppTemplateRecord>>;
  /** Locks the row; null when it does not exist. TRY_AGAIN on lock timeout. */
  lock(id: string): Promise<Result<WhatsAppTemplateRecord | null>>;
  /** CONFLICT when another template is active for the purpose and language. */
  replace(
    id: string,
    input: WhatsAppTemplateInput,
    actorId: string,
    now: Date,
  ): Promise<Result<WhatsAppTemplateRecord>>;
}

/** Why a message was not sent. */
export type WhatsAppFailureCode =
  /** Number, phone number id, or access token missing. Nothing was sent. */
  | "NOT_CONFIGURED"
  /** No usable active template for the purpose and language. Nothing sent. */
  | "TEMPLATE_MISSING"
  /** The provider refused the message (wrong template name, bad number). */
  | "PROVIDER_REJECTED"
  /** The provider's rate limit. */
  | "RATE_LIMITED"
  /** Timeout, network error, or provider outage. */
  | "UNAVAILABLE";

export type WhatsAppSendResult =
  | Readonly<{ ok: true; providerMessageId: string }>
  | Readonly<{
      ok: false;
      code: WhatsAppFailureCode;
      /** Sanitized, at most 200 characters, never a token, phone, or code. */
      detail: string;
    }>;

/** One resolved template message, ready for the provider. */
export type WhatsAppDelivery = Readonly<{
  phoneNumberId: string;
  templateName: string;
  language: string;
  category: WhatsAppCategory;
  to: PhoneNumber;
  /** Values in the template's variable order. */
  parameters: readonly string[];
}>;

export type WhatsAppTransportResult =
  | Readonly<{ ok: true; providerMessageId: string }>
  | Readonly<{
      ok: false;
      code: Extract<
        WhatsAppFailureCode,
        "PROVIDER_REJECTED" | "RATE_LIMITED" | "UNAVAILABLE"
      >;
      detail: string;
    }>;

/** The provider call (Meta Cloud API, or the fake). Holds the access token. */
export interface WhatsAppTransport {
  deliver(delivery: WhatsAppDelivery): Promise<WhatsAppTransportResult>;
}

export type WhatsAppMessage = Readonly<{
  purpose: WhatsAppPurpose;
  language: string;
  to: PhoneNumber;
  /** Every key the purpose's templates may use; extra keys are ignored. */
  variables: Readonly<Partial<Record<WhatsAppVariableKey, string>>>;
}>;

/**
 * The one way the application sends WhatsApp (spec 0005 Decision 6). Never
 * call it inside a transaction: it performs network I/O.
 */
export interface WhatsAppSender {
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}

/** Admits one staff action per call against a per user window. */
export interface StaffActionLimiter {
  consume(staffId: string): Promise<RateLimitOutcome>;
}
