import { z } from "zod";

export const HealthResponse = z.object({
  status: z.literal("ok"),
  database: z.literal("ok"),
});

export type HealthResponseDto = z.infer<typeof HealthResponse>;
