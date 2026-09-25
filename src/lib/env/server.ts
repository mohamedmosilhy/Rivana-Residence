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
  });
  return cached;
}
