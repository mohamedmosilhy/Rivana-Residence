import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    MEDIA_STORAGE_ROOT: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.MEDIA_STORAGE_ROOT) {
      context.addIssue({
        code: "custom",
        message: "MEDIA_STORAGE_ROOT is required in production.",
        path: ["MEDIA_STORAGE_ROOT"],
      });
    }
  });

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

function formatIssues(error: z.ZodError) {
  return error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("\n");
}

export function parseServerEnv(input: Record<string, string | undefined>) {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      `Invalid server environment:\n${formatIssues(result.error)}`,
    );
  }

  return result.data;
}

export function parsePublicEnv(input: Record<string, string | undefined>) {
  const result = publicEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      `Invalid public environment:\n${formatIssues(result.error)}`,
    );
  }

  return result.data;
}
