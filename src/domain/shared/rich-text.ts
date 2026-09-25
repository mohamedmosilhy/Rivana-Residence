import { z } from "zod";

export const richTextDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).max(100),
});
