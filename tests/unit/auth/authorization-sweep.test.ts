import { describe, expect, it } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { GetAdminOverview } from "@/application/admin/get-overview";
import { CatalogCommands } from "@/application/content/catalog-commands";
import { CatalogQueries } from "@/application/content/catalog-queries";
import { PageCommands } from "@/application/content/page-commands";
import { ListEnquiries } from "@/application/enquiries/list-enquiries";
import { MediaLibrary } from "@/application/media/media-library";
import { PromotionAdmin } from "@/application/promotions/promotion-admin";
import {
  GetAdminSiteSettings,
  ReplaceSocialLinks,
  UpdateSiteImages,
  UpdateSiteSettings,
} from "@/application/settings/site-settings";
import type { Capability } from "@/domain/auth/capabilities";
import { roleHasCapability } from "@/domain/auth/capabilities";

// Every protected application command is called without a session and with
// each role. A refused call must return the right failure before touching
// any dependency: a repository, storage, cache, or clock access fails the
// test, so a guard placed after a read (an IDOR-style leak) is caught.

let touched: string[] = [];

function tripwire(name: string): never {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return undefined;
        touched.push(`${name}.${String(property)}`);
        throw new Error(
          `${name}.${String(property)} used before authorization`,
        );
      },
    },
  ) as never;
}

const kind = {
  noun: "room",
  listTag: "rooms",
  itemTag: (slug: string) => `room:${slug}`,
} as never;

type Call = Readonly<{
  name: string;
  capability: Capability;
  run: (staff: StaffPrincipal | null) => Promise<unknown>;
}>;

const catalog = () =>
  new CatalogCommands(tripwire("repository"), tripwire("cache"), kind);
const queries = () =>
  new CatalogQueries(tripwire("repository"), tripwire("media"));
const pages = () => new PageCommands(tripwire("pages"), tripwire("cache"));
const media = () => new MediaLibrary(tripwire("deps"), tripwire("cache"));
const promotions = () =>
  new PromotionAdmin(tripwire("promotions"), tripwire("cache"), {
    now: () => new Date("2026-09-26T00:00:00Z"),
  });
const settingsRepo = () => tripwire("settings");

const CALLS: readonly Call[] = [
  // Rooms and facilities share CatalogCommands / CatalogQueries.
  {
    name: "catalog.create",
    capability: "content:edit",
    run: (s) => catalog().create(s, {}),
  },
  {
    name: "catalog.update",
    capability: "content:edit",
    run: (s) => catalog().update(s, "id", {}),
  },
  {
    name: "catalog.publish",
    capability: "content:publish",
    run: (s) => catalog().publish(s, "id"),
  },
  {
    name: "catalog.unpublish",
    capability: "content:publish",
    run: (s) => catalog().unpublish(s, "id"),
  },
  {
    name: "catalog.archive",
    capability: "content:archive",
    run: (s) => catalog().archive(s, "id"),
  },
  {
    name: "catalog.restore",
    capability: "content:archive",
    run: (s) => catalog().restore(s, "id"),
  },
  {
    name: "catalog.delete",
    capability: "content:delete",
    run: (s) => catalog().delete(s, "id"),
  },
  {
    name: "catalog.move",
    capability: "content:edit",
    run: (s) => catalog().move(s, "id", 1),
  },
  {
    name: "catalog.replaceMedia",
    capability: "content:edit",
    run: (s) => catalog().replaceMedia(s, "id", []),
  },
  {
    name: "catalog.saveImages",
    capability: "content:edit",
    run: (s) =>
      catalog().saveImages(s, "id", {
        hero: null,
        gallery: [],
        socialImage: null,
      } as never),
  },
  {
    name: "catalogQueries.list",
    capability: "content:edit",
    run: (s) => queries().list(s, {} as never),
  },
  {
    name: "catalogQueries.get",
    capability: "content:edit",
    run: (s) => queries().get(s, "id"),
  },
  // Managed pages.
  {
    name: "pages.list",
    capability: "content:edit",
    run: (s) => pages().list(s),
  },
  {
    name: "pages.get",
    capability: "content:edit",
    run: (s) => pages().get(s, "HOME"),
  },
  {
    name: "pages.saveSection",
    capability: "content:edit",
    run: (s) => pages().saveSection(s, "HOME", "section", {}),
  },
  {
    name: "pages.updateDetails",
    capability: "content:edit",
    run: (s) => pages().updateDetails(s, "HOME", {} as never),
  },
  {
    name: "pages.saveSectionMedia",
    capability: "content:edit",
    run: (s) => pages().saveSectionMedia(s, "HOME", "section", [] as never),
  },
  {
    name: "pages.moveSection",
    capability: "content:edit",
    run: (s) => pages().moveSection(s, "HOME", "section", 1),
  },
  {
    name: "pages.publish",
    capability: "content:publish",
    run: (s) => pages().publish(s, "HOME"),
  },
  {
    name: "pages.unpublish",
    capability: "content:publish",
    run: (s) => pages().unpublish(s, "HOME"),
  },
  // Media library.
  {
    name: "media.upload",
    capability: "media:upload",
    run: (s) => media().upload(s, {} as never),
  },
  {
    name: "media.list",
    capability: "media:upload",
    run: (s) => media().list(s, {} as never),
  },
  {
    name: "media.details",
    capability: "media:upload",
    run: (s) => media().details(s, "id"),
  },
  {
    name: "media.options",
    capability: "content:edit",
    run: (s) => media().options(s),
  },
  {
    name: "media.updateDetails",
    capability: "media:upload",
    run: (s) => media().updateDetails(s, "id", {}),
  },
  {
    name: "media.setRights",
    capability: "media:rights",
    run: (s) => media().setRights(s, "id", "CONFIRMED"),
  },
  {
    name: "media.replace",
    capability: "content:edit",
    run: (s) => media().replace(s, "from", "to"),
  },
  {
    name: "media.delete",
    capability: "media:delete",
    run: (s) => media().delete(s, "id"),
  },
  // Promotions.
  {
    name: "promotions.list",
    capability: "promotions:manage",
    run: (s) => promotions().list(s, {} as never),
  },
  {
    name: "promotions.get",
    capability: "promotions:manage",
    run: (s) => promotions().get(s, "id"),
  },
  {
    name: "promotions.create",
    capability: "promotions:manage",
    run: (s) => promotions().create(s, {} as never),
  },
  {
    name: "promotions.update",
    capability: "promotions:manage",
    run: (s) => promotions().update(s, "id", {} as never),
  },
  {
    name: "promotions.publish",
    capability: "promotions:manage",
    run: (s) => promotions().publish(s, "id"),
  },
  {
    name: "promotions.unpublish",
    capability: "promotions:manage",
    run: (s) => promotions().unpublish(s, "id"),
  },
  {
    name: "promotions.archive",
    capability: "promotions:manage",
    run: (s) => promotions().archive(s, "id"),
  },
  {
    name: "promotions.restore",
    capability: "promotions:manage",
    run: (s) => promotions().restore(s, "id"),
  },
  {
    name: "promotions.delete",
    capability: "content:delete",
    run: (s) => promotions().delete(s, "id"),
  },
  // Settings, enquiries, overview.
  {
    name: "settings.getAdmin",
    capability: "settings:edit",
    run: (s) => new GetAdminSiteSettings(settingsRepo()).execute(s),
  },
  {
    name: "settings.update",
    capability: "settings:edit",
    run: (s) =>
      new UpdateSiteSettings(settingsRepo(), tripwire("cache")).execute(s, {
        values: {},
        expectedUpdatedAt: null,
      }),
  },
  {
    name: "settings.socialLinks",
    capability: "settings:edit",
    run: (s) =>
      new ReplaceSocialLinks(settingsRepo(), tripwire("cache")).execute(s, {
        links: [],
        expectedUpdatedAt: null,
      }),
  },
  {
    name: "settings.images",
    capability: "settings:edit",
    run: (s) =>
      new UpdateSiteImages(settingsRepo(), tripwire("cache")).execute(s, {}),
  },
  {
    name: "enquiries.list",
    capability: "enquiries:read",
    run: (s) =>
      new ListEnquiries(tripwire("enquiries")).execute(s, {} as never),
  },
  {
    name: "overview.read",
    capability: "admin:access",
    run: (s) =>
      new GetAdminOverview(tripwire("reader"), tripwire("clock")).execute(s),
  },
];

const editor: StaffPrincipal = {
  id: "editor",
  name: "Editor",
  email: "editor@rivana.test",
  role: "EDITOR",
  sessionId: "session",
};

async function failureCode(call: Call, staff: StaffPrincipal | null) {
  touched = [];
  const result = (await call.run(staff)) as {
    ok: boolean;
    error?: { code: string };
  };
  return { result, touched: [...touched] };
}

describe("authorization sweep across protected commands", () => {
  it.each(CALLS.map((call) => [call.name, call] as const))(
    "%s refuses a signed-out caller before any data access",
    async (_name, call) => {
      const { result, touched } = await failureCode(call, null);
      expect(touched).toEqual([]);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    },
  );

  const adminOnly = CALLS.filter(
    (call) => !roleHasCapability("EDITOR", call.capability),
  );

  it("includes every administrator-only capability used by commands", () => {
    expect(new Set(adminOnly.map((call) => call.capability))).toEqual(
      new Set([
        "content:delete",
        "media:delete",
        "media:rights",
        "settings:edit",
      ]),
    );
  });

  it.each(adminOnly.map((call) => [call.name, call] as const))(
    "%s forbids an editor before any data access",
    async (_name, call) => {
      const { result, touched } = await failureCode(call, editor);
      expect(touched).toEqual([]);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    },
  );
});

describe("authorization sweep tripwire", () => {
  it("detects dependency access once a caller is authorized", async () => {
    touched = [];
    await expect(
      catalog().update({ ...editor, role: "ADMIN" }, "id", {}),
    ).rejects.toThrow("used before authorization");
    expect(touched).toEqual(["repository.findAdminById"]);
  });
});
