import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { PhoneVerificationCrypto } from "@/application/guests";

export class NodePhoneVerificationCrypto implements PhoneVerificationCrypto {
  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error("Phone verification needs a configured secret.");
  }
  generateCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }
  codeHash(id: string, phone: string, purpose: string, code: string) {
    return createHmac("sha256", this.secret)
      .update(JSON.stringify([id, phone, purpose, code]))
      .digest("hex");
  }
  codeMatches(
    id: string,
    phone: string,
    purpose: string,
    code: string,
    hash: string,
  ) {
    const expected = Buffer.from(
      this.codeHash(id, phone, purpose, code),
      "hex",
    );
    const stored = Buffer.from(hash, "hex");
    return (
      stored.length === expected.length && timingSafeEqual(stored, expected)
    );
  }
  generateToken() {
    return randomBytes(32).toString("base64url");
  }
  tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
