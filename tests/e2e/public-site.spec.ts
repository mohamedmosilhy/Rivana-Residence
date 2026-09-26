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

test("publishes unique metadata, canonicals, crawl files, and safe structured data", async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(isMobile, "SEO responses are identical across viewports.");
  const titles = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route.path);
    const canonical =
      route.path === "/"
        ? "http://127.0.0.1:3100"
        : `http://127.0.0.1:3100${route.path}`;
    const title = await page.title();
    expect(titles.has(title), `duplicate title: ${title}`).toBe(false);
    titles.add(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonical,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonical,
    );
  }

  await page.goto("/rooms/studio-with-balcony");
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const structured = jsonLd.map((value) => JSON.parse(value));
  expect(structured.some((value) => value["@type"] === "Hotel")).toBe(true);
  expect(structured.some((value) => value["@type"] === "HotelRoom")).toBe(true);
  expect(structured.some((value) => value["@type"] === "BreadcrumbList")).toBe(
    true,
  );
  expect(JSON.stringify(structured).toLowerCase()).not.toMatch(
    /"@type":"offer"|price|availability|aggregaterating|review/,
  );

  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const route of ROUTES) {
    expect(sitemap).toContain(`http://127.0.0.1:3100${route.path}`);
  }
  expect(sitemap).not.toContain("private-draft-room");
  expect(sitemap).not.toContain("retired-room");
  expect(sitemap).not.toContain("/admin");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin/");
  expect(robots).toContain("Sitemap: http://127.0.0.1:3100/sitemap.xml");
});

test("legacy public URLs redirect permanently to canonical routes", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "Redirect responses are identical across viewports.");
  const redirects = {
    "/about.html": "/about",
    "/rooms.html": "/rooms",
    "/room-studio-balcony.html": "/rooms/studio-with-balcony",
    "/gym.html": "/facilities/fitness-room",
    "/swimming-pool.html": "/facilities/swimming-pool",
  } as const;
  for (const [source, destination] of Object.entries(redirects)) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(destination);
  }
});

test("published pages contain no broken internal links or images", async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(isMobile, "The same resources are audited once on desktop.");
  const targets = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route.path);
    const discovered = await page
      .locator("a[href], img[src]")
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const value =
            element instanceof HTMLAnchorElement
              ? element.href
              : (element as HTMLImageElement).src;
          const url = new URL(value, location.href);
          return url.origin === location.origin
            ? [url.pathname + url.search]
            : [];
        }),
      );
    discovered.forEach((target) => targets.add(target));
  }
  for (const target of targets) {
    const response = await request.get(target);
    expect(response.status(), target).toBeLessThan(400);
  }
});

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

test("every public template reflows at each target width", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The width sweep runs once, resizing one viewport.");
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  }
});

test("controls meet the touch-target minimum on phones", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch targets are measured on the phone viewport.");
  for (const path of ["/", "/rooms/studio-with-balcony", "/contact"]) {
    await page.goto(path);
    const small = await page
      .locator(
        ".site-button, .site-link, .site-menu__toggle, .site-field input, .site-field textarea",
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              label: element.textContent?.trim() || element.id,
              width: Math.round(box.width),
              height: Math.round(box.height),
            };
          })
          .filter((box) => box.width < 44 || box.height < 44),
      );
    expect(small, path).toEqual([]);
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

test.describe("interaction and motion", () => {
  test("the photo viewer works by keyboard and returns focus", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Keyboard flow is exercised on desktop.");
    await page.goto("/rooms/studio-with-balcony");
    const gallery = page.getByRole("list", {
      name: "Photos of Studio with Balcony",
    });
    const opener = gallery.getByRole("link").first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog", {
      name: "Photos of Studio with Balcony",
    });
    await expect(viewer).toBeVisible();
    await expect(page).toHaveURL(/\/rooms\/studio-with-balcony$/);
    const status = viewer.getByRole("status");
    await expect(status).toContainText("Photo 1 of 3");
    await expect(
      viewer.getByRole("button", { name: "Previous photo" }),
    ).toBeDisabled();

    await page.keyboard.press("ArrowRight");
    await expect(status).toContainText("Photo 2 of 3");
    await page.keyboard.press("End");
    await expect(status).toContainText("Photo 3 of 3");
    await expect(
      viewer.getByRole("button", { name: "Next photo" }),
    ).toBeDisabled();

    // Focus stays inside the modal viewer.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => document.activeElement?.closest("dialog") !== null,
        ),
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("the photo viewer responds to swipes", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Swipe is exercised on the phone viewport.");
    await page.goto("/rooms/studio-with-balcony");
    await page
      .getByRole("list", { name: "Photos of Studio with Balcony" })
      .getByRole("link")
      .first()
      .click();
    const stage = page.locator(".site-lightbox__stage");
    const box = (await stage.boundingBox())!;
    const y = box.y + box.height / 2;
    await stage.dispatchEvent("pointerdown", {
      clientX: box.x + box.width * 0.8,
      clientY: y,
    });
    await stage.dispatchEvent("pointerup", {
      clientX: box.x + box.width * 0.2,
      clientY: y,
    });
    await expect(page.locator(".site-lightbox [role=status]")).toContainText(
      "Photo 2 of 3",
    );
    await page.getByRole("button", { name: "Close photo viewer" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the mobile menu is a modal sheet", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The menu sheet is the phone navigation.");
    await page.goto("/");
    const toggle = page.locator("summary.site-menu__toggle");
    await toggle.click();
    const menu = page.getByRole("navigation", { name: "Main (menu)" });
    await expect(menu.getByRole("link", { name: "Rooms" })).toBeVisible();
    await expect(toggle).toHaveText("Close");
    expect(
      await page.evaluate(() => document.querySelector("main")!.inert),
    ).toBe(true);

    // Tab cycles within the sheet.
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => document.activeElement?.closest(".site-menu") !== null,
        ),
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(
      await page.evaluate(() => document.querySelector("main")!.inert),
    ).toBe(false);

    // A tap on the empty backdrop closes it too, once the sheet is down.
    await toggle.click();
    await expect(menu).toBeVisible();
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((animation) => animation.playState !== "running"),
    );
    const links = (await menu.boundingBox())!;
    await page.mouse.click(
      links.x + links.width / 2,
      links.y + links.height + 24,
    );
    await expect(menu).toBeHidden();
  });

  test("content below the fold is revealed on scroll", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".site-card");
    await expect(cards.first()).toBeAttached();
    await cards.first().scrollIntoViewIfNeeded();
    await expect(cards.first()).toHaveCSS("opacity", "1");
    await expect(cards.first()).toBeVisible();
  });

  test("the header tucks away reading down and returns reading up", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Scroll direction is exercised on desktop.");
    await page.goto("/");
    const header = page.locator(".site-header");
    await page.mouse.wheel(0, 1400);
    await expect(header).toHaveAttribute("data-tucked", "true");
    await page.mouse.wheel(0, -300);
    await expect(header).toHaveAttribute("data-tucked", "false");
    // Keyboard focus always brings it back.
    await page.mouse.wheel(0, 900);
    await expect(header).toHaveAttribute("data-tucked", "true");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Rooms" })
      .focus();
    await expect(header).toHaveCSS("transform", "none");
  });

  test("reduced motion shows everything immediately and holds still", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The reduced-motion pass runs once on desktop.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-reveal-state="hidden"]')).toHaveCount(0);
    await page.mouse.wheel(0, 1400);
    await expect(page.locator(".site-hero__parallax")).toHaveCSS(
      "transform",
      "none",
    );
    await expect(page.locator(".site-header")).toHaveCSS("transform", "none");
    await expect(page.locator(".site-split-title__char").first()).toHaveCSS(
      "opacity",
      "1",
    );
  });
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
