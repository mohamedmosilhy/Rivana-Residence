import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ContactDelivery } from "@/application/ports/providers";

/**
 * Development and test delivery: writes each message as JSON to a
 * directory instead of sending email. (The E2E suite runs the production
 * build with it; real deployments use SMTP.)
 */
export class OutboxContactDelivery implements ContactDelivery {
  constructor(private readonly directory: string) {}

  async deliver(input: {
    enquiryId: string;
    replyTo: string;
    subject: string;
    text: string;
  }) {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${input.enquiryId}.json`);
    await writeFile(file, `${JSON.stringify(input, null, 2)}\n`, {
      flag: "wx",
    });
    return { messageId: `outbox:${input.enquiryId}` };
  }
}
