// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { ListBranches, ManageBranches } from "@/application/branches";
import { failure } from "@/application/shared/result";
import {
  DEFAULT_BRANCH_SLUG,
  ONLINE_BOOKING_NOT_READY_MESSAGE,
  branchCreateSchema,
  branchSlugSchema,
  parseBranchUpdate,
  switchTarget,
} from "@/domain/branches";
import { stayLabel } from "@/domain/catalog";
import { defaultPageSections } from "@/domain/content/default-sections";
import { legacyRedirects } from "@/infrastructure/http/legacy-redirects";

import { branchRow, fakeBranches } from "../../support/fake-branches";

// Spec 0002 (M5): branch websites. Each block names the acceptance criteria
// it covers.

const admin: StaffPrincipal = {
  id: "admin-1",
  name: "Amira",
  email: "amira@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};
const editor: StaffPrincipal = { ...admin, id: "e", role: "EDITOR" };

const validBranch = { slug: "demo-giza", name: "Rivana Giza" };

function fieldsWithIssues(input: Record<string, unknown>) {
  const parsed = branchCreateSchema.safeParse({ ...validBranch, ...input });
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path.join("."));
}

// AC-16: the old top-level paths now redirect, so they are reserved too.
describe("reserved branch slugs", () => {
  it.each(["about", "contact", "rooms", "facilities", "Rooms"])(
    "rejects %j",
    (slug) => {
      expect(branchSlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it("still accepts an ordinary slug", () => {
    expect(branchSlugSchema.safeParse("demo-giza").success).toBe(true);
  });
});

// AC-6, AC-12: the branch form and API-A2/A3 rules.
describe("branch create and update schemas", () => {
  // Review of M5: an unfinished branch never goes live by default.
  it("defaults a new branch to INACTIVE, order 0, online booking off", () => {
    expect(branchCreateSchema.parse(validBranch)).toMatchObject({
      status: "INACTIVE",
      sortOrder: 0,
      onlineBookingEnabled: false,
      heroMediaId: null,
      mapEmbedUrl: null,
    });
  });

  it("parses form strings for order and coordinates", () => {
    expect(
      branchCreateSchema.parse({
        ...validBranch,
        sortOrder: "3",
        latitude: "30.0444",
        longitude: "30.98",
      }),
    ).toMatchObject({ sortOrder: 3, latitude: 30.0444, longitude: 30.98 });
  });

  it.each([
    "https://evil.example/maps/embed",
    "http://www.google.com/maps/embed?pb=1",
    "javascript:alert(1)",
  ])("rejects the map URL %s", (mapEmbedUrl) => {
    expect(fieldsWithIssues({ mapEmbedUrl })).toEqual(["mapEmbedUrl"]);
  });

  it("accepts a Google Maps embed URL", () => {
    expect(
      fieldsWithIssues({
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18",
      }),
    ).toEqual([]);
  });

  it.each([
    ["phone", "call us"],
    ["email", "nope"],
    ["checkInTime", "2pm"],
    ["sortOrder", "-1"],
  ])("rejects an invalid %s", (field, value) => {
    expect(fieldsWithIssues({ [field]: value })).toEqual([field]);
  });

  it("rounds coordinates to the stored six decimals", () => {
    expect(
      branchCreateSchema.parse({
        ...validBranch,
        latitude: "30.01310049",
        longitude: 31.4913,
      }),
    ).toMatchObject({ latitude: 30.0131, longitude: 31.4913 });
  });

  it("requires latitude and longitude together", () => {
    expect(fieldsWithIssues({ latitude: "30" })).toEqual(["longitude"]);
  });

  it("refuses to turn online booking on before its prerequisites exist", () => {
    const parsed = branchCreateSchema.safeParse({
      ...validBranch,
      onlineBookingEnabled: true,
    });
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({
        path: ["onlineBookingEnabled"],
        message: ONLINE_BOOKING_NOT_READY_MESSAGE,
      }),
    ]);
  });

  it("keeps only the fields a patch sent, so defaults never overwrite", () => {
    const parsed = parseBranchUpdate({ name: "Giza", phone: "" });
    expect(parsed.success && parsed.data).toEqual({
      name: "Giza",
      phone: null,
    });
  });

  it("drops a slug from a patch (fixed once created)", () => {
    const parsed = parseBranchUpdate({ slug: "elsewhere", name: "Giza" });
    expect(parsed.success && parsed.data).toEqual({ name: "Giza" });
  });
});

// AC-3: the switcher keeps the page type when the other branch has it.
describe("switchTarget", () => {
  const giza = { slug: "demo-giza", hasListings: true, hasFacilities: true };
  const empty = { slug: "demo-giza", hasListings: false, hasFacilities: false };

  it.each([
    ["/new-cairo", giza, "/demo-giza"],
    ["/new-cairo/about", giza, "/demo-giza/about"],
    ["/new-cairo/contact/", giza, "/demo-giza/contact"],
    ["/new-cairo/stay", giza, "/demo-giza/stay"],
    ["/new-cairo/stay/deluxe-double", giza, "/demo-giza/stay"],
    ["/new-cairo/facilities/swimming-pool", giza, "/demo-giza/facilities"],
    ["/new-cairo/stay", empty, "/demo-giza"],
    ["/new-cairo/facilities", empty, "/demo-giza"],
    ["/new-cairo/book/details", giza, "/demo-giza"],
  ] as const)("%s → %s", (pathname, target, expected) => {
    expect(switchTarget(pathname, target)).toBe(expected);
  });
});

// AC-5: the guest-facing label follows what the branch has published.
describe("stayLabel", () => {
  it.each([
    [["ROOM", "APARTMENT"], "Rooms & Apartments"],
    [["APARTMENT", "ROOM"], "Rooms & Apartments"],
    [["ROOM"], "Rooms"],
    [["APARTMENT"], "Apartments"],
    [[], null],
  ] as const)("%j → %s", (types, label) => {
    expect(stayLabel(types)).toBe(label);
  });
});

// AC-12: a new branch's pages start from the draft skeleton.
describe("default page sections", () => {
  it("titles a new branch's Home hero with the branch name", () => {
    const [hero] = defaultPageSections("HOME", "Rivana Giza");
    expect(hero).toMatchObject({
      type: "HERO",
      payload: { title: "Rivana Giza" },
    });
    expect(
      defaultPageSections("ABOUT", "Rivana Giza")[0]?.payload,
    ).toMatchObject({ title: "About Rivana" });
  });
});

// AC-2: one permanent hop per old URL, to a final destination.
describe("legacy redirect table", () => {
  const table = legacyRedirects(DEFAULT_BRANCH_SLUG);

  it("is permanent (308) and ends inside the default branch", () => {
    for (const rule of table) {
      expect(rule.permanent).toBe(true);
      expect(rule.destination.startsWith("/new-cairo")).toBe(true);
    }
  });

  it("never points at another redirect source (single hop)", () => {
    const sources = new Set(table.map((rule) => rule.source));
    for (const rule of table) {
      expect(sources.has(rule.destination)).toBe(false);
      expect(rule.destination).not.toBe("/");
    }
  });

  it.each([
    ["/rooms/:slug", "/new-cairo/stay/:slug"],
    ["/index.html", "/new-cairo"],
    ["/room-deluxe-double.html", "/new-cairo/stay/deluxe-double"],
    ["/gym.html", "/new-cairo/facilities/fitness-room"],
  ])("maps %s to %s", (source, destination) => {
    expect(table).toContainEqual({ source, destination, permanent: true });
  });
});

describe("ManageBranches", () => {
  function setup(
    rows = [
      branchRow(),
      branchRow({ id: "b2", slug: "demo-giza", name: "Giza", sortOrder: 1 }),
    ],
  ) {
    const fake = fakeBranches(rows);
    const cache = { invalidate: vi.fn(async () => undefined) };
    const media = {
      isUsableImage: vi.fn(async (id: string) => id === "ready"),
    };
    const now = new Date("2026-11-07T10:00:00Z");
    const useCase = new ManageBranches({
      branches: fake.repository,
      cache,
      media,
      clock: { now: () => now },
    });
    return { ...fake, cache, media, useCase, now };
  }

  it("refuses an editor before any read or write", async () => {
    const { useCase, writes } = setup();
    expect(await useCase.create(editor, validBranch)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(writes).toEqual([]);
  });

  // AC-12: three draft pages and an audit event, in one write.
  it("creates a branch with its three pages and a branch.created audit", async () => {
    const { useCase, writes, cache, now } = setup();
    expect((await useCase.create(admin, validBranch)).ok).toBe(true);
    const [, pages, audit] = writes[0]!.args as [
      unknown,
      { key: string; canonicalPath: string }[],
      Record<string, unknown>,
    ];
    expect(pages.map((page) => [page.key, page.canonicalPath])).toEqual([
      ["HOME", "/"],
      ["ABOUT", "/about"],
      ["CONTACT", "/contact"],
    ]);
    expect(audit).toEqual({
      occurredAt: now,
      actorType: "STAFF",
      actorId: "admin-1",
      action: "branch.created",
      entityType: "Branch",
      entityId: "new-id",
      branchId: "new-id",
      reason: null,
      changes: { slug: "demo-giza", name: "Rivana Giza", status: "INACTIVE" },
    });
    expect(cache.invalidate).toHaveBeenCalledWith(["branches", "sitemap"]);
  });

  it("explains a taken slug next to the field", async () => {
    const { useCase, repository } = setup();
    vi.spyOn(repository, "create").mockResolvedValueOnce(
      failure("CONFLICT", "Unique."),
    );
    expect(await useCase.create(admin, validBranch)).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        fieldErrors: {
          slug: ["That web address is already used by another branch."],
        },
      },
    });
  });

  it("refuses a hero image that is not a ready library image", async () => {
    const { useCase, writes } = setup();
    expect(
      await useCase.create(admin, { ...validBranch, heroMediaId: "pending" }),
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: { heroMediaId: expect.any(Array) } },
    });
    expect(writes).toEqual([]);
  });

  // Owner decision 2026-11-07: the redirect target stays reachable.
  it("refuses to deactivate the default branch", async () => {
    const { useCase, writes } = setup();
    expect(
      await useCase.update(admin, "branch-1", { status: "INACTIVE" }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          status: [expect.stringContaining("old website addresses")],
        },
      },
    });
    expect(writes).toEqual([]);
  });

  it("may deactivate any other branch", async () => {
    const { useCase } = setup();
    expect((await useCase.update(admin, "b2", { status: "INACTIVE" })).ok).toBe(
      true,
    );
  });

  it("checks coordinate pairs against the stored row", async () => {
    const { useCase } = setup();
    expect(await useCase.update(admin, "b2", { latitude: 30 })).toMatchObject({
      ok: false,
      error: { fieldErrors: { longitude: expect.any(Array) } },
    });
  });

  // T-SITE-4: an update expires that branch's tags (listed explicitly) and
  // audits only the changed fields.
  it("audits changed fields and expires only that branch's tags", async () => {
    const { useCase, writes, cache } = setup();
    await useCase.update(admin, "b2", {
      name: "Giza",
      phone: "+20 2 9876 5432",
    });
    const audit = writes[0]!.args[3] as { action: string; changes: unknown };
    expect(audit).toMatchObject({
      action: "branch.updated",
      changes: { phone: { from: null, to: "+20 2 9876 5432" } },
    });
    expect(cache.invalidate).toHaveBeenCalledWith([
      "branches",
      "sitemap",
      "branch:demo-giza:page:home",
      "branch:demo-giza:page:about",
      "branch:demo-giza:page:contact",
      "branch:demo-giza:stay",
      "branch:demo-giza:facilities",
      "branch:demo-giza:stay:deluxe-double",
      "branch:demo-giza:facility:swimming-pool",
    ]);
    expect(
      (cache.invalidate.mock.calls[0] as unknown as [string[]])[0].some((tag) =>
        tag.startsWith("branch:new-cairo:"),
      ),
    ).toBe(false);
  });

  it("writes nothing when nothing changed", async () => {
    const { useCase, writes, cache } = setup();
    expect((await useCase.update(admin, "b2", { name: "Giza" })).ok).toBe(true);
    expect(writes).toEqual([]);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});

// API-A1: Admin sees every branch; others their assignments.
describe("ListBranches.forStaff", () => {
  const { repository } = fakeBranches([
    branchRow(),
    branchRow({ id: "b2", slug: "demo-giza", sortOrder: 1 }),
  ]);

  it("lists every branch for an administrator", async () => {
    const result = await new ListBranches(repository).forStaff(admin);
    expect(result.ok && result.value.map((branch) => branch.slug)).toEqual([
      "new-cairo",
      "demo-giza",
    ]);
  });

  it("limits a receptionist to assigned branches", async () => {
    const result = await new ListBranches(repository).forStaff({
      ...admin,
      role: "RECEPTIONIST",
      branchIds: ["b2"],
    });
    expect(result.ok && result.value.map((branch) => branch.slug)).toEqual([
      "demo-giza",
    ]);
  });
});
