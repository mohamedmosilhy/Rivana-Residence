// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ AUTH_TRUST_PROXY_HEADERS: false }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => env }));

import { clientAddressFrom } from "@/composition/http";

describe("public limiter proxy trust (M6 AC-8)", () => {
  it("ignores spoofed headers when proxy trust is disabled", () => {
    env.AUTH_TRUST_PROXY_HEADERS = false;
    expect(
      clientAddressFrom(
        new Headers({
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "198.51.100.8",
        }),
      ),
    ).toBeNull();
  });
  it("uses the first forwarded address only when proxy trust is enabled", () => {
    env.AUTH_TRUST_PROXY_HEADERS = true;
    expect(
      clientAddressFrom(
        new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.8" }),
      ),
    ).toBe("203.0.113.9");
    expect(
      clientAddressFrom(new Headers({ "x-real-ip": "198.51.100.8" })),
    ).toBe("198.51.100.8");
    expect(clientAddressFrom(new Headers())).toBeNull();
  });
});
