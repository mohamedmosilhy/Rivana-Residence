import { link, muted } from "@/presentation/admin/ui/classes";

export function PublicLink({
  path,
  isPublic,
}: Readonly<{ path: string; isPublic: boolean }>) {
  if (!isPublic) {
    return (
      <p className={muted}>
        Public address when published: <code>{path}</code>
      </p>
    );
  }
  return (
    <p>
      <a className={link} href={path} target="_blank" rel="noreferrer">
        View public page
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
