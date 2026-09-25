import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_PASSWORD } from "./accounts";

export async function signInAs(page: Page, email: string, returnTo = "/admin") {
  await page.goto(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${returnTo.replace(/[?]/g, "\\?")}$`),
  );
}

export async function sql(query: string, values: unknown[] = []) {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return await client.query(query, values);
  } finally {
    await client.end();
  }
}
