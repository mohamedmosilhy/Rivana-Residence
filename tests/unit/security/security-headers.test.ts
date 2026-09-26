// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STATIC_SECURITY_HEADERS,
  contentSecurityPolicy,
  createNonce,
} from "@/infrastructure/http/security-headers";
import { config, proxy } from "@/proxy";

const directives = (policy: string) =>
  new Map(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values] as const;
    }),
  );

describe("content security policy", () => {
  const production = contentSecurityPolicy({
    nonce: "abc123",
    development: false,
    https: true,
  });

  it("allows scripts only by nonce and never inline or eval in production", () => {
    const script = directives(production).get("script-src");
    expect(script).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(production).not.toContain("unsafe-eval");
  });

  it("locks down plugins, base URLs, form targets, and framing", () => {
    const policy = directives(production);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
  });

  it("permits only the Google Maps embed as a third-party frame", () => {
    expect(directives(production).get("frame-src")).toEqual([
      "https://www.google.com",
    ]);
  });

  it("upgrades insecure requests only on an HTTPS deployment", () => {
    expect(production).toContain("upgrade-insecure-requests");
    expect(
      contentSecurityPolicy({ nonce: "n", development: false, https: false }),
    ).not.toContain("upgrade-insecure-requests");
  });

  it("adds eval only for the development server", () => {
    expect(
      contentSecurityPolicy({ nonce: "n", development: true, https: false }),
    ).toContain("'unsafe-eval'");
  });

  it("creates distinct 128-bit nonces", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("sends the baseline headers on every response", () => {
    expect(
      Object.fromEntries(
        STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]),
      ),
    ).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });
});

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  const request = (path: string, cookie?: string) =>
    new NextRequest(`http://127.0.0.1:3000${path}`, {
      headers: cookie ? { cookie } : {},
    });

  it("gives each public page its own nonce policy and forwards it to rendering", () => {
    const first = proxy(request("/rooms"));
    const second = proxy(request("/rooms"));
    const csp = first.headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(second.headers.get("Content-Security-Policy")).not.toBe(csp);
    expect(
      first.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
    expect(first.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("redirects signed-out admin requests with a safe return path", () => {
    const response = proxy(request("/admin/rooms?page=2"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.pathname}${location.search}`).toBe(
      "/admin/login?returnTo=%2Fadmin%2Frooms%3Fpage%3D2",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("lets the login page and cookie-bearing admin requests render privately", () => {
    for (const response of [
      proxy(request("/admin/login")),
      proxy(request("/admin", "rivana.session_token=opaque")),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("upgrades insecure requests when the site is served over HTTPS", () => {
    vi.stubEnv("APP_URL", "https://www.rivanaresidence.com");
    expect(
      proxy(request("/")).headers.get("Content-Security-Policy"),
    ).toContain("upgrade-insecure-requests");
  });

  it("skips static files, optimized images, media, and crawl files", () => {
    const matcher = new RegExp(`^${config.matcher[0]!}$`);
    for (const path of [
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/media/2026/09/a.jpg",
      "/robots.txt",
      "/sitemap.xml",
      "/rivana-icon.png",
    ]) {
      expect(matcher.test(path), path).toBe(false);
    }
    for (const path of ["/", "/rooms/deluxe-double", "/admin/login"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });
});
