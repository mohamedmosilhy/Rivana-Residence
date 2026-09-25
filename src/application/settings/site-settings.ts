import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator } from "@/application/ports/providers";
import type {
  AdminSiteSettingsDto,
  SettingsRepository,
} from "@/application/ports/repositories";
import { failure, invalid, type Result } from "@/application/shared/result";
import { issuesFromZod } from "@/domain/shared/domain-error";
import {
  siteSettingsSchema,
  socialLinksSchema,
} from "@/domain/settings/site-settings";

const STALE_FORM_MESSAGE =
  "The settings form is out of date. Reload the page and try again.";

function parseVersion(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class GetPublicSiteSettings {
  constructor(private readonly settings: SettingsRepository) {}

  execute() {
    return this.settings.getPublic();
  }
}

export class GetAdminSiteSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(
    staff: StaffPrincipal | null,
  ): Promise<Result<AdminSiteSettingsDto | null>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    return { ok: true, value: await this.settings.getAdmin() };
  }
}

export type UpdateSiteSettingsCommand = Readonly<{
  /** Raw, untrusted form values keyed by field name. */
  values: Readonly<Record<string, unknown>>;
  expectedUpdatedAt: unknown;
}>;

export class UpdateSiteSettings {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly cache: CacheInvalidator,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    command: UpdateSiteSettingsCommand,
  ): Promise<Result<AdminSiteSettingsDto>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;

    const expectedUpdatedAt = parseVersion(command.expectedUpdatedAt);
    if (!expectedUpdatedAt) return failure("CONFLICT", STALE_FORM_MESSAGE);

    const parsed = siteSettingsSchema.safeParse(command.values);
    if (!parsed.success) {
      return invalid(
        "Some settings need attention.",
        issuesFromZod(parsed.error.issues),
      );
    }

    const result = await this.settings.update(
      parsed.data,
      expectedUpdatedAt,
      access.value,
    );
    if (result.ok) await this.cache.invalidate([CACHE_TAGS.siteSettings]);
    return result;
  }
}

export type ReplaceSocialLinksCommand = Readonly<{
  /** Raw, untrusted rows in display order. */
  links: unknown;
  expectedUpdatedAt: unknown;
}>;

export class ReplaceSocialLinks {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly cache: CacheInvalidator,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    command: ReplaceSocialLinksCommand,
  ): Promise<Result<AdminSiteSettingsDto>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;

    const expectedUpdatedAt = parseVersion(command.expectedUpdatedAt);
    if (!expectedUpdatedAt) return failure("CONFLICT", STALE_FORM_MESSAGE);

    const parsed = socialLinksSchema.safeParse(command.links);
    if (!parsed.success) {
      return invalid(
        "Some social links need attention.",
        issuesFromZod(parsed.error.issues),
      );
    }

    const result = await this.settings.replaceSocialLinks(
      parsed.data,
      expectedUpdatedAt,
      access.value,
    );
    if (result.ok) await this.cache.invalidate([CACHE_TAGS.siteSettings]);
    return result;
  }
}
