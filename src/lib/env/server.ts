import "server-only";

import { parseServerEnv } from "@/lib/env/schema";

export const serverEnv = parseServerEnv({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  MEDIA_STORAGE_ROOT: process.env.MEDIA_STORAGE_ROOT,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
});
