import "server-only";

import { parseServerEnv, type ServerEnv } from "@/lib/env/schema";

let cached: ServerEnv | undefined;

// Parsed on first use rather than at import, so `next build` can compile
// server routes without production secrets being present.
export function getServerEnv() {
  cached ??= parseServerEnv({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    MEDIA_STORAGE_ROOT: process.env.MEDIA_STORAGE_ROOT,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    AUTH_TRUST_PROXY_HEADERS: process.env.AUTH_TRUST_PROXY_HEADERS,
    CONTACT_DELIVERY: process.env.CONTACT_DELIVERY,
    CONTACT_OUTBOX_DIR: process.env.CONTACT_OUTBOX_DIR,
    CONTACT_TO: process.env.CONTACT_TO,
    CONTACT_FROM: process.env.CONTACT_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  });
  return cached;
}
