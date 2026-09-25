import { Badge } from "@/presentation/admin/ui/badge";
import { ConfirmDialog } from "@/presentation/admin/ui/confirm-dialog";

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
                <Badge tone="brand">This session</Badge>
              ) : null}
            </p>
            <p className="admin-sessions__meta">
              Signed in {dateFormat.format(session.createdAt)} · expires{" "}
              {dateFormat.format(session.expiresAt)}
            </p>
          </li>
        ))}
      </ul>
      <div className="admin-card__actions">
        <ConfirmDialog
          triggerLabel={`Sign out other sessions (${others})`}
          triggerDisabled={others === 0}
          title={`Sign out ${others === 1 ? "1 other session" : `${others} other sessions`}?`}
          confirmLabel="Sign out other sessions"
          pendingLabel="Signing out…"
          action={revokeOthersAction}
        >
          <p>
            Every other browser signed in to your account is signed out
            immediately. This browser stays signed in.
          </p>
        </ConfirmDialog>
      </div>
    </>
  );
}
