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

test("signed-out admin requests land on an accessible, noindex login", async ({
  page,
}) => {
  const response = await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(
    page.getByRole("heading", { level: 1, name: "Staff sign in" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(
    page.getByRole("link", { name: /sign up|register/i }),
  ).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
