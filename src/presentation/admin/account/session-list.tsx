type SessionSummary = Readonly<{
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  current: boolean;
}>;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

export function SessionList({
  sessions,
  revokeOthersAction,
}: Readonly<{
  sessions: readonly SessionSummary[];
  revokeOthersAction: () => Promise<void>;
}>) {
  const others = sessions.filter((session) => !session.current).length;

  return (
    <>
      <ul className="admin-sessions">
        {sessions.map((session) => (
          <li key={session.id}>
            <p className="admin-sessions__device">
              {session.userAgent ?? "Unknown browser"}
              {session.current ? (
                <span className="admin-badge">This session</span>
              ) : null}
            </p>
            <p className="admin-sessions__meta">
              Signed in {dateFormat.format(session.createdAt)} · expires{" "}
              {dateFormat.format(session.expiresAt)}
            </p>
          </li>
        ))}
      </ul>
      <form action={revokeOthersAction}>
        <button
          className="admin-button admin-button--secondary"
          type="submit"
          disabled={others === 0}
        >
          Sign out other sessions ({others})
        </button>
      </form>
    </>
  );
}
