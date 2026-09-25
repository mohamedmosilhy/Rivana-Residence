import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run content E2E.",
);

async function expectNoAxeViolations(page: Page) {
  // Let entrance animations (e.g. toasts) finish so colours are final.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

async function confirm(page: Page, trigger: string, confirmLabel = trigger) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function createReadyImage(id: string) {
  // A library record with confirmed rights; no file is needed to choose it.
  await sql(
    `INSERT INTO "MediaAsset" (id, "storageProvider", "storageContainer", "storageKey",
       "originalFilename", "mimeType", bytes, width, height, "altText", status,
       "rightsStatus", "updatedAt")
     VALUES ($1, 'local', 'media', $2, $3, 'image/webp', 2048, 1600, 900,
       'Bedroom with a view of the river', 'READY', 'CONFIRMED', now())
     ON CONFLICT (id) DO NOTHING`,
    [id, `images/2026/09/${id}.webp`, `${id}.webp`],
  );
}

test("editors take a room from draft to published and back to archived", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const slug = `nile-suite-${project}`;
  const heroId = `e2ehero${project.replace(/[^a-z0-9]/g, "")}`;
  await createReadyImage(heroId);
  await signInAs(page, accountsFor(project).editor, "/admin/rooms/new");

  // Validation failure: explained, focused, nothing saved.
  await page.getByRole("button", { name: "Create draft" }).click();
  const summary = page
    .getByRole("alert")
    .filter({ hasText: "Room is invalid." });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link", { name: /^Name:/ })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill(`Nile Suite ${project}`);
  await expect(page.getByLabel("Web address")).toHaveValue(slug);
  await page
    .getByLabel("Short description")
    .fill("Wide windows over the Nile.");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Morning light.\n\n- Balcony");
  await page.getByLabel("Adults").fill("2");
  await page.getByRole("button", { name: "Add feature" }).click();
  await page.getByLabel("Feature 1", { exact: true }).fill("Rain shower");
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/admin\/rooms\/[a-z0-9]+\?notice=created$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Created as a draft" }),
  ).toBeVisible();
  await expect(page.getByText("Before this can be published:")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Choose hero image" }).click();
  const picker = page.getByRole("dialog", { name: "Choose hero image" });
  await picker.getByLabel("Search by description or file name").fill(heroId);
  await picker.getByRole("radio").check();
  await picker.getByRole("button", { name: "Use image" }).click();
  await page.getByRole("button", { name: "Save images" }).click();
  await expect(page.getByText("This room is ready to publish.")).toBeVisible();

  await confirm(page, "Publish");
  await expect(
    page.getByText("This room is live on the website."),
  ).toBeVisible();
  await expect(page.getByText(`/rooms/${slug}`, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Preview" }).click();
  await expect(
    page.getByRole("heading", { name: `Nile Suite ${project}`, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Rain shower" }),
  ).toBeVisible();
  await page.goBack();

  await confirm(page, "Unpublish");
  await expect(page.getByText("This room is ready to publish.")).toBeVisible();
  await confirm(page, "Archive");
  await expect(page.getByText("This room is archived.")).toBeVisible();
  // Editors can archive but never delete permanently.
  await expect(
    page.getByRole("button", { name: "Delete permanently" }),
  ).toHaveCount(0);

  await page.goto("/admin/rooms?status=ARCHIVED");
  await expect(
    page.getByRole("link", { name: `Nile Suite ${project}` }),
  ).toBeVisible();
});

test("administrators permanently delete an archived room", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const id = `e2e-archived-${project}`.slice(0, 32);
  await sql(
    `INSERT INTO "Room" (id, name, slug, "shortDescription", description, "maxAdults",
       "sortOrder", status, "updatedAt")
     VALUES ($1, $2, $3, 'Old room.', '{"type":"doc","content":[]}', 2, 999, 'ARCHIVED', now())
     ON CONFLICT (id) DO NOTHING`,
    [id, `Old room ${project}`, `old-room-${project}`],
  );
  await signInAs(page, accountsFor(project).admin, `/admin/rooms/${id}`);

  await confirm(page, "Delete permanently");
  await expect(page).toHaveURL(/\/admin\/rooms\?notice=deleted$/);
  await expect(page.getByText("Permanently deleted.")).toBeVisible();
  const { rows } = await sql(
    `SELECT count(*)::int AS count FROM "Room" WHERE id = $1`,
    [id],
  );
  expect(rows[0]).toEqual({ count: 0 });
});

test("editors create and update a facility", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signInAs(page, accountsFor(project).editor, "/admin/facilities/new");

  await page.getByLabel("Name", { exact: true }).fill(`Pool ${project}`);
  await page.getByLabel("Short description").fill("An outdoor pool.");
  await page.getByLabel(/Opening hours/).fill("Daily 7:00–22:00");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(
    /\/admin\/facilities\/[a-z0-9]+\?notice=created$/,
  );

  await page.getByLabel("Short description").fill("A heated outdoor pool.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Saved. Facility details are up to date." }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Short description")).toHaveValue(
    "A heated outdoor pool.",
  );
  await expect(page.getByLabel(/Opening hours/)).toHaveValue(
    "Daily 7:00–22:00",
  );
});

test("staff schedule, preview, and publish a promotion in the property time zone", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const code = `E2E-${project.slice(0, 6).toUpperCase()}`;
  await signInAs(page, accountsFor(project).editor, "/admin/promotions/new");

  await page.getByLabel("Internal name").fill(`Winter ${project}`);
  await page.getByLabel("Headline").fill("Winter by the pool");
  await page.getByLabel("Message").fill("Warm evenings on the terrace.");
  await page.getByLabel("Code", { exact: true }).fill(code);
  const preview = page.getByRole("complementary", { name: "Preview" });
  await expect(
    preview.getByRole("heading", { name: "Winter by the pool" }),
  ).toBeVisible();
  await expect(preview.getByText(code)).toBeVisible();

  await page
    .getByLabel(/Starts \(Africa\/Cairo time\)/)
    .fill("2030-01-10T09:00");
  await page.getByLabel(/Ends \(Africa\/Cairo time\)/).fill("2030-01-01T09:00");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ends:" }),
  ).toBeFocused();
  await expectNoAxeViolations(page);

  await page.getByLabel(/Ends \(Africa\/Cairo time\)/).fill("2030-02-01T09:00");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(
    /\/admin\/promotions\/[a-z0-9]+\?notice=created$/,
  );

  await confirm(page, "Publish");
  await expect(
    page.getByRole("note").filter({
      hasText: /Scheduled: it can start showing at 10 Jan 2030, 09:00/,
    }),
  ).toBeVisible();

  // 09:00 in Cairo (UTC+2 in January) is stored as 07:00 UTC.
  const { rows } = await sql(
    `SELECT to_char("startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS starts
     FROM "Promotion" WHERE code = $1`,
    [code],
  );
  expect(rows[0]).toEqual({ starts: "2030-01-10T07:00" });

  await page.goto("/admin/promotions?timing=scheduled");
  await expect(
    page.getByRole("link", { name: `Winter ${project}` }),
  ).toBeVisible();
});

test.describe("page editing", () => {
  // Pages are shared by both projects, so these run once, in order.
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "Page publication runs once, on desktop.",
  );

  test("editors update, reorder, publish, and unpublish the About page", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).editor,
      "/admin/pages/about",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "About page" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    const hero = page.locator("details").filter({ hasText: "1. Hero" });
    await hero.locator("summary").click();
    await hero.getByLabel("Title").fill("About Rivana Residence");
    await hero
      .getByRole("button", { name: "Save section", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Section saved." }),
    ).toBeVisible();

    // Required sections cannot be hidden; the Hero cannot move.
    const story = page.locator("details").filter({ hasText: "Image and text" });
    await story.locator("summary").click();
    await expect(
      story.getByLabel("Show this section on the page"),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Move up: Hero/ }),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Move up: Facts and figures: At a glance" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Section moved up." }),
    ).toBeVisible();
    await expect(page.locator("details summary").nth(1)).toContainText(
      "Facts and figures",
    );

    await confirm(page, "Publish");
    await expect(
      page.getByText("This page is live on the website."),
    ).toBeVisible();
    const { rows } = await sql(
      `SELECT "isPublished" FROM "Page" WHERE key = 'ABOUT'`,
    );
    expect(rows[0]).toEqual({ isPublished: true });

    await page.getByRole("link", { name: "Preview" }).click();
    await expect(page.getByText("About Rivana Residence")).toBeVisible();
    await page.goBack();

    await confirm(page, "Unpublish");
    await expect(
      page.getByText("This page is ready to publish."),
    ).toBeVisible();
  });

  test("an invalid section edit is explained and not saved", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).editor,
      "/admin/pages/contact",
    );
    const hero = page.locator("details").filter({ hasText: "1. Hero" });
    await hero.locator("summary").click();
    await hero.getByLabel("Title").fill("");
    await hero
      .getByRole("button", { name: "Save section", exact: true })
      .click();

    const summary = hero.getByRole("alert");
    await expect(summary).toBeFocused();
    await summary.getByRole("link").first().click();
    await expect(hero.getByLabel("Title")).toBeFocused();
  });
});
