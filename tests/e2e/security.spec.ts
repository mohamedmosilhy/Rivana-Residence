import { expect, test, type Page } from "@playwright/test";

// Browser security policy: response headers, the per-request CSP nonce, and
// proof that the policy is enforced without breaking any page.

const PAGES = [
  "/",
  "/about",
  "/rooms",
  "/facilities",
  "/contact",
  "/not-a-real-page",
  "/admin/login",
] as const;

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

const violations = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );

function nonceOf(csp: string | undefined) {
  return /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
}

test("rendered pages send hardened headers and a fresh CSP nonce", async ({
  request,
}) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const headers = first.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();

  const csp = headers["content-security-policy"]!;
  for (const directive of [
    "default-src 'self'",
    "'strict-dynamic'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]) {
    expect(csp).toContain(directive);
  }
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  // A new unguessable nonce per response, applied to Next's own scripts.
  const nonce = nonceOf(csp);
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  expect(nonceOf(second.headers()["content-security-policy"])).not.toBe(nonce);
  expect(await first.text()).toContain(`nonce="${nonce}"`);
});

test("admin responses are private and never indexed", async ({ request }) => {
  const response = await request.get("/admin/login");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("static files and media keep their own strict policies", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.headers()["x-content-type-options"]).toBe("nosniff");

  const missing = await request.get("/media/not/a-real-key.jpg");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toBe(
    "default-src 'none'; sandbox",
  );
});

test("pages hydrate under the enforced policy with no violations", async ({
  page,
}) => {
  await recordViolations(page);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page), path).toEqual([]);
  }

  // Client JavaScript ran: a link click is a client-side navigation that
  // keeps the window (and this marker) instead of reloading the document.
  await page.goto("/");
  await page.evaluate(() => {
    (window as unknown as { __marker: boolean }).__marker = true;
  });
  await page.locator('main a[href^="/rooms/"]:visible').first().click();
  await expect(page).toHaveURL(/\/rooms\/[a-z0-9-]+$/);
  expect(
    await page.evaluate(
      () => (window as unknown as { __marker?: boolean }).__marker,
    ),
  ).toBe(true);
  expect(await violations(page)).toEqual([]);
});

test("injected markup cannot run script", async ({ page }) => {
  // The realistic XSS shape: attacker HTML reaching the DOM. Inline event
  // handlers and javascript: URLs carry no nonce, so the policy refuses them.
  // (Scripts that trusted code creates itself are allowed by design under
  // 'strict-dynamic'; that is not an injection path.)
  await recordViolations(page);
  await page.goto("/");
  await page.evaluate(() => {
    const payload = document.createElement("div");
    payload.innerHTML =
      '<img src="/missing.png" onerror="window.__injected = true">';
    document.body.append(payload);
  });
  await expect
    .poll(() => violations(page))
    .toEqual(
      expect.arrayContaining([expect.stringMatching(/^script-src-attr/)]),
    );
  expect(
    await page.evaluate(
      () => (window as unknown as { __injected?: boolean }).__injected,
    ),
  ).toBeUndefined();
});

test("the site cannot be framed by another origin", async ({ page }) => {
  await page.setContent(
    `<iframe id="probe" src="${test.info().project.use.baseURL}/"></iframe>`,
  );
  const frame = page.frameLocator("#probe");
  await expect(frame.locator("body")).not.toContainText("Rivana", {
    timeout: 3_000,
  });
});
