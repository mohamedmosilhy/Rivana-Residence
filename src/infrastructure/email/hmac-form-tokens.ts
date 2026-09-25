import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { FormTokens } from "@/application/enquiries/submit-enquiry";

// Tokens are "<issued-ms>.<signature>". They carry no visitor data; they only
// prove the form was rendered by this server and when.
export class HmacFormTokens implements FormTokens {
  constructor(private readonly secret: string) {}

  issue(now: Date) {
    const issued = String(now.getTime());
    return `${issued}.${this.sign(`form:${issued}`)}`;
  }

  verify(token: string) {
    const match = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) return null;
    const expected = Buffer.from(this.sign(`form:${match[1]}`));
    const actual = Buffer.from(match[2]!);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }
    return new Date(Number(match[1]));
  }

  clientKey(address: string) {
    return this.sign(`enquiry-client:${address.trim()}`);
  }

  private sign(value: string) {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}
