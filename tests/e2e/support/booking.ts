import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

import { E2E_PHONE_VERIFICATION_SECRET } from "./phone-verification";
import { sql } from "./session";

/**
 * The checks every booking step passes: no serious or critical axe finding,
 * no sideways scrolling, and 44 px touch targets. The target of a radio button
 * or checkbox is its label.
 */
export async function verifyAccessibility(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  const targets = await page
    .locator(
      "main :is(input:not([type=hidden], [type=radio], [type=checkbox]), textarea, select, button, a, summary, label:has(input[type=radio], input[type=checkbox]))",
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return {
            name: element.textContent?.trim() || element.getAttribute("name"),
            width,
            height,
          };
        }),
    );
  expect(
    targets.filter(({ width, height }) => width < 44 || height < 44),
  ).toEqual([]);
}

/**
 * Replaces the code of a requested verification with a known one, in the
 * disposable database. The real code is only in the fake provider's memory.
 * The hash input repeats `codeHash` in
 * `src/infrastructure/crypto/phone-verification-crypto.ts` (a `server-only`
 * module Playwright cannot import): change both together.
 */
export async function setKnownCode(verificationId: string, code: string) {
  const {
    rows: [row],
  } = await sql(
    'SELECT phone, purpose, channel, email FROM "PhoneVerification" WHERE id = $1',
    [verificationId],
  );
  const input =
    row.channel === "WHATSAPP"
      ? [verificationId, row.phone, row.purpose, code]
      : [verificationId, row.phone, row.purpose, row.channel, row.email, code];
  await sql('UPDATE "PhoneVerification" SET "codeHash" = $1 WHERE id = $2', [
    createHmac("sha256", E2E_PHONE_VERIFICATION_SECRET)
      .update(JSON.stringify(input))
      .digest("hex"),
    verificationId,
  ]);
}

/**
 * A full page picture at 1280 px (desktop project) or 390 px (mobile project),
 * for the milestone report. Nothing without a directory or on WebKit.
 */
export async function screenshot(
  page: Page,
  testInfo: TestInfo,
  directory: string | undefined,
  state: string,
) {
  if (!directory || !testInfo.project.name.endsWith("chromium")) return;
  const desktop = testInfo.project.name === "desktop-chromium";
  const previous = page.viewportSize()!;
  await page.setViewportSize(
    desktop ? { width: 1280, height: 920 } : { width: 390, height: 844 },
  );
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    await document.fonts.ready;
    // A photo still decoding would leave an empty frame in the picture.
    await Promise.all(
      Array.from(document.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    );
  });
  // The header redraws a moment after the page returns to the top.
  await page.waitForTimeout(500);
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(
      directory,
      `${state}-${desktop ? "desktop" : "mobile"}.png`,
    ),
    fullPage: true,
    animations: "disabled",
    scale: "css",
    // The development server's badge is not part of the page.
    style: "nextjs-portal { display: none !important; }",
  });
  await page.setViewportSize(previous);
}
