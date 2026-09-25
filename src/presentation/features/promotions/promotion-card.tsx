type PromotionCardProps = Readonly<{
  headline: string;
  body: string;
  code: string;
  terms: string | null;
  /** Heading element id, so a dialog can use it as its accessible name. */
  headingId?: string;
}>;

// The content of the public promotion pop-up. The admin preview renders the
// same component, so staff see exactly the copy visitors will read. All
// values are plain text.
export function PromotionCard({
  headline,
  body,
  code,
  terms,
  headingId,
}: PromotionCardProps) {
  return (
    <div className="promotion-card">
      <p className="promotion-card__eyebrow">Special offer</p>
      <h2 className="promotion-card__headline" id={headingId}>
        {headline || "Headline"}
      </h2>
      <p className="promotion-card__body">{body || "Pop-up message"}</p>
      <p className="promotion-card__code-label">Promotion code</p>
      <p className="promotion-card__code">{code || "CODE"}</p>
      {terms ? <p className="promotion-card__terms">{terms}</p> : null}
      <p className="promotion-card__notice">
        Terms apply. The reservation system confirms eligibility and price.
      </p>
    </div>
  );
}
