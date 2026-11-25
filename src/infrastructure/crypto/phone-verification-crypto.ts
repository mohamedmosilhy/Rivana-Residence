import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type {
  PhoneVerificationCrypto,
  VerificationCodeBinding,
} from "@/application/guests";

export class NodePhoneVerificationCrypto implements PhoneVerificationCrypto {
  constructor(private readonly secret: string) {
    if (secret.length < 32)
      throw new Error("Phone verification needs a configured secret.");
  }
  generateCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }
  codeHash(binding: VerificationCodeBinding, code: string) {
    // WhatsApp codes keep the M8 input, so a code sent before a deploy still
    // confirms after it. Email codes add the channel and the address (ADR 031),
    // so neither kind can ever confirm the other.
    const input =
      binding.channel === "WHATSAPP"
        ? [binding.id, binding.phone, binding.purpose, code]
        : [
            binding.id,
            binding.phone,
            binding.purpose,
            binding.channel,
            binding.email,
            code,
          ];
    return createHmac("sha256", this.secret)
      .update(JSON.stringify(input))
      .digest("hex");
  }
  codeMatches(binding: VerificationCodeBinding, code: string, hash: string) {
    const expected = Buffer.from(this.codeHash(binding, code), "hex");
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
