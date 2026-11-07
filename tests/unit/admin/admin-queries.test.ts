import { describe, expect, it, vi } from "vitest";

import { GetAdminOverview } from "@/application/admin/get-overview";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  ListEnquiries,
  parseEnquiryListQuery,
} from "@/application/enquiries/list-enquiries";
import type {
  AdminOverviewReader,
  EnquiryRepository,
} from "@/application/ports/repositories";
import { pageCount, parsePageNumber } from "@/application/shared/pagination";

import { branchRow, fakeBranches } from "../../support/fake-branches";

const BRANCHES = fakeBranches([
  branchRow({ id: "branch-a", slug: "a" }),
  branchRow({ id: "branch-b", slug: "b", sortOrder: 1 }),
]).repository;

const editor: StaffPrincipal = {
  id: "editor-1",
  name: "Omar Editor",
  email: "omar@example.test",
  role: "EDITOR",
  sessionId: "session-1",
  branchIds: [],
};

describe("enquiry list query", () => {
  it("normalizes untrusted search params", () => {
    expect(
      parseEnquiryListQuery({ status: "NEW", q: "  omar ", page: "3" }),
    ).toEqual({ status: "NEW", search: "omar", page: 3, pageSize: 20 });
  });

  it.each([
    [{ status: "DELETED" }, null],
    [{ status: ["NEW", "READ"] }, null],
    [{ status: "new" }, null],
  ])("ignores an invalid status %o", (params, status) => {
    expect(parseEnquiryListQuery(params).status).toBe(status);
  });

  it("caps the search length and drops blank searches", () => {
    expect(parseEnquiryListQuery({ q: "x".repeat(500) }).search).toHaveLength(
      100,
    );
    expect(parseEnquiryListQuery({ q: "   " }).search).toBeNull();
  });

  it.each(["0", "-2", "1.5", "abc", "9007199254740993", undefined])(
    "falls back to page 1 for %o",
    (page) => {
      expect(parsePageNumber(page)).toBe(1);
    },
  );

  it("counts at least one page", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });

  it("requires enquiry access before querying", async () => {
    const repository = { listAdminPage: vi.fn() };
    const useCase = new ListEnquiries(
      repository as unknown as EnquiryRepository,
      BRANCHES,
    );

    expect(await useCase.execute(null, {})).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(repository.listAdminPage).not.toHaveBeenCalled();
  });

  it("passes the parsed query to the repository", async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 20 };
    const repository = { listAdminPage: vi.fn(async () => page) };
    const useCase = new ListEnquiries(
      repository as unknown as EnquiryRepository,
      BRANCHES,
    );

    const result = await useCase.execute(editor, { page: "2" });

    expect(repository.listAdminPage).toHaveBeenCalledWith({
      status: null,
      search: null,
      page: 2,
      pageSize: 20,
      branchScope: "ALL",
      branchId: null,
    });
    expect(result).toMatchObject({ ok: true, value: { total: 0, page: 2 } });
  });

  // Q-26: Receptionists and Managers see only their branches' enquiries; an
  // unassigned one sees none.
  it.each([
    ["RECEPTIONIST", ["branch-a"], ["branch-a"]],
    ["MANAGER", ["branch-a", "branch-b"], ["branch-a", "branch-b"]],
    ["RECEPTIONIST", [], []],
  ] as const)(
    "limits a %s to assigned branches %j",
    async (role, branchIds, scope) => {
      const page = { items: [], total: 0, page: 1, pageSize: 20 };
      const repository = { listAdminPage: vi.fn(async () => page) };
      await new ListEnquiries(
        repository as unknown as EnquiryRepository,
        BRANCHES,
      ).execute({ ...editor, role, branchIds }, {});
      expect(repository.listAdminPage).toHaveBeenCalledWith(
        expect.objectContaining({ branchScope: scope }),
      );
    },
  );
});

// AC-14: the branch filter narrows inside the caller's scope, never beyond.
describe("enquiry branch filter", () => {
  const page = { items: [], total: 0, page: 1, pageSize: 20 };

  it("filters by a branch slug resolved on the server", async () => {
    const repository = { listAdminPage: vi.fn(async () => page) };
    const result = await new ListEnquiries(
      repository as unknown as EnquiryRepository,
      BRANCHES,
    ).execute(editor, { branch: "b" });
    expect(repository.listAdminPage).toHaveBeenCalledWith(
      expect.objectContaining({ branchScope: "ALL", branchId: "branch-b" }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { query: { branch: "b" } },
    });
  });

  it("ignores a branch outside a receptionist's scope", async () => {
    const repository = { listAdminPage: vi.fn(async () => page) };
    const result = await new ListEnquiries(
      repository as unknown as EnquiryRepository,
      BRANCHES,
    ).execute(
      { ...editor, role: "RECEPTIONIST", branchIds: ["branch-a"] },
      { branch: "b" },
    );
    expect(repository.listAdminPage).toHaveBeenCalledWith(
      expect.objectContaining({ branchScope: ["branch-a"], branchId: null }),
    );
    expect(result.ok && result.value.branches.map((b) => b.slug)).toEqual([
      "a",
    ]);
  });
});

describe("GetAdminOverview", () => {
  it("reads at the current time for signed-in staff only", async () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const reader = { read: vi.fn(async () => ({}) as never) };
    const useCase = new GetAdminOverview(
      reader as unknown as AdminOverviewReader,
      { now: () => now },
    );

    expect((await useCase.execute(null)).ok).toBe(false);
    expect(reader.read).not.toHaveBeenCalled();

    expect((await useCase.execute(editor)).ok).toBe(true);
    expect(reader.read).toHaveBeenCalledWith(now, 6);
  });
});
