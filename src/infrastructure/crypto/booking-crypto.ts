import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { BookingCrypto } from "@/application/reservations";

export class NodeBookingCrypto implements BookingCrypto {
  generateToken() {
    return randomBytes(32).toString("base64url");
  }
  sha256(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  randomBytes(length: number) {
    return randomBytes(length);
  }
}
