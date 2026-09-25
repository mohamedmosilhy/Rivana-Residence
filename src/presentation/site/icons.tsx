// A small set of line icons that match the thin-rule visual language.
// Icons are always paired with visible text, so they are decorative.

type IconName =
  | "arrow"
  | "arrow-left"
  | "clock"
  | "close"
  | "mail"
  | "phone"
  | "pin";

const PATHS: Record<IconName, string> = {
  arrow: "M4 12h15M13 6l6 6-6 6",
  "arrow-left": "M20 12H5M11 6l-6 6 6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  close: "M6 6l12 12M18 6 6 18",
  mail: "M3.5 6.5h17v11h-17zM4 7l8 6 8-6",
  phone:
    "M6.6 3.5h2.8l1.4 4-2 1.4a11 11 0 0 0 6.3 6.3l1.4-2 4 1.4v2.8a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z",
  pin: "M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21ZM12 12.3a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
};

export function Icon({
  name,
  className = "site-icon",
}: Readonly<{ name: IconName; className?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
