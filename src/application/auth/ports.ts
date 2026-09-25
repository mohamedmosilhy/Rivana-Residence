import type { ThrottleRule, ThrottleState } from "@/domain/auth/login-throttle";
import type { AdminRole } from "@/domain/shared/types";

export type StaffPrincipal = Readonly<{
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  sessionId: string;
}>;

export type StaffAccount = Readonly<{
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
}>;

export type StaffSessionSummary = Readonly<{
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  current: boolean;
}>;

export interface CredentialAuthenticator {
  /** Returns false for any credential, account-state, or session failure. */
  signIn(email: string, password: string): Promise<boolean>;
}

export interface LoginThrottleStore {
  get(key: string): Promise<ThrottleState | null>;
  /** Atomically applies one failure to the key and returns the new state. */
  recordFailure(
    key: string,
    rule: ThrottleRule,
    now: Date,
  ): Promise<ThrottleState>;
  clear(key: string): Promise<void>;
}

export interface ThrottleKeyDeriver {
  account(email: string): string;
  client(address: string): string;
}

export type StaffListing = StaffAccount & Readonly<{ activeSessions: number }>;

export interface StaffDirectory {
  listAccounts(now: Date): Promise<readonly StaffListing[]>;
  findById(id: string): Promise<StaffAccount | null>;
  findByEmail(email: string): Promise<StaffAccount | null>;
  listSessions(
    userId: string,
    currentSessionId: string | null,
    now: Date,
  ): Promise<readonly StaffSessionSummary[]>;
  revokeSessions(
    userId: string,
    options?: Readonly<{ except?: string }>,
  ): Promise<number>;
}
