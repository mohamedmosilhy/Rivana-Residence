import type { Metadata } from "next";

import { requireStaff } from "@/composition/auth";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function AdminOverviewPage() {
  const { staff } = await requireStaff("/admin");

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-header__eyebrow">Admin</p>
          <h1>Overview</h1>
        </div>
      </header>

      <section className="admin-card" aria-labelledby="admin-status-title">
        <h2 id="admin-status-title">Signed in as {staff.name}</h2>
        <p>
          Content management tools arrive in the next phases. This area is
          protected and every action re-checks your session and role.
        </p>
      </section>
    </>
  );
}
