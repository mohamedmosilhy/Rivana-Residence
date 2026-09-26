// Tailwind class lists shared across the admin screens. Every variant is a
// complete list, so two conflicting utilities never meet on one element.

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center rounded-control border text-center leading-[1.2] [transition:background_var(--motion-fast),border-color_var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_VARIANTS = {
  primary:
    "border-plum-700 bg-plum-700 font-medium text-surface hover:not-disabled:bg-plum-800",
  secondary:
    "border-plum-700 bg-surface font-medium text-plum-700 hover:not-disabled:bg-plum-100",
  quiet:
    "border-neutral-300 bg-surface font-normal text-neutral-800 hover:not-disabled:bg-admin-canvas",
  danger:
    "border-danger bg-danger font-medium text-surface hover:not-disabled:bg-[#8f1c13]",
  "danger-quiet":
    "border-neutral-300 bg-surface font-normal text-danger hover:not-disabled:border-danger hover:not-disabled:bg-danger-soft",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

const QUIET = new Set<ButtonVariant>(["quiet", "danger-quiet"]);

/**
 * Admin button. `compact` is the small reorder control; `stretch` fills its
 * grid cell (the sign-in form).
 */
export function button(
  variant: ButtonVariant = "primary",
  options: Readonly<{ compact?: boolean; stretch?: boolean }> = {},
) {
  const size = options.compact
    ? "min-h-9 px-2 py-2 text-[0.875rem]"
    : QUIET.has(variant)
      ? "min-h-10 px-3 py-2"
      : "min-h-11 px-5 py-2";
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${size} ${
    options.stretch ? "justify-self-stretch" : "justify-self-start"
  }`;
}

/** Text inside cards: every heading, paragraph, and emphasis it contains. */
export const card =
  "mt-6 max-w-[46rem] rounded-panel border border-neutral-300 bg-surface p-[clamp(1.25rem,3vw,2rem)] [&_h2]:m-0 [&_h2]:text-[1.1875rem] [&_h2]:font-medium [&_h2]:text-neutral-950 [&_p]:[margin:0.75rem_0_0] [&_p]:max-w-[65ch] [&_p]:text-neutral-600 [&_strong]:font-medium [&_strong]:text-neutral-800";
export const cardWide = card.replace("max-w-[46rem]", "max-w-none");

export const section = "mt-10 first-of-type:mt-0";
export const sectionTitle =
  "m-0 mb-4 text-[1.125rem] font-medium text-neutral-950";
export const muted = "m-0 text-neutral-600";
export const link = "text-plum-700 underline underline-offset-[0.2em]";

// Form fields: a label, optional hint and errors, then the control.
export const field = "grid min-w-0 content-start gap-2";
export const fieldLabel = "font-medium text-neutral-800";
export const fieldOptional = "font-normal text-neutral-600";
export const fieldHint =
  "m-0 text-[0.875rem] text-neutral-600 in-card:m-0 in-card:text-[0.875rem] in-card:text-neutral-600";
export const fieldErrors = "m-0 pl-5 text-[0.875rem] font-medium text-danger";
export const control =
  "min-h-11 w-full min-w-0 rounded-control border border-neutral-600 bg-surface px-3 py-2 text-neutral-950 aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--color-danger)]";
export const textarea = `${control} resize-y`;
export const check = "inline-flex min-h-11 cursor-pointer items-center gap-2";
export const checkInput = "size-[1.125rem] accent-plum-700";

export const form = "mt-6 grid gap-5";
export const formGrid =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-5";
// Every legend inside a fieldset (including hidden ones in pickers) takes
// the legend style, as the old descendant rule did.
const LEGENDS =
  "[&_legend]:mb-4 [&_legend]:font-medium [&_legend]:text-neutral-950";
export const fieldset = `grid min-w-0 gap-5 border-b border-neutral-300 pb-6 ${LEGENDS}`;
export const fieldsetFlat = `grid min-w-0 gap-5 ${LEGENDS}`;
export const legend = "mb-4 font-medium text-neutral-950";

const BADGE_BASE =
  "inline-block rounded-[999px] border px-2 py-[0.0625rem] text-[0.75rem] leading-[1.5] font-medium whitespace-nowrap";
export const BADGE_TONES = {
  neutral: `${BADGE_BASE} border-current text-neutral-600`,
  success: `${BADGE_BASE} border-current text-success`,
  warning: `${BADGE_BASE} border-current text-warning`,
  danger: `${BADGE_BASE} border-current text-danger`,
  brand: `${BADGE_BASE} border-plum-100 bg-plum-100 text-plum-800`,
} as const;

// Empty, loading, and error states.
export const state =
  "mt-6 grid justify-items-start gap-3 rounded-panel border border-dashed border-neutral-300 bg-surface p-[clamp(1.5rem,4vw,2.5rem)]";
export const stateTitle =
  "m-0 text-[1.125rem] font-medium text-neutral-950 focus:[outline:none]";
export const stateBody =
  "[&_:is(p,ul)]:[margin:0_0_0.5rem] [&_:is(p,ul)]:max-w-[65ch] [&_:is(p,ul)]:text-neutral-600";
export const stateAction = "flex flex-wrap items-center gap-4";

export const notice =
  "mb-6 rounded-control border border-l-4 border-neutral-300 border-l-success bg-surface px-4 py-3 text-neutral-800";
export const noticePreview = notice.replace(
  "border-l-success",
  "border-l-plum-700",
);

// Error summary shown after a failed submission.
export const errorSummary =
  "rounded-control border-2 border-danger bg-danger-soft px-5 py-4 focus:[outline:3px_solid_var(--color-focus)] focus:[outline-offset:3px]";
export const errorSummaryTitle =
  "m-0 text-[1rem] text-danger in-card:m-0 in-card:text-[1rem] in-card:text-danger";
export const errorSummaryList = "mt-2 pl-5";
export const errorSummaryLink =
  "text-danger underline underline-offset-[0.2em]";

// Confirmation dialogs.
export const dialog =
  "w-[min(30rem,calc(100vw-2rem))] rounded-panel border border-neutral-300 bg-surface p-6 text-neutral-800 shadow-[var(--shadow-md)] backdrop:bg-[rgb(31_27_29/0.5)] [&_h2]:m-0 [&_h2]:text-[1.1875rem] [&_h2]:font-medium [&_h2]:text-neutral-950";
export const dialogBody = "[&_p]:[margin:0.75rem_0_0] [&_p]:text-neutral-600";
export const dialogActions = "mt-6 flex flex-wrap justify-end gap-3";

// Tables.
export const tableWrap =
  "overflow-x-auto rounded-panel border border-neutral-300 bg-surface";
export const tablePrimary = "block";
export const tableSecondary =
  "block text-[0.875rem] font-normal text-neutral-600";

/** A fieldset hint pulled up under its legend inside cards. */
export const fieldsetHint = "in-card:-mt-2 in-card:mb-0";

// Readiness and content-gap notes in the publication panel.
const READINESS_BASE =
  "mt-3 rounded-control border-l-4 px-4 py-3 in-card:[&_p]:m-0 in-card:[&_p]:text-neutral-800 [&_ul]:mt-2 [&_ul]:pl-5 [&_ul]:text-neutral-800";
export const readiness = `${READINESS_BASE} border-l-warning bg-[#fbf5ec]`;
export const readinessGaps = `${READINESS_BASE} border-l-neutral-600 bg-admin-canvas`;

/** The publication panel: a wide card that sits above the form. */
export const publicationCard = cardWide.replace("mt-6", "mt-0 mb-6");

export const preview =
  "max-w-[46rem] rounded-panel border border-neutral-300 bg-surface p-[clamp(1.5rem,4vw,2.5rem)] text-neutral-800 [&_:is(h2,h3,h4)]:font-medium [&_:is(h2,h3,h4)]:text-neutral-950";
export const previewTitle = "m-0 text-[1.75rem] font-medium text-neutral-950";
export const previewLede = "text-[1.0625rem] text-neutral-600";
export const previewEyebrow =
  "m-0 text-[0.8125rem] tracking-[0.1em] text-plum-700 uppercase";
export const previewPlaceholder =
  "my-2 inline-block rounded-control border border-dashed border-neutral-300 px-3 py-2 text-[0.875rem] text-neutral-600";
export const previewFacts = "flex flex-wrap gap-x-5 gap-y-2";

/**
 * A checkbox inside a field wrapper: the old field rules also gave it the
 * text-control box, which is kept so nothing shifts.
 */
export const checkInputInField =
  "size-[1.125rem] min-h-11 min-w-0 rounded-control border border-neutral-600 bg-surface px-3 py-2 text-neutral-950 accent-plum-700";
/** A check label inside a field wrapper also takes the field label style. */
export const checkInField = `${check} font-medium text-neutral-800`;

// Form-level outcome messages.
export const formError =
  "rounded-control border-l-4 border-l-danger bg-danger-soft px-4 py-3 text-danger";
export const formSuccess =
  "rounded-control border-l-4 border-l-success bg-[#eef6f1] px-4 py-3 text-success";

export const listNote = "mt-3 mb-0 text-[0.875rem] text-neutral-600";
export const cardActions = "mt-5";
export const descriptionList =
  "mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4 [&_dd]:mt-1 [&_dd]:text-neutral-950 [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-[0.875rem] [&_dt]:text-neutral-600";

/** A stack of image choosers; focusable as an error-summary target. */
export const formStack = "grid gap-6 focus:[outline:none]";
export const badgeGroup = "inline-flex flex-wrap gap-1";
export const imageChoiceActions = "flex flex-wrap gap-2";
