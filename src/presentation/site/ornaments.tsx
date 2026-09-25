import type { CSSProperties } from "react";

// Decorative brand shapes drawn as lightweight inline SVG. They carry no
// meaning, so they are hidden from assistive technology.

/** The sun-ray arc from the Rivana crest, open at the bottom. */
export function SunRays({ className }: Readonly<{ className?: string }>) {
  const rays = Array.from({ length: 23 }, (_, index) => {
    // 23 rays spread across the 270° arc above the opening.
    const angle = ((-225 + index * (270 / 22)) * Math.PI) / 180;
    const long = index % 2 === 0;
    const inner = 58;
    const outer = long ? 92 : 78;
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      x1: round(100 + inner * Math.cos(angle)),
      y1: round(100 + inner * Math.sin(angle)),
      x2: round(100 + outer * Math.cos(angle)),
      y2: round(100 + outer * Math.sin(angle)),
    };
  });
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 64.65 135.36 A 50 50 0 1 1 135.36 135.36"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {rays.map((ray, index) => (
        <line
          key={index}
          {...ray}
          style={{ "--i": index } as CSSProperties}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** A soft, hand-brushed boundary between a dark band and the canvas. */
export function BrushEdge({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 40 C 120 28 210 46 330 38 C 470 29 560 50 700 41 C 820 33 930 22 1060 34 C 1180 45 1300 30 1440 36 L1440 64 L0 64 Z"
        fill="currentColor"
      />
      <path
        d="M0 50 C 160 44 260 56 420 49 C 560 43 660 58 820 50 C 980 42 1100 55 1260 47 C 1340 43 1400 48 1440 46 L1440 64 L0 64 Z"
        fill="currentColor"
      />
    </svg>
  );
}
