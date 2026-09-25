import { createHash } from "node:crypto";

import type { Hasher } from "@/application/ports/providers";

export class NodeHasher implements Hasher {
  sha256(bytes: Uint8Array) {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
