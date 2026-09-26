import { Badge } from "@/presentation/admin/ui/badge";
import { ConfirmDialog } from "@/presentation/admin/ui/confirm-dialog";
import { cardActions } from "@/presentation/admin/ui/classes";

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
      <ul className="mt-5 grid gap-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-control border border-neutral-300 px-4 py-3"
          >
            <p className="in-card:m-0 in-card:text-neutral-800 in-card:[overflow-wrap:anywhere]">
              {session.userAgent ?? "Unknown browser"}
              {session.current ? (
                <Badge tone="brand" className="ml-2">
                  This session
                </Badge>
              ) : null}
            </p>
            <p className="in-card:mt-1 in-card:mb-0 in-card:text-[0.875rem]">
              Signed in {dateFormat.format(session.createdAt)} · expires{" "}
              {dateFormat.format(session.expiresAt)}
            </p>
          </li>
        ))}
      </ul>
      <div className={cardActions}>
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
