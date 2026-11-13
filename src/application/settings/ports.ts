import type {
  SiteSettingsInput,
  SocialLinkInput,
} from "@/domain/settings/site-settings";
import type { Result } from "@/application/shared/result";
import type { Actor } from "@/application/shared/actor";

export type SocialLinkDto = SocialLinkInput;

export type SiteSettingsDto = Readonly<
  SiteSettingsInput & {
    id: "default";
    timeZone: string;
    /** Ordered for display. Public reads include visible links only. */
    socialLinks: readonly SocialLinkDto[];
    logoMediaId: string | null;
    stickyLogoMediaId: string | null;
    faviconMediaId: string | null;
    defaultOgMediaId: string | null;
  }
>;

export type AdminSiteSettingsDto = SiteSettingsDto &
  Readonly<{
    updatedAt: Date;
    updatedByName: string | null;
  }>;

export type SiteImagesInput = Readonly<{
  logoMediaId: string | null;
  stickyLogoMediaId: string | null;
  faviconMediaId: string | null;
  defaultOgMediaId: string | null;
}>;

export interface SettingsRepository {
  getPublic(): Promise<SiteSettingsDto | null>;
  getAdmin(): Promise<AdminSiteSettingsDto | null>;
  /**
   * Writes only when the stored `updatedAt` still equals `expectedUpdatedAt`,
   * otherwise returns CONFLICT so a stale form cannot overwrite newer edits.
   */
  update(
    input: SiteSettingsInput,
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
  /** Replaces every social link; array order becomes display order. */
  replaceSocialLinks(
    links: readonly SocialLinkInput[],
    expectedUpdatedAt: Date,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
  /** Brand and default sharing images; each must be a ready image. */
  updateImages(
    input: SiteImagesInput,
    actor: Actor,
  ): Promise<Result<AdminSiteSettingsDto>>;
}
