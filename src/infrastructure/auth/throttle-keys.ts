import "server-only";

import { createHmac } from "node:crypto";

import type { ThrottleKeyDeriver } from "@/application/auth/ports";

// Throttle rows are keyed by a keyed hash, so the table never holds raw
// email addresses or client IPs.
export class HmacThrottleKeys implements ThrottleKeyDeriver {
  constructor(private readonly secret: string) {}

  account(email: string) {
    return `a:${this.digest(`account:${email.trim().toLowerCase()}`)}`;
  }

  client(address: string) {
    return `c:${this.digest(`client:${address.trim()}`)}`;
  }

  private digest(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}
