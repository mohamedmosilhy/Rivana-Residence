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
  return (
    <p>
      <a className="admin-link" href={path} target="_blank" rel="noreferrer">
        View public page<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
