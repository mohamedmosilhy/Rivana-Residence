import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run promotion E2E.",
);
// One shared site: campaigns build on each other in order.
test.describe.configure({ mode: "serial" });

type Campaign = Readonly<{
  name: string;
  headline: string;
  code: string;
  priority: number;
  startsAt?: string;
  endsAt?: string;
  publish: boolean;
}>;

/** Creates (and optionally publishes) a promotion through the admin. */
async function createCampaign(page: Page, campaign: Campaign) {
  await page.goto("/admin/promotions/new");
  await page.getByLabel("Internal name").fill(campaign.name);
  await page.getByLabel("Headline").fill(campaign.headline);
  await page.getByLabel("Message").fill("Stay three nights, enjoy the pool.");
  await page.getByLabel("Code", { exact: true }).fill(campaign.code);
  await page.getByLabel("Priority").fill(String(campaign.priority));
  if (campaign.startsAt)
    await page.getByLabel(/Starts/).fill(campaign.startsAt);
  if (campaign.endsAt) await page.getByLabel(/Ends/).fill(campaign.endsAt);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/notice=created/);
  if (campaign.publish) {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
  }
}

async function freshVisitor(
  browser: Browser,
  options: { clipboard?: boolean } = {},
) {
  const context = await browser.newContext({
    ...(options.clipboard
      ? { permissions: ["clipboard-read", "clipboard-write"] }
      : {}),
  });
  return { context, page: await context.newPage() };
}

function popup(page: Page) {
  return page.locator("dialog.promotion-popup");
}

test("renders nothing when no campaign is active", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);
  await expect(popup(page)).toHaveCount(0);
});

test("shows the active campaign after the page loads, copies the code, and remembers dismissal", async ({
  page,
  browser,
}) => {
  await signInAs(page, accountsFor("promotions").editor, "/admin/promotions");
  await createCampaign(page, {
    name: "E2E Autumn",
    headline: "Autumn by the pool",
    code: "AUTUMN-E2E",
    priority: 1,
    publish: true,
  });

  const visitor = await freshVisitor(browser, { clipboard: true });
  await visitor.page.goto("/");
  // Primary content is there before the popup opens.
  await expect(visitor.page.getByRole("heading", { level: 1 })).toBeVisible();
  const dialog = visitor.page.getByRole("dialog", {
    name: "Autumn by the pool",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("AUTUMN-E2E")).toBeVisible();
  await expect(dialog).toContainText(
    "The reservation system confirms eligibility",
  );
  const { violations } = await new AxeBuilder({ page: visitor.page }).analyze();
  expect(violations).toEqual([]);

  await dialog.getByRole("button", { name: "Copy code" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Code AUTUMN-E2E copied.",
  );
  expect(
    await visitor.page.evaluate(() => navigator.clipboard.readText()),
  ).toBe("AUTUMN-E2E");

  await visitor.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // The dialog hides at once; its close event (which records the
  // dismissal) is dispatched in a later task.
  const readDismissal = () =>
    visitor.page.evaluate(() =>
      JSON.parse(localStorage.getItem("rivana.promotion.dismissed") ?? "null"),
    );
  await expect.poll(readDismissal).not.toBeNull();
  const stored = await readDismissal();
  expect(stored).toMatchObject({ version: 1 });
  expect(Object.keys(stored).sort()).toEqual([
    "dismissedUntil",
    "promotionId",
    "version",
  ]);

  await visitor.page.reload();
  await visitor.page.waitForTimeout(2000);
  await expect(popup(visitor.page)).toBeHidden();
  await visitor.context.close();
});

test("keeps the code selectable when copying is not available", async ({
  browser,
}) => {
  const visitor = await freshVisitor(browser);
  await visitor.page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await visitor.page.goto("/rooms");
  const dialog = visitor.page.getByRole("dialog", {
    name: "Autumn by the pool",
  });
  await dialog.getByRole("button", { name: "Copy code" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Select the code above and copy it",
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await visitor.context.close();
});

test("the highest-priority live campaign wins; drafts, ended, and future ones never show", async ({
  page,
  browser,
}) => {
  await signInAs(page, accountsFor("promotions").editor, "/admin/promotions");
  await createCampaign(page, {
    name: "E2E Winter",
    headline: "Winter warmth",
    code: "WINTER-E2E",
    priority: 5,
    publish: true,
  });
  await createCampaign(page, {
    name: "E2E Draft",
    headline: "Draft offer",
    code: "DRAFT-E2E",
    priority: 99,
    publish: false,
  });
  await createCampaign(page, {
    name: "E2E Ended",
    headline: "Ended offer",
    code: "ENDED-E2E",
    priority: 50,
    startsAt: "2020-01-01T09:00",
    endsAt: "2020-02-01T09:00",
    publish: true,
  });
  await createCampaign(page, {
    name: "E2E Future",
    headline: "Future offer",
    code: "FUTURE-E2E",
    priority: 60,
    startsAt: "2035-01-01T09:00",
    publish: true,
  });

  const visitor = await freshVisitor(browser);
  await visitor.page.goto("/");
  await expect(
    visitor.page.getByRole("dialog", { name: "Winter warmth" }),
  ).toBeVisible();
  await expect(
    visitor.page.getByText(/Draft offer|Ended offer|Future offer/),
  ).toHaveCount(0);
  await visitor.context.close();
});

test("a new version of a dismissed campaign shows again", async ({
  page,
  browser,
}) => {
  const visitor = await freshVisitor(browser);
  await visitor.page.goto("/");
  const dialog = visitor.page.getByRole("dialog", { name: "Winter warmth" });
  await dialog.getByRole("button", { name: "Close" }).click();

  await signInAs(page, accountsFor("promotions").editor, "/admin/promotions");
  const { rows } = await sql(
    `SELECT id FROM "Promotion" WHERE "internalName" = 'E2E Winter'`,
  );
  await page.goto(`/admin/promotions/${rows[0].id}`);
  await page.getByLabel("Message").fill("New: late checkout included.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();

  await visitor.page.reload();
  await expect(
    visitor.page.getByRole("dialog", { name: "Winter warmth" }),
  ).toContainText("late checkout");
  await visitor.context.close();
});

test.afterAll(async () => {
  await sql(
    `UPDATE "Promotion" SET status = 'ARCHIVED' WHERE "internalName" LIKE 'E2E %'`,
  );
});
