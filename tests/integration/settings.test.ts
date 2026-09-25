import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import {
  GetPublicSiteSettings,
  ReplaceSocialLinks,
  UpdateSiteSettings,
} from "@/application/settings/site-settings";
import { PrismaSettingsRepository } from "@/infrastructure/db/prisma/repositories/settings-repository";

import {
  actor,
  createActor,
  createTestClient,
  resetDatabase,
} from "./support/database";

const client = createTestClient();
const settings = new PrismaSettingsRepository(client);

const admin: StaffPrincipal = {
  ...actor,
  name: "Test Administrator",
  email: "admin@example.test",
  sessionId: "session-1",
};
const editor: StaffPrincipal = { ...admin, role: "EDITOR" };

const values = {
  siteName: "Rivana Residence",
  tagline: "Quiet luxury in New Cairo",
  phone: "+20 2 1234 5678",
  email: "stay@rivana.example",
  addressLine1: "90th Street",
  addressLine2: "",
  city: "New Cairo",
  country: "Egypt",
  latitude: "30.0131",
  longitude: "31.4913",
  mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18",
  footerText: "© Rivana Residence",
  defaultSeoTitle: "Rivana Residence, New Cairo",
  defaultSeoDescription: "Serviced residences in New Cairo.",
};

const instagram = {
  platform: "instagram",
  label: "Rivana on Instagram",
  url: "https://instagram.com/rivana",
  isVisible: true,
};

function useCases() {
  const cache = { invalidate: vi.fn(async () => undefined) };
  return {
    cache,
    update: new UpdateSiteSettings(settings, cache),
    replace: new ReplaceSocialLinks(settings, cache),
    publicQuery: new GetPublicSiteSettings(settings),
  };
}

async function version() {
  return (await settings.getAdmin())!.updatedAt.toISOString();
}

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  await client.siteSettings.create({
    data: { id: "default", siteName: "Rivana" },
  });
});

describe("site settings writes", () => {
  it("saves through the command, records the editor, and invalidates the settings tag", async () => {
    const { update, publicQuery, cache } = useCases();

    const result = await update.execute(admin, {
      values,
      expectedUpdatedAt: await version(),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        siteName: "Rivana Residence",
        latitude: 30.0131,
        longitude: 31.4913,
        addressLine2: null,
        updatedByName: "Test Administrator",
      },
    });
    expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(["site-settings"]);

    // The change is visible through the public settings query.
    expect(await publicQuery.execute()).toMatchObject({
      siteName: "Rivana Residence",
      email: "stay@rivana.example",
      footerText: "© Rivana Residence",
      defaultSeoTitle: "Rivana Residence, New Cairo",
      timeZone: "Africa/Cairo",
    });
  });

  it("rejects a stale form without writing or invalidating", async () => {
    const { update, cache } = useCases();
    const stale = await version();
    expect(
      (await update.execute(admin, { values, expectedUpdatedAt: stale })).ok,
    ).toBe(true);
    cache.invalidate.mockClear();

    const result = await update.execute(admin, {
      values: { ...values, siteName: "Overwritten" },
      expectedUpdatedAt: stale,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await settings.getAdmin())?.siteName).toBe("Rivana Residence");
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it("lets only one of two concurrent saves of the same version win", async () => {
    const expected = new Date(await version());
    const parsed = (siteName: string) => ({
      siteName,
      tagline: null,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      mapEmbedUrl: null,
      footerText: null,
      defaultSeoTitle: null,
      defaultSeoDescription: null,
    });

    const results = await Promise.all([
      settings.update(parsed("First"), expected, actor),
      settings.update(parsed("Second"), expected, actor),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { error: { code: "CONFLICT" } },
    ]);
  });

  it("refuses editors at the command boundary", async () => {
    const { update } = useCases();
    const before = await version();

    const result = await update.execute(editor, {
      values,
      expectedUpdatedAt: before,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await version()).toBe(before);
  });

  it("reports missing settings as not found", async () => {
    await client.siteSettings.delete({ where: { id: "default" } });
    const { update } = useCases();

    const result = await update.execute(admin, {
      values,
      expectedUpdatedAt: new Date().toISOString(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("social link writes", () => {
  it("replaces links in order and exposes only visible ones publicly", async () => {
    const { replace, publicQuery, cache } = useCases();
    const links = [
      { ...instagram, platform: "x", label: "X", url: "https://x.com/rivana" },
      instagram,
      {
        ...instagram,
        platform: "facebook",
        label: "Facebook",
        url: "https://facebook.com/rivana",
        isVisible: false,
      },
    ];

    const result = await replace.execute(admin, {
      links,
      expectedUpdatedAt: await version(),
    });

    expect(result.ok && result.value.socialLinks).toEqual(links);
    expect(cache.invalidate).toHaveBeenCalledWith(["site-settings"]);
    expect((await publicQuery.execute())?.socialLinks).toEqual([
      links[0],
      links[1],
    ]);
    expect(
      await client.socialLink.findMany({
        orderBy: { sortOrder: "asc" },
        select: { platform: true, sortOrder: true },
      }),
    ).toEqual([
      { platform: "x", sortOrder: 0 },
      { platform: "instagram", sortOrder: 1 },
      { platform: "facebook", sortOrder: 2 },
    ]);
  });

  it("reorders existing links without tripping the unique order index", async () => {
    const { replace } = useCases();
    const first = [
      instagram,
      { ...instagram, platform: "x", label: "X", url: "https://x.com/r" },
    ];
    await replace.execute(admin, {
      links: first,
      expectedUpdatedAt: await version(),
    });

    const result = await replace.execute(admin, {
      links: [...first].reverse(),
      expectedUpdatedAt: await version(),
    });

    expect(
      result.ok && result.value.socialLinks.map((link) => link.platform),
    ).toEqual(["x", "instagram"]);
  });

  it("clears every link", async () => {
    const { replace } = useCases();
    await replace.execute(admin, {
      links: [instagram],
      expectedUpdatedAt: await version(),
    });

    await replace.execute(admin, {
      links: [],
      expectedUpdatedAt: await version(),
    });

    expect(await client.socialLink.count()).toBe(0);
  });

  it("keeps the previous links when a stale form is submitted", async () => {
    const { replace } = useCases();
    const stale = await version();
    await replace.execute(admin, {
      links: [instagram],
      expectedUpdatedAt: stale,
    });

    const result = await replace.execute(admin, {
      links: [],
      expectedUpdatedAt: stale,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await client.socialLink.count()).toBe(1);
  });

  it("rolls back the version bump when link insertion fails", async () => {
    const before = await version();
    const duplicate = {
      platform: "instagram" as const,
      label: "Instagram",
      url: "https://instagram.com/rivana",
      isVisible: true,
    };

    // Bypasses the command's validation to force a database failure.
    await expect(
      settings.replaceSocialLinks(
        [duplicate, duplicate],
        new Date(before),
        actor,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    expect(await version()).toBe(before);
    expect(await client.socialLink.count()).toBe(0);
  });
});
