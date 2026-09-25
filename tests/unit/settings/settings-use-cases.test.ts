import { describe, expect, it, vi } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import type {
  AdminSiteSettingsDto,
  SettingsRepository,
} from "@/application/ports/repositories";
import { failure, success } from "@/application/shared/result";
import {
  ReplaceSocialLinks,
  UpdateSiteSettings,
} from "@/application/settings/site-settings";

const admin: StaffPrincipal = {
  id: "admin-1",
  name: "Amira Admin",
  email: "amira@example.test",
  role: "ADMIN",
  sessionId: "session-1",
};
const editor: StaffPrincipal = { ...admin, id: "editor-1", role: "EDITOR" };
const version = "2026-09-25T10:00:00.000Z";

const saved = {
  id: "default",
  siteName: "Rivana Residence",
  updatedAt: new Date(version),
} as unknown as AdminSiteSettingsDto;

function setup(outcome = success(saved)) {
  const repository = {
    update: vi.fn(async () => outcome),
    replaceSocialLinks: vi.fn(async () => outcome),
  } as unknown as SettingsRepository & {
    update: ReturnType<typeof vi.fn>;
    replaceSocialLinks: ReturnType<typeof vi.fn>;
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  return {
    repository,
    cache,
    update: new UpdateSiteSettings(repository, cache),
    replace: new ReplaceSocialLinks(repository, cache),
  };
}

describe("UpdateSiteSettings", () => {
  it("saves validated values and invalidates only the settings tag", async () => {
    const { update, repository, cache } = setup();

    const result = await update.execute(admin, {
      values: { siteName: " Rivana ", email: "stay@rivana.example" },
      expectedUpdatedAt: version,
    });

    expect(result.ok).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        siteName: "Rivana",
        email: "stay@rivana.example",
        phone: null,
      }),
      new Date(version),
      admin,
    );
    expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(["site-settings"]);
  });

  it.each([
    [null, "UNAUTHENTICATED"],
    [editor, "FORBIDDEN"],
  ] as const)(
    "refuses %o before validating or writing",
    async (staff, code) => {
      const { update, repository, cache } = setup();

      const result = await update.execute(staff, {
        values: { siteName: "" },
        expectedUpdatedAt: version,
      });

      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(repository.update).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    },
  );

  it("returns field errors and writes nothing for invalid input", async () => {
    const { update, repository, cache } = setup();

    const result = await update.execute(admin, {
      values: { siteName: "", email: "nope" },
      expectedUpdatedAt: version,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(!result.ok && Object.keys(result.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["siteName", "email"]),
    );
    expect(repository.update).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "yesterday"])(
    "treats a missing or malformed version (%o) as a stale form",
    async (expectedUpdatedAt) => {
      const { update, repository } = setup();
      const result = await update.execute(admin, {
        values: { siteName: "Rivana" },
        expectedUpdatedAt,
      });
      expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it("does not invalidate caches when the write fails", async () => {
    const { update, cache } = setup(failure("CONFLICT", "Stale."));
    const result = await update.execute(admin, {
      values: { siteName: "Rivana" },
      expectedUpdatedAt: version,
    });
    expect(result.ok).toBe(false);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
});

describe("ReplaceSocialLinks", () => {
  const link = {
    platform: "instagram",
    label: "Instagram",
    url: "https://instagram.com/rivana",
    isVisible: true,
  };

  it("saves ordered links and invalidates the settings tag", async () => {
    const { replace, repository, cache } = setup();
    const links = [link, { ...link, platform: "x", label: "X" }];

    expect(
      (await replace.execute(admin, { links, expectedUpdatedAt: version })).ok,
    ).toBe(true);
    expect(repository.replaceSocialLinks).toHaveBeenCalledWith(
      links,
      new Date(version),
      admin,
    );
    expect(cache.invalidate).toHaveBeenCalledWith(["site-settings"]);
  });

  it("maps row errors to index paths", async () => {
    const { replace, repository } = setup();
    const result = await replace.execute(admin, {
      links: [link, { ...link, url: "http://insecure.example" }],
      expectedUpdatedAt: version,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { "1.url": [expect.any(String)] },
      },
    });
    expect(repository.replaceSocialLinks).not.toHaveBeenCalled();
  });

  it("is administrator-only", async () => {
    const { replace, repository } = setup();
    const result = await replace.execute(editor, {
      links: [],
      expectedUpdatedAt: version,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(repository.replaceSocialLinks).not.toHaveBeenCalled();
  });
});
