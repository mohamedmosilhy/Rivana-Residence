import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    MEDIA_STORAGE_ROOT: z.string().trim().min(1).optional(),
    DATABASE_URL: z
      .string()
      .trim()
      .regex(/^postgres(?:ql)?:\/\//, "Must be a PostgreSQL connection URL.")
      .optional(),
    DIRECT_DATABASE_URL: z
      .string()
      .trim()
      .regex(/^postgres(?:ql)?:\/\//, "Must be a PostgreSQL connection URL.")
      .optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "Must be at least 32 characters of random data.")
      .optional(),
    AUTH_TRUST_PROXY_HEADERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.MEDIA_STORAGE_ROOT) {
      context.addIssue({
        code: "custom",
        message: "MEDIA_STORAGE_ROOT is required in production.",
        path: ["MEDIA_STORAGE_ROOT"],
      });
    }
    if (value.NODE_ENV === "production" && !value.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        message: "DATABASE_URL is required in production.",
        path: ["DATABASE_URL"],
      });
    }
    if (value.NODE_ENV === "production" && !value.BETTER_AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        message: "BETTER_AUTH_SECRET is required in production.",
        path: ["BETTER_AUTH_SECRET"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

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
