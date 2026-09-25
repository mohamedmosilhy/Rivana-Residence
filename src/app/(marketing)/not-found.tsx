import Link from "next/link";

export default function MarketingNotFound() {
  return (
    <section
      className="site-holding site-container"
      aria-labelledby="not-found-title"
    >
      <p className="site-eyebrow">404</p>
      <h1 id="not-found-title">This page could not be found</h1>
      <p>It may have moved or is not available yet.</p>
      <p>
        <Link href="/" className="site-button">
          Go to the home page
        </Link>
      </p>
    </section>
  );
}
