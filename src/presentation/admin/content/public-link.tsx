// Public room, facility, and page routes are built in Phase 7. Until then the
// public address is shown as text so staff are never sent to a missing page.
// Set to true when the public routes ship.
export const PUBLIC_ROUTES_LIVE = false;

export function PublicLink({
  path,
  isPublic,
}: Readonly<{ path: string; isPublic: boolean }>) {
  if (!isPublic) {
    return (
      <p className="admin-muted">
        Public address when published: <code>{path}</code>
      </p>
    );
  }
  if (!PUBLIC_ROUTES_LIVE) {
    return (
      <p className="admin-muted">
        Public address: <code>{path}</code>. The public page goes live with the
        website build.
      </p>
    );
  }
  return (
    <p>
      <a className="admin-link" href={path} target="_blank" rel="noreferrer">
        View public page<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
