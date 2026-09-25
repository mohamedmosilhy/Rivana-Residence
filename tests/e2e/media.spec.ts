import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run media E2E.",
);

async function expectNoAxeViolations(page: Page) {
  // Let entrance animations (e.g. toasts) finish so colours are final.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  // Scan the rendered page, not a loading state.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

/** Writes a distinct JPEG per project and name so uploads never collide. */
async function fixture(name: string, project: string, color: string) {
  const directory = path.join("test-results", "media-fixtures", project);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name);
  await writeFile(
    file,
    await sharp({
      create: { width: 320, height: 240, channels: 3, background: color },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="320" height="240"><text x="10" y="120" font-size="28">${project} ${name}</text></svg>`,
          ),
        },
      ])
      .jpeg()
      .toBuffer(),
  );
  return file;
}

async function upload(page: Page, files: string[]) {
  await page
    .getByLabel(/I confirm Rivana Residence may use these images/)
    .check();
  await page.getByLabel("Choose images", { exact: true }).setInputFiles(files);
  for (const file of files) {
    await expect(
      page.locator(".admin-upload").filter({ hasText: path.basename(file) }),
    ).toContainText("Uploaded");
  }
}

async function assetIdFor(filename: string) {
  const { rows } = await sql(
    `SELECT id, "storageKey" FROM "MediaAsset" WHERE "originalFilename" = $1 AND status = 'READY'`,
    [filename],
  );
  return rows[0] as { id: string; storageKey: string };
}

test("editors upload, describe, place, reorder, and replace images", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  const names = ["hero", "gallery-a", "gallery-b", "replacement"].map(
    (name) => `${project}-${name}.jpg`,
  );
  const [heroFile, galleryA, galleryB] = await Promise.all([
    fixture(names[0]!, project, "#7a3b5c"),
    fixture(names[1]!, project, "#2f6f47"),
    fixture(names[2]!, project, "#9a6417"),
  ]);
  await signInAs(page, accountsFor(project).editor, "/admin/media");

  // Upload: rights must be confirmed first; progress is shown per file.
  await page
    .getByLabel("Choose images", { exact: true })
    .setInputFiles([heroFile!]);
  await expect(
    page.getByText("Confirm the usage rights before uploading."),
  ).toBeVisible();
  await upload(page, [heroFile!, galleryA!, galleryB!]);
  await page.reload();
  await expect(
    page.locator(".admin-media-card").filter({ hasText: names[0]! }),
  ).toContainText("Missing alt text");
  await expectNoAxeViolations(page);

  // Describe the hero image and set its focal point.
  const hero = await assetIdFor(names[0]!);
  await page.goto(`/admin/media/${hero.id}`);
  await page
    .getByLabel("Alt text", { exact: true })
    .fill(`Nile Suite bedroom ${project}`);
  await page.getByLabel("From the left (%)").fill("30");
  await page.getByLabel("From the top (%)").fill("70");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Image details saved." }),
  ).toBeVisible();
  await expect(page.locator(".admin-focal__marker")).toHaveAttribute(
    "style",
    /left: 30%; top: 70%/,
  );
  await expectNoAxeViolations(page);
  for (const name of [names[1]!, names[2]!]) {
    const asset = await assetIdFor(name);
    await sql(`UPDATE "MediaAsset" SET "altText" = $2 WHERE id = $1`, [
      asset.id,
      `Photo ${name}`,
    ]);
  }

  // Place images on a room through the keyboard-friendly picker.
  const roomId = `e2e-media-room-${project}`.slice(0, 32);
  await sql(
    `INSERT INTO "Room" (id, name, slug, "shortDescription", description, "maxAdults", "sortOrder", status, "updatedAt")
     VALUES ($1, $2, $3, 'A room for images.', '{"type":"doc","content":[]}', 2, $4, 'DRAFT', now())
     ON CONFLICT (id) DO NOTHING`,
    // Active rooms need distinct positions, so each project gets its own.
    [
      roomId,
      `Media room ${project}`,
      `media-room-${project}`,
      project.startsWith("mobile") ? 501 : 500,
    ],
  );
  await page.goto(`/admin/rooms/${roomId}`);
  await page.getByRole("button", { name: "Choose hero image" }).click();
  const picker = page.getByRole("dialog", { name: "Choose hero image" });
  await expect(
    picker.getByLabel("Search by description or file name"),
  ).toBeFocused();
  await page.keyboard.type(`Nile Suite bedroom ${project}`);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await picker.getByRole("button", { name: "Use image" }).click();
  await expect(picker).toBeHidden();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Add images" }).click();
  const gallery = page.getByRole("dialog", { name: "Add to gallery" });
  await gallery.getByLabel("Search by description or file name").fill(project);
  await gallery.getByRole("checkbox", { name: new RegExp(names[1]!) }).check();
  await gallery.getByRole("checkbox", { name: new RegExp(names[2]!) }).check();
  await gallery.getByRole("button", { name: "Use 2 images" }).click();
  await page
    .getByRole("button", { name: `Move up: Photo ${names[2]}` })
    .click();
  await page.getByRole("button", { name: "Save images" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Images saved." }),
  ).toBeVisible();
  await expect(page.getByText("This room is ready to publish.")).toBeVisible();

  const { rows: placed } = await sql(
    `SELECT m."originalFilename" AS name, rm.role, rm."sortOrder" FROM "RoomMedia" rm
     JOIN "MediaAsset" m ON m.id = rm."mediaId" WHERE rm."roomId" = $1 ORDER BY rm.role, rm."sortOrder"`,
    [roomId],
  );
  // Roles sort in enum order (HERO, then GALLERY).
  expect(placed).toEqual([
    { name: names[0], role: "HERO", sortOrder: 0 },
    { name: names[2], role: "GALLERY", sortOrder: 0 },
    { name: names[1], role: "GALLERY", sortOrder: 1 },
  ]);

  // Replace the hero everywhere: the new file is verified before anything changes.
  const replacementFile = await fixture(names[3]!, project, "#1f1b1d");
  await page.goto(`/admin/media/${hero.id}`);
  await page
    .getByLabel(/I confirm Rivana Residence may use these images/)
    .check();
  await page
    .getByLabel("Choose an image", { exact: true })
    .setInputFiles(replacementFile);
  await page
    .getByRole("button", { name: "Use the new image everywhere" })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("takes its place in 1 place");
  await confirm.getByRole("button", { name: "Replace" }).click();
  await expect(page).toHaveURL(/notice=replaced/);
  await expect(page.getByLabel("Alt text", { exact: true })).toHaveValue(
    `Nile Suite bedroom ${project}`,
  );
  const { rows: heroRow } = await sql(
    `SELECT m."originalFilename" AS name FROM "RoomMedia" rm JOIN "MediaAsset" m ON m.id = rm."mediaId"
     WHERE rm."roomId" = $1 AND rm.role = 'HERO'`,
    [roomId],
  );
  expect(heroRow[0]).toEqual({ name: names[3] });
});

test("rejected uploads explain why and never become public", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const directory = path.join("test-results", "media-fixtures", project);
  await mkdir(directory, { recursive: true });
  const fake = path.join(directory, `${project}-not-an-image.jpg`);
  await writeFile(fake, "<html><script>alert(1)</script></html>");
  await signInAs(page, accountsFor(project).editor, "/admin/media");

  await page
    .getByLabel(/I confirm Rivana Residence may use these images/)
    .check();
  await page.getByLabel("Choose images", { exact: true }).setInputFiles(fake);
  const row = page
    .locator(".admin-upload")
    .filter({ hasText: path.basename(fake) });
  await expect(row).toContainText("The file is not a readable image.");
  await expect(row.getByRole("button", { name: /Try again/ })).toBeVisible();

  const { rows } = await sql(
    `SELECT status, "storageKey" FROM "MediaAsset" WHERE "originalFilename" = $1`,
    [path.basename(fake)],
  );
  expect(rows[0]).toMatchObject({ status: "FAILED" });
  expect(
    (await page.request.get(`/media/${rows[0].storageKey}`)).status(),
  ).toBe(404);
});

test("the upload endpoint refuses signed-out requests", async ({
  page,
  playwright,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL!;
  const anonymous = await playwright.request.newContext({ baseURL });
  const signedOut = await anonymous.post("/admin/media/upload", {
    headers: {
      Origin: baseURL,
      "Content-Type": "image/png",
    },
    data: Buffer.from("x"),
    maxRedirects: 0,
  });
  expect([307, 401]).toContain(signedOut.status());
  await anonymous.dispose();

  // The cross-site Origin check is unit-tested in
  // tests/unit/media/upload-origin.test.ts: Playwright's API client drops the
  // Secure session cookie over plain HTTP, so a signed-in cross-site request
  // cannot be reproduced here.
  void page;
});

test.describe("administrator media management", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Runs once, on desktop.");

  test("serves only ready images with strict headers and ranges", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    const file = await fixture(`${project}-served.jpg`, project, "#652a4c");
    await signInAs(page, accountsFor(project).admin, "/admin/media");
    await upload(page, [file]);
    const asset = await assetIdFor(path.basename(file));

    const response = await page.request.get(`/media/${asset.storageKey}`);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
      "accept-ranges": "bytes",
    });
    expect(response.headers()["content-security-policy"]).toContain("sandbox");
    const etag = response.headers().etag!;

    const partial = await page.request.get(`/media/${asset.storageKey}`, {
      headers: { Range: "bytes=0-9" },
    });
    expect(partial.status()).toBe(206);
    expect((await partial.body()).byteLength).toBe(10);
    expect(
      (
        await page.request.get(`/media/${asset.storageKey}`, {
          headers: { "If-None-Match": etag },
        })
      ).status(),
    ).toBe(304);

    for (const bad of [
      "images/../../etc/passwd",
      "quarantine/x.upload",
      "images/2026/09/nothing.jpg",
    ]) {
      expect((await page.request.get(`/media/${bad}`)).status()).toBe(404);
    }
  });

  test("blocks deleting an image in use and deletes an unused one", async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    const usedFile = await fixture(`${project}-used.jpg`, project, "#322e30");
    const unusedFile = await fixture(
      `${project}-unused.jpg`,
      project,
      "#d9d4d6",
    );
    await signInAs(page, accountsFor(project).admin, "/admin/media");
    await upload(page, [usedFile, unusedFile]);
    const used = await assetIdFor(path.basename(usedFile));
    const unused = await assetIdFor(path.basename(unusedFile));
    await sql(
      `UPDATE "SiteSettings" SET "logoMediaId" = $1 WHERE id = 'default'`,
      [used.id],
    );

    await page.goto(`/admin/media/${used.id}`);
    await expect(page.getByText(/so it cannot be deleted/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete image" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Site settings" }),
    ).toBeVisible();

    await page.goto(`/admin/media/${unused.id}`);
    await page.getByRole("button", { name: "Delete image" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(page).toHaveURL(/\/admin\/media\?notice=deleted$/);
    expect(
      (await page.request.get(`/media/${unused.storageKey}`)).status(),
    ).toBe(404);

    await sql(
      `UPDATE "SiteSettings" SET "logoMediaId" = NULL WHERE id = 'default'`,
      [],
    );
  });
});

test("editors cannot delete images or confirm rights", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const file = await fixture(`${project}-editor-only.jpg`, project, "#dbaf71");
  await signInAs(page, accountsFor(project).editor, "/admin/media");
  await upload(page, [file]);
  const asset = await assetIdFor(path.basename(file));
  await page.goto(`/admin/media/${asset.id}`);
  await expect(page.getByRole("button", { name: "Delete image" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /usage rights/ })).toHaveCount(
    0,
  );
});
