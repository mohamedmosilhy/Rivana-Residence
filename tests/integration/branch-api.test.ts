import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";

import {
  createActor,
  createBranch,
  createMedia,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

// T-BR-1…4 (AC-15) through the real Route Handlers, wrappers, use cases, and
// PostgreSQL. Only the Next runtime pieces (request-scoped cache, tag
// expiry) and the staff session lookup are replaced.

const expired = vi.hoisted(() => [] as string[]);
const session = vi.hoisted(() => ({ staff: null as StaffPrincipal | null }));

vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(load: () => Promise<T>) =>
    () =>
      load(),
  updateTag: (tag: string) => expired.push(tag),
  revalidateTag: (tag: string) => expired.push(tag),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => session.staff,
  throttleKeys: () => ({ clientKey: (value: string) => value }),
}));

const { GET: listBranches } = await import("@/app/api/v1/branches/route");
const { GET: getBranch } = await import(
  "@/app/api/v1/branches/[branchSlug]/route"
);
const { GET: listRoomTypes } = await import(
  "@/app/api/v1/branches/[branchSlug]/room-types/route"
);
const { GET: getRoomType } = await import(
  "@/app/api/v1/branches/[branchSlug]/room-types/[roomSlug]/route"
);
const { GET: staffList, POST: createBranchRoute } = await import(
  "@/app/api/v1/staff/branches/route"
);
const { PATCH: updateBranchRoute } = await import(
  "@/app/api/v1/staff/branches/[id]/route"
);

const client = createTestClient();
const GIZA = "branch-giza-0000000000000000";
const ORIGIN = "http://localhost:3000";
const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Test Administrator",
  email: "admin@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};

const params = (values: Record<string, string>) => ({
  params: Promise.resolve(values),
});
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const send = (method: string, path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });

afterAll(() => client.$disconnect());
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  session.staff = admin;
  expired.length = 0;
  await createBranch(client, {
    id: GIZA,
    slug: "demo-giza",
    name: "Giza",
    sortOrder: 1,
  });
  const hero = await createMedia(client);
  await createRoom(client, {
    status: "PUBLISHED",
    slug: "cairo-room",
    heroMediaId: hero.id,
  });
  await createRoom(client, {
    status: "PUBLISHED",
    slug: "giza-apartment",
    branchId: GIZA,
    heroMediaId: hero.id,
  });
  await client.room.update({
    where: { slug: "giza-apartment" },
    data: { accommodationType: "APARTMENT", bedroomCount: 2 },
  });
  await createRoom(client, {
    status: "DRAFT",
    slug: "giza-draft",
    branchId: GIZA,
  });
});

describe("public branch endpoints", () => {
  it("API-P1 lists active branches in order", async () => {
    const response = await listBranches(get("/api/v1/branches"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { items: { slug: string }[] };
    expect(body.items.map((item) => item.slug)).toEqual([
      "new-cairo",
      "demo-giza",
    ]);
  });

  it("API-P2 returns a branch, and 404 when inactive or unknown", async () => {
    const found = await getBranch(
      get("/api/v1/branches/demo-giza"),
      params({ branchSlug: "demo-giza" }),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      slug: "demo-giza",
      name: "Giza",
      onlineBookingEnabled: false,
      mapEmbedUrl: null,
    });
    await client.branch.update({
      where: { id: GIZA },
      data: { status: "INACTIVE" },
    });
    for (const slug of ["demo-giza", "luxor"]) {
      const missing = await getBranch(
        get(`/api/v1/branches/${slug}`),
        params({ branchSlug: slug }),
      );
      expect(missing.status).toBe(404);
      expect(missing.headers.get("content-type")).toContain("problem+json");
    }
  });

  // AC-4: a branch's listings never appear under another branch.
  it("API-P3 lists only the branch's published listings, filtered by type", async () => {
    const response = await listRoomTypes(
      get("/api/v1/branches/demo-giza/room-types"),
      params({ branchSlug: "demo-giza" }),
    );
    const body = (await response.json()) as {
      items: { slug: string; accommodationType: string; detailUrl: string }[];
    };
    expect(body.items).toEqual([
      expect.objectContaining({
        slug: "giza-apartment",
        accommodationType: "APARTMENT",
        bedroomCount: 2,
        detailUrl: "/demo-giza/stay/giza-apartment",
      }),
    ]);
    const rooms = await listRoomTypes(
      get("/api/v1/branches/demo-giza/room-types?type=ROOM"),
      params({ branchSlug: "demo-giza" }),
    );
    expect(((await rooms.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it("API-P3 refuses an unknown type", async () => {
    const response = await listRoomTypes(
      get("/api/v1/branches/demo-giza/room-types?type=VILLA"),
      params({ branchSlug: "demo-giza" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_QUERY" });
  });

  it("API-P4 returns 404 for another branch's listing", async () => {
    const own = await getRoomType(
      get("/api/v1/branches/demo-giza/room-types/giza-apartment"),
      params({ branchSlug: "demo-giza", roomSlug: "giza-apartment" }),
    );
    expect(own.status).toBe(200);
    const other = await getRoomType(
      get("/api/v1/branches/demo-giza/room-types/cairo-room"),
      params({ branchSlug: "demo-giza", roomSlug: "cairo-room" }),
    );
    expect(other.status).toBe(404);
    const draft = await getRoomType(
      get("/api/v1/branches/demo-giza/room-types/giza-draft"),
      params({ branchSlug: "demo-giza", roomSlug: "giza-draft" }),
    );
    expect(draft.status).toBe(404);
  });
});

describe("staff branch endpoints", () => {
  it("API-A1 refuses signed-out callers and editors", async () => {
    session.staff = null;
    expect((await staffList(get("/api/v1/staff/branches"))).status).toBe(401);
    session.staff = { ...admin, role: "EDITOR" };
    expect((await staffList(get("/api/v1/staff/branches"))).status).toBe(403);
  });

  it("API-A1 scopes a receptionist to assigned branches", async () => {
    session.staff = { ...admin, role: "RECEPTIONIST", branchIds: [GIZA] };
    const response = await staffList(get("/api/v1/staff/branches"));
    expect(
      ((await response.json()) as { items: { slug: string }[] }).items.map(
        (item) => item.slug,
      ),
    ).toEqual(["demo-giza"]);
  });

  // T-SITE-3 (AC-12): three unpublished pages and an audit row.
  it("API-A2 creates a branch with its pages and an audit row", async () => {
    const response = await createBranchRoute(
      send("POST", "/api/v1/staff/branches", {
        slug: "demo-alex",
        name: "Alexandria",
        status: "INACTIVE",
      }),
    );
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string; slug: string };
    const pages = await client.page.findMany({
      where: { branchId: created.id },
      include: { _count: { select: { sections: true } } },
      orderBy: { key: "asc" },
    });
    expect(pages.map((page) => [page.key, page.isPublished]).sort()).toEqual([
      ["ABOUT", false],
      ["CONTACT", false],
      ["HOME", false],
    ]);
    expect(pages.every((page) => page._count.sections > 0)).toBe(true);
    expect(
      await client.auditEvent.findMany({ where: { entityId: created.id } }),
    ).toEqual([
      expect.objectContaining({
        action: "branch.created",
        actorType: "STAFF",
        actorId: "actor-admin",
        entityType: "Branch",
      }),
    ]);
    expect(expired).toEqual(expect.arrayContaining(["branches", "sitemap"]));
  });

  it("API-A2 refuses a cross-site request, a taken slug, and bad fields", async () => {
    const crossSite = new Request(`${ORIGIN}/api/v1/staff/branches`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ slug: "x-y", name: "X" }),
    });
    expect((await createBranchRoute(crossSite)).status).toBe(403);

    const taken = await createBranchRoute(
      send("POST", "/api/v1/staff/branches", {
        slug: "demo-giza",
        name: "Again",
      }),
    );
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({
      fieldErrors: {
        slug: ["That web address is already used by another branch."],
      },
    });

    const invalid = await createBranchRoute(
      send("POST", "/api/v1/staff/branches", {
        slug: "about",
        name: "Bad",
        mapEmbedUrl: "https://evil.example/maps",
        onlineBookingEnabled: true,
      }),
    );
    expect(invalid.status).toBe(422);
    expect(
      Object.keys(
        ((await invalid.json()) as { fieldErrors: object }).fieldErrors,
      ).sort(),
    ).toEqual(["mapEmbedUrl", "onlineBookingEnabled", "slug"]);
    expect(await client.branch.count()).toBe(2);
  });

  it("API-A2 refuses an unknown field and an editor", async () => {
    expect(
      (
        await createBranchRoute(
          send("POST", "/api/v1/staff/branches", {
            slug: "x-y",
            name: "X",
            currency: "EUR",
          }),
        )
      ).status,
    ).toBe(422);
    session.staff = { ...admin, role: "EDITOR" };
    expect(
      (
        await createBranchRoute(
          send("POST", "/api/v1/staff/branches", { slug: "x-y", name: "X" }),
        )
      ).status,
    ).toBe(403);
  });

  it("API-A3 updates, audits, and expires only that branch's tags", async () => {
    const response = await updateBranchRoute(
      send("PATCH", `/api/v1/staff/branches/${GIZA}`, {
        phone: "+20 2 9876 5432",
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
      }),
      params({ id: GIZA }),
    );
    expect(response.status).toBe(200);
    expect(
      await client.branch.findUnique({ where: { id: GIZA } }),
    ).toMatchObject({
      phone: "+20 2 9876 5432",
      updatedById: "actor-admin",
    });
    expect(
      await client.auditEvent.findFirst({
        where: { action: "branch.updated" },
      }),
    ).toMatchObject({
      changes: {
        phone: { from: null, to: "+20 2 9876 5432" },
        mapEmbedUrl: {
          from: null,
          to: "https://www.google.com/maps/embed?pb=demo",
        },
      },
    });
    expect(expired).toEqual(
      expect.arrayContaining([
        "branches",
        "branch:demo-giza:page:home",
        "branch:demo-giza:stay:giza-apartment",
      ]),
    );
    expect(expired.some((tag) => tag.startsWith("branch:new-cairo:"))).toBe(
      false,
    );
  });

  it("API-A3 keeps the default branch active and refuses a slug change", async () => {
    const deactivate = await updateBranchRoute(
      send("PATCH", `/api/v1/staff/branches/${TEST_BRANCH_ID}`, {
        status: "INACTIVE",
      }),
      params({ id: TEST_BRANCH_ID }),
    );
    expect(deactivate.status).toBe(422);
    expect(await deactivate.json()).toMatchObject({
      fieldErrors: {
        status: [expect.stringContaining("old website addresses")],
      },
    });
    const slug = await updateBranchRoute(
      send("PATCH", `/api/v1/staff/branches/${GIZA}`, { slug: "elsewhere" }),
      params({ id: GIZA }),
    );
    expect(slug.status).toBe(422);
    const missing = await updateBranchRoute(
      send("PATCH", "/api/v1/staff/branches/nope", { name: "X" }),
      params({ id: "nope" }),
    );
    expect(missing.status).toBe(404);
  });
});

// AC-16: the database refuses the old top-level paths as branch slugs.
describe("reserved slug constraint", () => {
  it.each(["about", "contact", "rooms", "facilities"])(
    "rejects %s at the database",
    async (slug) => {
      await expect(
        createBranch(client, { id: `b-${slug}`, slug }),
      ).rejects.toThrow();
    },
  );
});
