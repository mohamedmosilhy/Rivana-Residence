import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env/schema";

describe("server environment", () => {
  it("reports a missing production media root clearly", () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: "production",
        APP_URL: "https://rivanaresidence.com",
      }),
    ).toThrowError(/MEDIA_STORAGE_ROOT is required in production/);
  });

  it("accepts an explicit production media root", () => {
    expect(
      parseServerEnv({
        NODE_ENV: "production",
        APP_URL: "https://rivanaresidence.com",
        MEDIA_STORAGE_ROOT: "/srv/rivana/media",
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      MEDIA_STORAGE_ROOT: "/srv/rivana/media",
    });
  });
});
