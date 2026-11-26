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
    PHONE_VERIFICATION_SECRET: z.preprocess(
      // The optional placeholder in .env.example must not break unrelated routes.
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z
        .string()
        .min(32, "Must be at least 32 characters of random data.")
        .optional(),
    ),
    AUTH_TRUST_PROXY_HEADERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ANALYTICS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    // Contact enquiry delivery. "none" stores enquiries for the admin inbox
    // only; "outbox" writes each message to a directory (development and
    // tests); "smtp" sends email.
    CONTACT_DELIVERY: z.enum(["none", "outbox", "smtp"]).default("none"),
    CONTACT_OUTBOX_DIR: z.string().trim().min(1).optional(),
    CONTACT_TO: z.email().optional(),
    CONTACT_FROM: z.email().optional(),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_PROVIDER: z.enum(["smtp", "fake"]).optional(),
    PAYMENT_PROVIDER: z.literal("fake").optional(),
    PAYMENT_FAKE_SECRET: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().min(32).optional(),
    ),
    // WhatsApp (ADR 028, spec 0005 Decision 6). "fake" records messages in
    // memory for development and tests and is refused in production; the
    // default is "meta" in production and "fake" elsewhere. The access
    // token is a server secret: never stored in the database or returned.
    WHATSAPP_PROVIDER: z.enum(["meta", "fake"]).optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().trim().min(1).optional(),
    WHATSAPP_GRAPH_VERSION: z
      .string()
      .trim()
      .regex(/^v\d+\.\d+$/, "Use a Graph API version such as v23.0.")
      .default("v23.0"),
  })
  .transform((value) => ({
    ...value,
    EMAIL_PROVIDER:
      value.EMAIL_PROVIDER ??
      (value.NODE_ENV === "production" ? "smtp" : "fake"),
    PAYMENT_PROVIDER:
      value.PAYMENT_PROVIDER ??
      (value.NODE_ENV === "production" ? undefined : "fake"),
    WHATSAPP_PROVIDER:
      value.WHATSAPP_PROVIDER ??
      (value.NODE_ENV === "production" ? "meta" : "fake"),
  }))
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production") {
      for (const key of [
        "PAYMENT_PROVIDER",
        "WHATSAPP_PROVIDER",
        "EMAIL_PROVIDER",
      ] as const) {
        if (value[key] === "fake") {
          context.addIssue({
            code: "custom",
            message: `${key}=fake is not allowed in production.`,
            path: [key],
          });
        }
      }
    }
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
    if (value.CONTACT_DELIVERY === "outbox" && !value.CONTACT_OUTBOX_DIR) {
      context.addIssue({
        code: "custom",
        message: "CONTACT_OUTBOX_DIR is required when CONTACT_DELIVERY=outbox.",
        path: ["CONTACT_OUTBOX_DIR"],
      });
    }
    if (value.CONTACT_DELIVERY === "smtp") {
      for (const key of [
        "SMTP_HOST",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "CONTACT_TO",
        "CONTACT_FROM",
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required when CONTACT_DELIVERY=smtp.`,
            path: [key],
          });
        }
      }
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
