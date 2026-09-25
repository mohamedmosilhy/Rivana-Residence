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

const editor: StaffPrincipal = {
  id: "editor-1",
  name: "Omar Editor",
  email: "omar@example.test",
  role: "EDITOR",
  sessionId: "session-1",
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
    );

    const result = await useCase.execute(editor, { page: "2" });

    expect(repository.listAdminPage).toHaveBeenCalledWith({
      status: null,
      search: null,
      page: 2,
      pageSize: 20,
    });
    expect(result).toMatchObject({ ok: true, value: { total: 0, page: 2 } });
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
