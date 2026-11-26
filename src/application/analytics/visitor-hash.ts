import "server-only";

import type { AnalyticsSaltStore } from "./ports";
import { RotateAnalyticsSalt } from "./rotate-analytics-salt";

export type VisitorHashing = Readonly<{
  salts: AnalyticsSaltStore;
  makeSalt(): Uint8Array;
  hashVisitor(salt: Uint8Array, address: string, userAgent: string): string;
}>;

/** Today's anonymous visitor count key, or null without a trusted address. */
export async function visitorHashFor(
  hashing: VisitorHashing,
  at: Date,
  address: string | null,
  userAgent: string,
) {
  if (!address) return null;
  const salt = await new RotateAnalyticsSalt(
    hashing.salts,
    hashing.makeSalt,
  ).execute(at);
  return salt ? hashing.hashVisitor(salt, address, userAgent) : null;
}
