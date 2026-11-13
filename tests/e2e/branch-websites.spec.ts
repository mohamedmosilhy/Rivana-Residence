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

// P5 runs in this final serial project so its temporary second-branch fixture
// cannot disturb the single-branch marketing and visual suites above.
test("P5 exposes the $260 worked example and fresh public availability", async ({
  page,
}, testInfo) => {
  const branch = "e2e-p5-branch";
  const room = "e2e-p5-room";
  const baseDate = new Date();
  baseDate.setUTCDate(baseDate.getUTCDate() + 30);
  const day = (offset: number) =>
    new Date(+baseDate + offset * 86_400_000).toISOString().slice(0, 10);
  const query = `checkIn=${day(0)}&checkOut=${day(4)}&adults=2&children=0`;
  const endpoint = `/api/v1/branches/e2e-p5/availability?${query}`;
  await sql(
    'INSERT INTO "Branch" (id, slug, name, status, "sortOrder", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', 99, now())',
    [branch, "e2e-p5", "Fictional P5 evidence branch"],
  );
  try {
    await sql(
      'INSERT INTO "Room" (id, "branchId", name, slug, "shortDescription", description, "maxAdults", status, "sortOrder", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, 2, \'PUBLISHED\', 99, now())',
      [
        room,
        branch,
        "Fictional P5 worked example",
        "e2e-p5-room",
        "Fictional availability test listing",
        JSON.stringify({ type: "doc", content: [] }),
      ],
    );
    for (const id of ["e2e-p5-u1", "e2e-p5-u2"])
      await sql(
        'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
        [id, branch, room],
      );
    await sql(
      'INSERT INTO "RatePeriod" (id, "roomTypeId", "startDate", "endDate", "amountMinor", "updatedAt") VALUES ($1, $2, $3::date, $4::date, 6000, now()), ($5, $2, $4::date, $6::date, 7000, now())',
      ["e2e-p5-first", room, day(0), day(2), "e2e-p5-second", day(4)],
    );
    await page.goto("/new-cairo");
    const read = (target: string) =>
      page.evaluate(async (url) => {
        const response = await fetch(url);
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.json(),
        };
      }, target);
    const first = await read(endpoint);
    expect(first.status).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.body.results).toHaveLength(1);
    expect(first.body.results[0]).toMatchObject({
      available: true,
      unitsAvailable: 2,
      accommodationTotal: { amountMinor: 26000, currency: "USD" },
    });
    expect(
      first.body.results[0].pricePerNight.map(
        (value: { amountMinor: number }) => value.amountMinor,
      ),
    ).toEqual([6000, 6000, 7000, 7000]);
    expect(JSON.stringify(first.body)).not.toMatch(
      /physicalRoomId|roomTypeId|capacity|blocked|branchId|e2e-p5-u/,
    );
    await testInfo.attach("p5-worked-example.json", {
      body: JSON.stringify(first, null, 2),
      contentType: "application/json",
    });
    expect(
      (await read(`${endpoint}&unitsRequested=2`)).body.results[0]
        .accommodationTotal.amountMinor,
    ).toBe(52000);
    expect((await read(`${endpoint}&unitsRequested=6`)).status).toBe(422);
    expect((await read(`${endpoint}&unknown=yes`)).status).toBe(400);
    expect((await read(`${endpoint}&adults=2`)).status).toBe(400);
    await sql('UPDATE "RatePeriod" SET "amountMinor" = 8000 WHERE id = $1', [
      "e2e-p5-first",
    ]);
    expect(
      (await read(endpoint)).body.results[0].accommodationTotal.amountMinor,
    ).toBe(30000);
    await sql('UPDATE "PhysicalRoom" SET active = false WHERE id = $1', [
      "e2e-p5-u1",
    ]);
    expect(
      (await read(`${endpoint}&unitsRequested=2`)).body.results[0],
    ).toMatchObject({
      available: false,
      unitsAvailable: 1,
      reason: "SOLD_OUT",
    });
    await sql("UPDATE \"Branch\" SET status = 'INACTIVE' WHERE id = $1", [
      branch,
    ]);
    expect((await read(endpoint)).status).toBe(404);
  } finally {
    await sql('DELETE FROM "RatePeriod" WHERE "roomTypeId" = $1', [room]);
    await sql('DELETE FROM "PhysicalRoom" WHERE "branchId" = $1', [branch]);
    await sql('DELETE FROM "Room" WHERE id = $1', [room]);
    await sql('DELETE FROM "Branch" WHERE id = $1', [branch]);
  }
});

// P6 runs here for the same reason as P5: a temporary second branch with its
// own fictional listing, services, and coupon, removed afterwards.
test("P6 quotes the $391 worked example from server owned prices", async ({
  page,
}, testInfo) => {
  const branch = "e2e-p6-branch";
  const room = "e2e-p6-room";
  const baseDate = new Date();
  baseDate.setUTCDate(baseDate.getUTCDate() + 30);
  const day = (offset: number) =>
    new Date(+baseDate + offset * 86_400_000).toISOString().slice(0, 10);
  const line = (adults: number, children: number) => ({
    roomSlug: "e2e-p6-room",
    occupancy: { adults, children },
  });
  const quote = (overrides: Record<string, unknown> = {}) => ({
    branchSlug: "e2e-p6",
    stay: { checkIn: day(0), checkOut: day(3) },
    lines: [line(2, 1)],
    services: ["BREAKFAST", "AIRPORT_TRANSFER"],
    ...overrides,
  });
  await sql(
    'INSERT INTO "Branch" (id, slug, name, status, "sortOrder", "onlineBookingEnabled", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', 99, true, now())',
    [branch, "e2e-p6", "Fictional P6 evidence branch"],
  );
  try {
    await sql(
      'INSERT INTO "Room" (id, "branchId", name, slug, "shortDescription", description, "maxAdults", "maxChildren", status, "sortOrder", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, 3, 2, \'PUBLISHED\', 99, now())',
      [
        room,
        branch,
        "Fictional P6 worked example",
        "e2e-p6-room",
        "Fictional quote test listing",
        JSON.stringify({ type: "doc", content: [] }),
      ],
    );
    await sql(
      'INSERT INTO "PhysicalRoom" (id, "branchId", "roomTypeId", label, "updatedAt") VALUES ($1, $2, $3, $1, now())',
      ["e2e-p6-u1", branch, room],
    );
    await sql(
      'INSERT INTO "RoomBaseRate" ("roomTypeId", "amountMinor", "updatedAt") VALUES ($1, 8000, now())',
      [room],
    );
    await sql(
      'INSERT INTO "ServiceOffering" (id, "branchId", kind, "priceUnit", "priceMinor", "childPriceMinor", active, "updatedAt") VALUES ($1, $3, \'BREAKFAST\', \'PER_PERSON_PER_NIGHT\', 1000, 500, true, now()), ($2, $3, \'AIRPORT_TRANSFER\', \'PER_BOOKING\', 2500, NULL, true, now())',
      ["e2e-p6-breakfast", "e2e-p6-transfer", branch],
    );
    await sql(
      'INSERT INTO "Coupon" (id, code, kind, "amountMinor", "allBranches", active, "updatedAt") VALUES ($1, $2, \'FIXED\', 99999, true, true, now())',
      ["e2e-p6-coupon", "E2E-P6-FIXED"],
    );
    await page.goto("/new-cairo");
    const call = (body: unknown) =>
      page.evaluate(async (payload) => {
        const response = await fetch("/api/v1/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.json(),
        };
      }, body);

    const first = await call(quote());
    expect(first.status).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.body).toMatchObject({
      available: true,
      bookable: true,
      quote: {
        accommodation: { amountMinor: 24000 },
        servicesTotal: { amountMinor: 10000 },
        subtotal: { amountMinor: 34000 },
        vat: { amountMinor: 5100 },
        total: { amountMinor: 39100, currency: "USD" },
      },
    });
    expect(JSON.stringify(first.body)).not.toMatch(
      /roomTypeId|branchId|physicalRoom|e2e-p6-u1|periodId/,
    );
    await testInfo.attach("p6-worked-example.json", {
      body: JSON.stringify(first, null, 2),
      contentType: "application/json",
    });

    // A fixed coupon above the subtotal gives total 0 (worked example 4 rule).
    const free = await call(quote({ couponCode: "e2e-p6-fixed" }));
    expect(free.body.quote).toMatchObject({
      discount: { amountMinor: 34000 },
      taxable: { amountMinor: 0 },
      total: { amountMinor: 0 },
    });
    expect(
      (await call(quote({ couponCode: "NOT-A-CODE" }))).body,
    ).toMatchObject({
      code: "COUPON_INVALID",
      context: { reason: "NOT_FOUND" },
    });
    // Services are only added when requested; a client price is refused.
    expect(
      (await call(quote({ services: [] }))).body.quote.total,
    ).toMatchObject({
      amountMinor: 27600,
    });
    expect(
      (await call(quote({ total: { amountMinor: 1, currency: "USD" } })))
        .status,
    ).toBe(422);
    // Only one unit exists, so two units are unavailable and nothing is quoted.
    expect(
      await call(quote({ lines: [line(1, 0), line(1, 0)] })).then(
        (r) => r.body,
      ),
    ).toMatchObject({
      available: false,
      unavailableLines: [0, 1],
      quote: null,
    });
    await sql('UPDATE "ServiceOffering" SET active = false WHERE id = $1', [
      "e2e-p6-transfer",
    ]);
    expect((await call(quote())).body).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      context: { kind: "AIRPORT_TRANSFER" },
    });
  } finally {
    await sql('DELETE FROM "ServiceOffering" WHERE "branchId" = $1', [branch]);
    await sql('DELETE FROM "Coupon" WHERE id = $1', ["e2e-p6-coupon"]);
    await sql('DELETE FROM "RoomBaseRate" WHERE "roomTypeId" = $1', [room]);
    await sql('DELETE FROM "PhysicalRoom" WHERE "branchId" = $1', [branch]);
    await sql('DELETE FROM "Room" WHERE id = $1', [room]);
    await sql('DELETE FROM "Branch" WHERE id = $1', [branch]);
  }
});
