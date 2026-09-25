import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type { IdGenerator } from "@/application/ports/providers";

export class Cuid2IdGenerator implements IdGenerator {
  next() {
    return createId();
  }
}
