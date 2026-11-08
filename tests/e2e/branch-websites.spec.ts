import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// Spec 0002 (M5): branch websites with two active branches. This project
// runs last: it activates the seeded `demo-giza` branch through the admin
// screen (so the server's cache is expired the real way), which turns `/`
// into the chooser.

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run branch E2E.",
);
test.describe.configure({ mode: "serial" });

const GIZA = "Rivana Giza (demo)";

async function expectNoAxeViolations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openBranch(page: Page, name: string) {
  await page.goto("/admin/branches");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("an administrator activates the second branch", async ({
  page,
}, testInfo) => {
  await signInAs(page, accountsFor(testInfo.project.name).admin);
  await openBranch(page, GIZA);
  await page.getByLabel("Status").selectOption("ACTIVE");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Saved. The branch website shows the new details."),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});

// Owner decision 2026-11-07: the old URLs redirect to new-cairo.
test("the default branch cannot be deactivated", async ({ page }, testInfo) => {
  await signInAs(page, accountsFor(testInfo.project.name).admin);
  await openBranch(page, "Rivana Residence");
  await page.getByLabel("Status").selectOption("INACTIVE");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText(/receives the old website addresses/).first(),
  ).toBeVisible();
});

// E2E-S-1, AC-3, AC-10: the chooser lists both branches and opens each.
test("the home page becomes the branch chooser", async ({ page, request }) => {
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(200);

  await page.goto("/");
  const cards = page.locator("[data-branch-card]");
  await expect(cards).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Rivana Residence", exact: true }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("link", { name: GIZA, exact: true }).click();
  await expect(page).toHaveURL(/\/demo-giza$/);
  await expect(
    page.getByRole("heading", { level: 1, name: GIZA }),
  ).toBeVisible();

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/</loc>");
  expect(sitemap).toContain(
    "http://127.0.0.1:3100/demo-giza/stay/giza-family-apartment",
  );
});

// E2E-S-2, AC-3: the switcher keeps the page type, or falls back.
test("the header switcher keeps the page type", async ({ page }) => {
  await page.goto("/new-cairo/stay/deluxe-double");
  const switcher = page
    .locator("[data-site-header] [data-branch-switcher]")
    .first();
  await switcher.locator("summary").click();
  await switcher.getByRole("link", { name: GIZA }).click();
  await expect(page).toHaveURL(/\/demo-giza\/stay$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Rooms & Apartments" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", {
      name: "Rooms & Apartments",
    }),
  ).toBeVisible();

  await page.goto("/demo-giza/about");
  const again = page
    .locator("[data-site-header] [data-branch-switcher]")
    .first();
  await again.locator("summary").click();
  await again.getByRole("link", { name: "Rivana Residence" }).click();
  await expect(page).toHaveURL(/\/new-cairo\/about$/);
});

// E2E-S-3, AC-4: one branch's content never shows under the other.
test("each branch shows only its own content", async ({ page, request }) => {
  await page.goto("/demo-giza/stay");
  const main = page.locator("main");
  await expect(
    main.getByRole("link", { name: "Giza Family Apartment" }),
  ).toBeVisible();
  await expect(main.getByRole("link", { name: "Deluxe Double" })).toHaveCount(
    0,
  );

  await page.goto("/new-cairo/stay");
  await expect(main.getByRole("link", { name: "Deluxe Double" })).toBeVisible();
  await expect(main.getByText("Giza Family Apartment")).toHaveCount(0);

  for (const path of [
    "/demo-giza/stay/deluxe-double",
    "/new-cairo/stay/giza-family-apartment",
    "/new-cairo/facilities/giza-pool",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const api = await request.get(
    "/api/v1/branches/demo-giza/room-types/deluxe-double",
  );
  expect(api.status()).toBe(404);

  await page.goto("/demo-giza");
  const footer = page.locator("footer");
  await expect(footer.getByText("+20 2 9876 5432")).toBeVisible();
  await expect(footer.getByText("+20 2 1234 5678")).toHaveCount(0);
});

// AC-8 (review of M5): no two branches share a page title.
test("every page title names its branch once there are two", async ({
  page,
}) => {
  const titles = new Map<string, string>();
  for (const branch of ["new-cairo", "demo-giza"]) {
    for (const path of ["", "/about", "/contact", "/stay", "/facilities"]) {
      await page.goto(`/${branch}${path}`);
      const title = await page.title();
      expect(titles.has(title), `${branch}${path}: ${title}`).toBe(false);
      titles.set(title, `${branch}${path}`);
    }
  }
});

// AC-5, AC-9: badge, apartment facts, Accommodation JSON-LD, honest Book Now.
test("an apartment shows its badge and facts", async ({ page }) => {
  await page.goto("/demo-giza/stay/giza-family-apartment");
  await expect(
    page.locator('[data-accommodation="APARTMENT"]').first(),
  ).toBeVisible();
  await expect(page.getByText("2 bedrooms").first()).toBeVisible();
  await expect(page.getByText("2 bathrooms").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "In the apartment" }),
  ).toBeVisible();
  const structured = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).map((value) => JSON.parse(value) as Record<string, unknown>);
  expect(structured.map((value) => value["@type"])).toEqual(
    expect.arrayContaining(["Hotel", "Accommodation"]),
  );
  const bookNow = page.locator("[data-book-now]").first();
  await expect(bookNow).toHaveAttribute("data-branch", "demo-giza");
  await expect(
    bookNow.getByRole("button", { name: "Book now" }),
  ).toHaveAttribute("aria-disabled", "true");
  await expectNoAxeViolations(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await expectNoHorizontalScroll(page);
});

// E2E-S-5, AC-6: the map, and the fallback when frames are blocked.
test("each Contact page shows its own map, with a working fallback", async ({
  page,
}) => {
  await page.goto("/demo-giza/contact");
  await expect(page.getByTitle(`Map showing ${GIZA}`)).toHaveAttribute(
    "src",
    "https://www.google.com/maps/embed?pb=demo-giza",
  );
  await expect(
    page.getByRole("heading", { name: `Visit ${GIZA}` }),
  ).toBeVisible();

  await page.route("https://www.google.com/**", (route) => route.abort());
  await page.goto("/demo-giza/contact");
  await expect(page.getByText("Demo Street 1").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open directions in Google Maps/ }),
  ).toHaveAttribute("href", /query=30\.0444,30\.98/);

  await page.goto("/new-cairo/contact");
  await expect(page.locator('iframe[title^="Map showing"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Open directions in Google Maps/ }).first(),
  ).toBeVisible();
});

// AC-7: no promotion popup anywhere on the public site.
test("no public page ships promotion markup", async ({ page }) => {
  for (const path of [
    "/",
    "/new-cairo",
    "/demo-giza/stay",
    "/new-cairo/contact",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await page.content()).toLowerCase()).not.toContain("promotion");
  }
});

// AC-13: the CMS lists each branch's records.
test("the CMS branch selector lists one branch's listings", async ({
  page,
}, testInfo) => {
  await signInAs(
    page,
    accountsFor(testInfo.project.name).editor,
    "/admin/rooms",
  );
  await page.getByLabel("Branch").selectOption({ label: GIZA });
  await page.getByRole("button", { name: "Show branch" }).click();
  await expect(page).toHaveURL(/branch=demo-giza/);
  await expect(
    page.getByRole("link", { name: "Giza Family Apartment" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Deluxe Double" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Add room" }).first().click();
  await expect(page.getByLabel("Branch")).toHaveValue("demo-giza");
});

// AC-11: contact and map moved from Settings to the branch form.
test("settings no longer edit contact details", async ({ page }, testInfo) => {
  await signInAs(
    page,
    accountsFor(testInfo.project.name).admin,
    "/admin/settings",
  );
  await expect(page.getByLabel("Phone")).toHaveCount(0);
  await expect(page.getByLabel("Google Maps embed link")).toHaveCount(0);
  await expect(
    page.getByText("Contact details, address, and map are set on each branch."),
  ).toBeVisible();
});

async function browserApi(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return page.evaluate(
    async (input) => {
      const response = await fetch(input.path, {
        method: input.method,
        ...(input.body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input.body),
            }),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
    { path, method, body },
  );
}

// Audit F02/F03: these requests use real browser cookies and the real Next
// cache runtime. They run last so temporary activation cannot disturb the
// single-branch public/visual projects.
test("staff REST writes succeed and immediately refresh public branch data", async ({
  page,
}, testInfo) => {
  const path = "/api/v1/staff/branches";
  await page.goto("/admin/login");
  expect((await browserApi(page, path)).status).toBe(401);
  await signInAs(page, accountsFor(testInfo.project.name).admin);
  expect((await browserApi(page, path)).status).toBe(200);

  const slug = "api-cache-regression-" + testInfo.retry;
  const created = await browserApi(page, path, "POST", {
    slug,
    name: "API cache regression",
  });
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("INACTIVE");
  const id = String(created.body.id);
  const itemPath = path + "/" + id;

  try {
    const saved = await sql(
      'SELECT (SELECT count(*)::int FROM "Page" WHERE "branchId" = $1) AS pages, (SELECT count(*)::int FROM "AuditEvent" WHERE "entityId" = $1 AND action = $2) AS audits',
      [id, "branch.created"],
    );
    expect(saved.rows[0]).toEqual({ pages: 3, audits: 1 });

    // Prime the active-branch cache with this branch absent.
    const publicPath = "/api/v1/branches/" + slug;
    expect((await browserApi(page, publicPath)).status).toBe(404);
    const activated = await browserApi(page, itemPath, "PATCH", {
      status: "ACTIVE",
    });
    expect(activated.status).toBe(200);
    expect((await browserApi(page, publicPath)).status).toBe(200);

    const updatedName = "Updated through the staff API";
    expect(
      (await browserApi(page, itemPath, "PATCH", { name: updatedName })).status,
    ).toBe(200);
    const fresh = await browserApi(page, publicPath);
    expect(fresh.status).toBe(200);
    expect(fresh.body.name).toBe(updatedName);

    // The HTTP client does not send Secure cookies over this HTTP test
    // origin. Forward the real browser session only for this CSRF probe,
    // where Chrome would otherwise replace a spoofed Origin header.
    const cookie = (await page.context().cookies())
      .filter((item) => item.name.endsWith("rivana-staff.session_token"))
      .map((item) => item.name + "=" + item.value)
      .join("; ");
    expect(
      (await page.request.get(path, { headers: { cookie } })).status(),
    ).toBe(200);
    const refused = await page.request.patch(itemPath, {
      headers: {
        cookie,
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      data: { name: "Must not be saved" },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "CROSS_SITE_REQUEST" });
    expect((await browserApi(page, publicPath)).body.name).toBe(updatedName);
  } finally {
    expect(
      (await browserApi(page, itemPath, "PATCH", { status: "INACTIVE" }))
        .status,
    ).toBe(200);
    expect((await browserApi(page, "/api/v1/branches/" + slug)).status).toBe(
      404,
    );
  }
});

test("staff REST preserves role and branch restrictions after browser sign-in", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  for (const role of ["manager", "editor"] as const) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInAs(page, accounts[role]);
      const listed = await browserApi(page, "/api/v1/staff/branches");
      if (role === "manager") {
        expect(listed.status).toBe(200);
        expect(listed.body).toEqual({
          items: [expect.objectContaining({ slug: "new-cairo" })],
        });
      } else {
        expect(listed.status).toBe(403);
      }
      const refused = await browserApi(page, "/api/v1/staff/branches", "POST", {
        slug: "forbidden-api-branch",
        name: "Must not be created",
      });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("FORBIDDEN");
    } finally {
      await context.close();
    }
  }
  const saved = await sql(
    'SELECT count(*)::int AS n FROM "Branch" WHERE slug = $1',
    ["forbidden-api-branch"],
  );
  expect(saved.rows[0].n).toBe(0);
});
