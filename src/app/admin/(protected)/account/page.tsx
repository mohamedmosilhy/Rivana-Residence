import type { Metadata } from "next";

import { listOwnSessions, requireStaff } from "@/composition/auth";
import { PasswordForm } from "@/presentation/admin/account/password-form";
import { SessionList } from "@/presentation/admin/account/session-list";
import { AccessDenied } from "@/presentation/admin/auth/access-denied";

import { changePasswordAction, revokeOtherSessionsAction } from "./actions";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const { staff, allowed } = await requireStaff(
    "/admin/account",
    "sessions:manage-own",
  );
  if (!allowed) return <AccessDenied />;

  const sessions = await listOwnSessions();

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-header__eyebrow">Account</p>
          <h1>{staff.name}</h1>
          <p className="admin-header__meta">{staff.email}</p>
        </div>
      </header>

      <section className="admin-card" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Active sessions</h2>
        <SessionList
          sessions={sessions.ok ? sessions.value : []}
          revokeOthersAction={revokeOtherSessionsAction}
        />
      </section>

      <section className="admin-card" aria-labelledby="password-title">
        <h2 id="password-title">Change password</h2>
        <PasswordForm action={changePasswordAction} />
      </section>
    </>
  );
}
