import "server-only";

import { isAPIError } from "better-auth/api";

import type { CredentialAuthenticator } from "@/application/auth/ports";
import type { Auth } from "@/infrastructure/auth/better-auth";

export class BetterAuthCredentialAuthenticator
  implements CredentialAuthenticator
{
  constructor(
    private readonly auth: Auth,
    private readonly requestHeaders: () => Promise<Headers>,
  ) {}

  async signIn(email: string, password: string) {
    try {
      await this.auth.api.signInEmail({
        body: { email, password, rememberMe: true },
        headers: await this.requestHeaders(),
      });
      return true;
    } catch (error) {
      // Wrong password, unknown email, inactive account, and session-creation
      // refusal all collapse into one outcome so none can be told apart.
      if (isAPIError(error)) return false;
      throw error;
    }
  }
}
