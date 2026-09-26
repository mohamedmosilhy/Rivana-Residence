type PromotionCardProps = Readonly<{
  headline: string;
  body: string;
  code: string;
  terms: string | null;
  /** Heading element id, so a dialog can use it as its accessible name. */
  headingId?: string;
  /** Inside the public pop-up: square corners and roomier padding. */
  popup?: boolean;
}>;

const LABEL =
  "m-0 text-[0.75rem] font-medium tracking-[0.14em] text-gold-600 uppercase";
const NOTE = "mt-3 text-[0.8125rem] text-neutral-600";

// The content of the public promotion pop-up. The admin preview renders the
// same component, so staff see exactly the copy visitors will read. All
// values are plain text.
export function PromotionCard({
  headline,
  body,
  code,
  terms,
  headingId,
  popup = false,
}: PromotionCardProps) {
  return (
    <div
      className={`border-t-3 border-t-gold-400 bg-surface text-neutral-800 [overflow-wrap:anywhere] ${popup ? "rounded-none px-8 pt-8 pb-5" : "rounded-panel p-6"}`}
    >
      <p className={LABEL}>Special offer</p>
      <h2
        className={`mt-2 [font-family:var(--font-rivana-display),Georgia,serif] leading-[1.2] font-normal text-plum-800 ${popup ? "text-heading-lg" : "text-[1.5rem]"}`}
        id={headingId}
      >
        {headline || "Headline"}
      </h2>
      <p className="mt-3 mb-4">{body || "Pop-up message"}</p>
      <p className={LABEL}>Promotion code</p>
      <p className="mt-1 rounded-control border border-dashed border-plum-700 px-3 py-2 [font-family:ui-monospace,SFMono-Regular,Menlo,monospace] text-[1.125rem] tracking-[0.08em] text-plum-800 select-all">
        {code || "CODE"}
      </p>
      {terms ? <p className={NOTE}>{terms}</p> : null}
      <p className={NOTE}>
        Terms apply. The reservation system confirms eligibility and price.
      </p>
    </div>
  );
}
