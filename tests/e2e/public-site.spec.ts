import { rename, rm, stat, writeFile, readdir } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run public-site E2E.",
);

const OUTBOX = "/tmp/rivana-e2e-outbox";

// Every public template, with the entity it renders.
const ROUTES = [
  { path: "/", heading: "Rivana Residence", source: "Page HOME" },
  { path: "/about", heading: /About Rivana/, source: "Page ABOUT" },
  { path: "/contact", heading: "Contact us", source: "Page CONTACT" },
  { path: "/rooms", heading: "Rooms", source: "Published rooms" },
  {
    path: "/rooms/studio-with-balcony",
    heading: "Studio with Balcony",
    source: "Room",
  },
  { path: "/rooms/deluxe-double", heading: "Deluxe Double", source: "Room" },
  {
    path: "/facilities",
    heading: "Facilities",
    source: "Published facilities",
  },
  {
    path: "/facilities/swimming-pool",
    heading: "Swimming Pool",
    source: "Facility",
  },
  {
    path: "/facilities/fitness-room",
    heading: "Fitness Room",
    source: "Facility",
  },
] as const;

async function expectNoAxeViolations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const route of ROUTES) {
  test(`${route.path} renders published content (${route.source})`, async ({
    page,
    request,
  }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);

    // Primary content is in the server HTML, not added by client scripts.
    const html = await (await request.get(route.path)).text();
    const heading =
      typeof route.heading === "string" ? route.heading : "About Rivana";
    expect(html).toContain(heading);
    expect(html).toContain('id="main-content"');
  });
}

test("unpublished, archived, and unknown content returns 404", async ({
  page,
  request,
}) => {
  for (const path of [
    "/rooms/private-draft-room",
    "/rooms/retired-room",
    "/facilities/spa",
    "/rooms/does-not-exist",
    "/not-a-page",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  await page.goto("/rooms/private-draft-room");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "This page could not be found",
    }),
  ).toBeVisible();

  await page.goto("/rooms");
  const list = page.locator("main");
  await expect(
    list.getByRole("link", { name: "Studio with Balcony" }),
  ).toBeVisible();
  await expect(list.getByText("Private Draft Room")).toHaveCount(0);
  await expect(list.getByText("Retired Room")).toHaveCount(0);
  await page.goto("/facilities");
  await expect(
    page.locator("main").getByText("Spa", { exact: true }),
  ).toHaveCount(0);
});

test("visitors can navigate every route from the header", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  for (const [label, heading] of [
    ["Rooms", "Rooms"],
    ["Facilities", "Facilities"],
    ["About", /About Rivana/],
    ["Contact", "Contact us"],
    ["Home", "Rivana Residence"],
  ] as const) {
    if (isMobile) {
      await page.locator("summary", { hasText: "Menu" }).click();
      await page
        .getByRole("navigation", { name: "Main (menu)" })
        .getByRole("link", { name: label })
        .click();
    } else {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: label })
        .click();
    }
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
  // Cards lead to details.
  await page.goto("/rooms");
  await page.getByRole("link", { name: "Deluxe Double" }).click();
  await expect(page).toHaveURL(/\/rooms\/deluxe-double$/);
});

test("keyboard users can skip to content and reach the navigation", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Keyboard flow is exercised on desktop.");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /Rivana Residence home/ }),
  ).toBeFocused();
});

test("every public template reflows at the 320px minimum width", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The minimum-width pass runs once in its own viewport.");
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test("reduced-motion preference removes non-essential motion", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The reduced-motion pass runs once on desktop.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const motion = await page
    .locator(".site-button")
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        // Browsers print the reset duration as "0.00001s" or "1e-05s".
        animationDuration: parseFloat(style.animationDuration) < 0.001,
        animationIterationCount: style.animationIterationCount,
        scrollBehavior: getComputedStyle(document.documentElement)
          .scrollBehavior,
        transitionDuration: parseFloat(style.transitionDuration) < 0.001,
      };
    });
  expect(motion).toEqual({
    matches: true,
    animationDuration: true,
    animationIterationCount: "1",
    scrollBehavior: "auto",
    transitionDuration: true,
  });
});

test("rooms show verified facts only: no prices, dates, or availability", async ({
  page,
}) => {
  await page.goto("/rooms/studio-with-balcony");
  const facts = page.getByRole("definition");
  await expect(facts.filter({ hasText: "38 m²" })).toBeVisible();
  await expect(facts.filter({ hasText: "2 adults + 1 child" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Rain shower" }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Photos of Studio with Balcony" })
      .getByRole("listitem"),
  ).toHaveCount(3);

  const text = (await page.locator("main").innerText()).toLowerCase();
  for (const forbidden of [
    "price",
    "per night",
    "egp",
    "$",
    "availability",
    "check-in",
    "check-out",
    "sold out",
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
  await expect(
    page.locator('input[type="date"], input[type="number"], select'),
  ).toHaveCount(0);
});

test("every Book Now control is inert, goes nowhere, and explains itself", async ({
  page,
}) => {
  for (const path of ["/", "/rooms/studio-with-balcony"]) {
    await page.goto(path);
    const controls = page.locator("[data-booking]");
    const count = await controls.count();
    expect(count, path).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      expect(await control.evaluate((element) => element.tagName)).toBe(
        "BUTTON",
      );
      await expect(control).toHaveAttribute("type", "button");
      await expect(control).toHaveAttribute("aria-disabled", "true");
      expect(
        await control.evaluate((element) => element.closest("form, a")),
      ).toBeNull();
    }
    const url = page.url();
    const first = controls.filter({ visible: true }).first();
    // aria-disabled controls stay focusable; keyboard activation is how
    // people discover the explanation (Playwright refuses to click them).
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(url);
    const statusId = await first.getAttribute("aria-describedby");
    await expect(page.locator(`#${statusId}`)).toContainText(
      "Online booking is not available yet",
    );
  }
  // No link anywhere points at a booking engine or carries booking data.
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  expect(
    hrefs.filter((href) =>
      /\b(book|booking|reserve|reservations?|check-?in|arrival)\b/i.test(href),
    ),
  ).toEqual([]);
});

test("pages work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Rivana Residence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Studio with Balcony" }).first(),
  ).toBeVisible();
  await page.goto("/rooms/studio-with-balcony");
  await expect(
    page.getByRole("heading", { level: 1, name: "Studio with Balcony" }),
  ).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByLabel("Message")).toBeVisible();
  await context.close();
});

test("the hero image is the preloaded LCP candidate with meaningful alt text", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".site-hero__media img");
  await expect(hero).toHaveAttribute("alt", /lobby/i);
  expect(await hero.getAttribute("loading")).not.toBe("lazy");
  expect(
    await page.locator('link[rel="preload"][as="image"]').count(),
  ).toBeGreaterThan(0);
});

test.describe("contact form", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Submissions run once, on desktop.");

  async function fill(page: Page, overrides: Record<string, string> = {}) {
    const values = {
      name: "Layla Hassan",
      email: "layla@example.test",
      message: "Do you have a quiet room for two weeks in March?",
      ...overrides,
    };
    await page.getByLabel("Your name").fill(values.name);
    await page.getByLabel("Email").fill(values.email);
    await page.getByLabel("Message").fill(values.message);
  }

  test("explains invalid input and keeps what was typed", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForTimeout(3100);
    await fill(page, { email: "not-an-email", message: "Hi <b>there</b>" });
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.locator(".site-form__error")).toBeFocused();
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(
      page.getByText(/remove anything that looks like HTML/),
    ).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("Layla Hassan");
    await expectNoAxeViolations(page);
  });

  test("saves and delivers an enquiry", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForTimeout(3100);
    await fill(page, { name: "Delivery Check" });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your message has been sent" }),
    ).toBeFocused();

    const { rows } = await sql(
      `SELECT id, status, "deliveryMessageId" FROM "ContactEnquiry" WHERE name = 'Delivery Check'`,
    );
    expect(rows[0]).toMatchObject({
      status: "NEW",
      deliveryMessageId: `outbox:${rows[0].id}`,
    });
    const files = await readdir(OUTBOX);
    expect(files).toContain(`${rows[0].id}.json`);
  });

  test("keeps the enquiry and flags it when delivery fails", async ({
    page,
  }) => {
    // Make the outbox unwritable by replacing the directory with a file.
    await rename(OUTBOX, `${OUTBOX}-saved`).catch(() => undefined);
    await writeFile(OUTBOX, "not a directory");
    try {
      await page.goto("/contact");
      await page.waitForTimeout(3100);
      await fill(page, { name: "Failure Check" });
      await page.getByRole("button", { name: "Send message" }).click();
      // The visitor still gets the same confirmation; staff see the failure.
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Your message has been sent" }),
      ).toBeVisible();
      const { rows } = await sql(
        `SELECT status FROM "ContactEnquiry" WHERE name = 'Failure Check'`,
      );
      expect(rows[0]).toEqual({ status: "DELIVERY_FAILED" });
    } finally {
      await rm(OUTBOX, { force: true });
      if (await stat(`${OUTBOX}-saved`).catch(() => null)) {
        await rename(`${OUTBOX}-saved`, OUTBOX);
      }
    }
  });

  test("silently ignores bots", async ({ page }) => {
    await page.goto("/contact");
    // Submitted immediately, like a script: accepted-looking but discarded.
    await fill(page, { name: "Fast Bot" });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your message has been sent" }),
    ).toBeVisible();

    await page.goto("/contact");
    await page.waitForTimeout(3100);
    await fill(page, { name: "Honeypot Bot" });
    await page
      .locator('input[name="website"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "https://spam.example";
      });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Your message has been sent" }),
    ).toBeVisible();

    const { rows } = await sql(
      `SELECT count(*)::int AS count FROM "ContactEnquiry" WHERE name IN ('Fast Bot', 'Honeypot Bot')`,
    );
    expect(rows[0]).toEqual({ count: 0 });
  });
});
