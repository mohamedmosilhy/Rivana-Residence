import { describe, expect, it } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { GetAdminOverview } from "@/application/admin/get-overview";
import { CatalogCommands } from "@/application/content/catalog-commands";
import { CatalogQueries } from "@/application/content/catalog-queries";
import { PageCommands } from "@/application/content/page-commands";
import { ListEnquiries } from "@/application/enquiries/list-enquiries";
import { MediaLibrary } from "@/application/media/media-library";
import { ListBranches, ManageBranches } from "@/application/branches";
import {
  GetAdminSiteSettings,
  ReplaceSocialLinks,
  UpdateSiteImages,
  UpdateSiteSettings,
} from "@/application/settings/site-settings";
import { ManageCommercialSettings } from "@/application/commercial";
import { ManageServices } from "@/application/services";
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
  listTag: (branch: string) => `branch:${branch}:stay`,
  itemTag: (branch: string, slug: string) => `branch:${branch}:stay:${slug}`,
} as never;

type Call = Readonly<{
  name: string;
  capability: Capability;
  run: (staff: StaffPrincipal | null) => Promise<unknown>;
}>;

const catalog = () =>
  new CatalogCommands(
    tripwire("repository"),
    tripwire("cache"),
    kind,
    tripwire("branches"),
  );
const queries = () =>
  new CatalogQueries(
    tripwire("repository"),
    tripwire("media"),
    tripwire("branches"),
  );
const pages = () =>
  new PageCommands(tripwire("pages"), tripwire("cache"), tripwire("branches"));
const media = () => new MediaLibrary(tripwire("deps"), tripwire("cache"));
const branches = () =>
  new ManageBranches({
    branches: tripwire("branches"),
    cache: tripwire("cache"),
    media: tripwire("media"),
    clock: tripwire("clock"),
  });
const settingsRepo = () => tripwire("settings");

const services = () =>
  new ManageServices({
    unitOfWork: tripwire("unitOfWork"),
    services: tripwire("services"),
    clock: tripwire("clock"),
    ids: tripwire("ids"),
  });
const commercial = () =>
  new ManageCommercialSettings({
    unitOfWork: tripwire("unitOfWork"),
    settings: tripwire("settings"),
    clock: tripwire("clock"),
  });

const CALLS: readonly Call[] = [
  // Rooms and facilities share CatalogCommands / CatalogQueries.
  {
    name: "catalog.create",
    capability: "content:edit",
    run: (s) => catalog().create(s, "new-cairo", {}),
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
    run: (s) => pages().list(s, "new-cairo"),
  },
  {
    name: "pages.get",
    capability: "content:edit",
    run: (s) => pages().get(s, "new-cairo", "HOME"),
  },
  {
    name: "pages.saveSection",
    capability: "content:edit",
    run: (s) => pages().saveSection(s, "new-cairo", "HOME", "section", {}),
  },
  {
    name: "pages.updateDetails",
    capability: "content:edit",
    run: (s) => pages().updateDetails(s, "new-cairo", "HOME", {} as never),
  },
  {
    name: "pages.saveSectionMedia",
    capability: "content:edit",
    run: (s) =>
      pages().saveSectionMedia(s, "new-cairo", "HOME", "section", [] as never),
  },
  {
    name: "pages.moveSection",
    capability: "content:edit",
    run: (s) => pages().moveSection(s, "new-cairo", "HOME", "section", 1),
  },
  {
    name: "pages.publish",
    capability: "content:publish",
    run: (s) => pages().publish(s, "new-cairo", "HOME"),
  },
  {
    name: "pages.unpublish",
    capability: "content:publish",
    run: (s) => pages().unpublish(s, "new-cairo", "HOME"),
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
  // Branches (spec 0002).
  {
    name: "branches.list",
    capability: "branches:manage",
    run: (s) => branches().list(s),
  },
  {
    name: "branches.get",
    capability: "branches:manage",
    run: (s) => branches().get(s, "id"),
  },
  {
    name: "branches.create",
    capability: "branches:manage",
    run: (s) => branches().create(s, {}),
  },
  {
    name: "branches.update",
    capability: "branches:manage",
    run: (s) => branches().update(s, "id", {}),
  },
  {
    name: "branches.forStaff",
    capability: "inventory:read",
    run: (s) => new ListBranches(tripwire("branches")).forStaff(s),
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
      new ListEnquiries(tripwire("enquiries"), tripwire("branches")).execute(
        s,
        {} as never,
      ),
  },
  {
    name: "overview.read",
    capability: "content:edit",
    run: (s) =>
      new GetAdminOverview(tripwire("reader"), tripwire("clock")).execute(s),
  },
  {
    name: "services.list",
    capability: "pricing:read",
    run: (s) => services().list(s, "branch-1"),
  },
  {
    name: "services.set",
    capability: "services:manage",
    run: (s) => services().set(s, "branch-1", "BREAKFAST", {}),
  },
  {
    name: "commercial.read",
    capability: "pricing:read",
    run: (s) => commercial().read(s),
  },
  {
    name: "commercial.update",
    capability: "tax:manage",
    run: (s) => commercial().update(s, { vatRateBasisPoints: 1500 }),
  },
];

const editor: StaffPrincipal = {
  id: "editor",
  name: "Editor",
  email: "editor@rivana.test",
  role: "EDITOR",
  sessionId: "session",
  branchIds: [],
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
        "branches:manage",
        "inventory:read",
        "pricing:read",
        "services:manage",
        "tax:manage",
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

// AC-4: Receptionists and Managers hold no CMS capability, so every content,
// media, settings, and branch admin command refuses them before touching data,
// even with a branch assignment.
describe.each(["RECEPTIONIST", "MANAGER"] as const)(
  "authorization sweep for %s",
  (role) => {
    const staff: StaffPrincipal = { ...editor, role, branchIds: ["branch-1"] };
    const denied = CALLS.filter(
      (call) => !roleHasCapability(role, call.capability),
    );

    it("covers every command except their branch-scoped reads and pricing", () => {
      // M7-T4: both roles hold pricing:read; only a Manager holds
      // services:manage. Nobody but an Admin holds tax:manage.
      expect(
        CALLS.filter((call) => !denied.includes(call)).map((call) => call.name),
      ).toEqual([
        "branches.forStaff",
        "enquiries.list",
        "services.list",
        ...(role === "MANAGER" ? ["services.set"] : []),
        "commercial.read",
      ]);
    });

    it.each(denied.map((call) => [call.name, call] as const))(
      "%s forbids the role before any data access",
      async (_name, call) => {
        const { result, touched } = await failureCode(call, staff);
        expect(touched).toEqual([]);
        expect(result).toMatchObject({
          ok: false,
          error: { code: "FORBIDDEN" },
        });
      },
    );
  },
);

describe("authorization sweep tripwire", () => {
  it("detects dependency access once a caller is authorized", async () => {
    touched = [];
    await expect(
      catalog().update({ ...editor, role: "ADMIN" }, "id", {}),
    ).rejects.toThrow("used before authorization");
    expect(touched).toEqual(["repository.findAdminById"]);
  });
});
