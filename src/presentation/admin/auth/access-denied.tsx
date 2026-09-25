export function AccessDenied() {
  return (
    <section className="admin-card" aria-labelledby="access-denied-title">
      <h2 id="access-denied-title">You do not have access to this area</h2>
      <p>
        Your account role does not include this section. Ask an administrator if
        you need access.
      </p>
    </section>
  );
}
