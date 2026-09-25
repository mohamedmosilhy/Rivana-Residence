import { FoundationNotice } from "@/presentation/ui/foundation-notice";

export default function HomePage() {
  return (
    <section
      className="foundation-hero shell-container"
      aria-labelledby="foundation-title"
    >
      <div className="foundation-hero__content">
        <p className="foundation-hero__eyebrow">New website foundation</p>
        <h1 id="foundation-title">Rivana Residence</h1>
        <p className="foundation-hero__copy">
          The public experience is being prepared on an accessible,
          production-oriented foundation. Property content and booking remain
          intentionally outside this phase.
        </p>
        <FoundationNotice>Phase 1 foundation in review</FoundationNotice>
      </div>
    </section>
  );
}
