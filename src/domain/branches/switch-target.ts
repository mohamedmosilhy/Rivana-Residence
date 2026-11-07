// Where the header's branch switcher sends a visitor (ADR 026, spec 0002):
// the same page type at the other branch when it exists there, otherwise
// that branch's listing index or home. Listing and facility slugs are
// unique across branches, so a detail page never exists at another branch.

export type SwitchTargetBranch = Readonly<{
  slug: string;
  /** Whether the branch has any published listing (room or apartment). */
  hasListings: boolean;
  hasFacilities: boolean;
}>;

export function switchTarget(pathname: string, target: SwitchTargetBranch) {
  const home = `/${target.slug}`;
  const [, section, item] = pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  switch (section) {
    case "about":
    case "contact":
      return item === undefined ? `${home}/${section}` : home;
    case "stay":
      return target.hasListings ? `${home}/stay` : home;
    case "facilities":
      return target.hasFacilities ? `${home}/facilities` : home;
    default:
      return home;
  }
}
