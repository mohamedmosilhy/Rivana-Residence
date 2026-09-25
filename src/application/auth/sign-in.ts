import type {
  CredentialAuthenticator,
  LoginThrottleStore,
  ThrottleKeyDeriver,
} from "@/application/auth/ports";
import type { Clock } from "@/application/ports/providers";
import { failure, success, type Result } from "@/application/shared/result";
import {
  LOGIN_THROTTLE_RULES,
  retryAfterMs,
  type ThrottleRule,
} from "@/domain/auth/login-throttle";
import { PASSWORD_MAX_LENGTH } from "@/domain/auth/password-policy";

export const INVALID_CREDENTIALS_MESSAGE =
  "The email or password is incorrect, or the account cannot sign in.";
export const RATE_LIMITED_MESSAGE =
  "Too many sign-in attempts. Wait a few minutes before trying again.";

export type SignInCommand = Readonly<{
  email: unknown;
  password: unknown;
  clientAddress: string | null;
}>;

export class SignIn {
  constructor(
    private readonly authenticator: CredentialAuthenticator,
    private readonly throttle: LoginThrottleStore,
    private readonly keys: ThrottleKeyDeriver,
    private readonly clock: Clock,
  ) {}

  async execute(command: SignInCommand): Promise<Result<void>> {
    const email =
      typeof command.email === "string"
        ? command.email.trim().toLowerCase()
        : "";
    const password =
      typeof command.password === "string" ? command.password : "";
    if (
      !email ||
      email.length > 320 ||
      !password ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      return failure("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const buckets: [string, ThrottleRule][] = [
      [this.keys.account(email), LOGIN_THROTTLE_RULES.account],
    ];
    if (command.clientAddress) {
      buckets.push([
        this.keys.client(command.clientAddress),
        LOGIN_THROTTLE_RULES.client,
      ]);
    }

    const now = this.clock.now();
    const states = await Promise.all(
      buckets.map(([key]) => this.throttle.get(key)),
    );
    if (states.some((state) => retryAfterMs(state, now) > 0)) {
      return failure("RATE_LIMITED", RATE_LIMITED_MESSAGE);
    }

    if (await this.authenticator.signIn(email, password)) {
      await this.throttle.clear(buckets[0]![0]);
      return success(undefined);
    }

    await Promise.all(
      buckets.map(([key, rule]) => this.throttle.recordFailure(key, rule, now)),
    );
    return failure("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
  }
}
