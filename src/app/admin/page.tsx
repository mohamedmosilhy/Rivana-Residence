export default function AdminFoundationPage() {
  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-header__eyebrow">Admin foundation</p>
          <h1>Overview</h1>
        </div>
      </header>

      <section className="admin-card" aria-labelledby="admin-status-title">
        <h2 id="admin-status-title">Foundation ready for review</h2>
        <p>
          This shell contains no CMS data or actions. Authentication begins in
          Phase 3, after the domain and persistence boundaries are approved.
        </p>
      </section>
    </>
  );
}
