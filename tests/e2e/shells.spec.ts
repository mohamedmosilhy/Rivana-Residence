import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public foundation shell is semantic and accessible", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Rivana Residence" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("admin foundation is noindex and contains no business controls", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.getByRole("button")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
