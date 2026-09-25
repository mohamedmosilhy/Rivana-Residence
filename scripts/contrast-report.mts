// Prints the WCAG contrast of every public colour pairing in the visual
// system. Run with: npx tsx scripts/contrast-report.mts
// Translucent foregrounds are composited over their background first.

type Pair = Readonly<{
  use: string;
  fg: string;
  bg: string;
  /** 4.5 for normal text, 3 for large text and non-text UI. */
  min: 3 | 4.5;
}>;

const token = {
  plum950: "#2a1020",
  plum900: "#3f1930",
  plum800: "#51213d",
  plum700: "#652a4c",
  gold600: "#8e6230",
  gold400: "#dbaf71",
  gold300: "#e8c795",
  ink: "#1f1b1d",
  neutral800: "#322e30",
  neutral600: "#6e686b",
  controlBorder: "#8a8286",
  canvas: "#faf8f6",
  surface: "#ffffff",
  danger: "#b42318",
  dangerTint: "#fdf1f0",
  focus: "#8a5a24",
  // The darkest stop of the scrim behind tile and hero text.
  scrim: "#1f0d18",
};

const white = (alpha: number) => `rgba(255,255,255,${alpha})`;

const PAIRS: Pair[] = [
  {
    use: "Body text on canvas",
    fg: token.neutral800,
    bg: token.canvas,
    min: 4.5,
  },
  {
    use: "Muted text on canvas",
    fg: token.neutral600,
    bg: token.canvas,
    min: 4.5,
  },
  {
    use: "Muted text on surface",
    fg: token.neutral600,
    bg: token.surface,
    min: 4.5,
  },
  {
    use: "Headings (plum 800) on canvas",
    fg: token.plum800,
    bg: token.canvas,
    min: 4.5,
  },
  {
    use: "Eyebrow/index (gold 600) on canvas",
    fg: token.gold600,
    bg: token.canvas,
    min: 4.5,
  },
  {
    use: "Eyebrow (gold 600) on surface",
    fg: token.gold600,
    bg: token.surface,
    min: 4.5,
  },
  {
    use: "Primary button label on plum 700",
    fg: token.surface,
    bg: token.plum700,
    min: 4.5,
  },
  {
    use: "Primary button hover on plum 900",
    fg: token.surface,
    bg: token.plum900,
    min: 4.5,
  },
  {
    use: "Gold button label on gold 400",
    fg: token.plum950,
    bg: token.gold400,
    min: 4.5,
  },
  {
    use: "Gold button hover on gold 300",
    fg: token.plum950,
    bg: token.gold300,
    min: 4.5,
  },
  {
    use: "Gold eyebrow on plum 900",
    fg: token.gold400,
    bg: token.plum900,
    min: 4.5,
  },
  {
    use: "Gold eyebrow on plum 950",
    fg: token.gold400,
    bg: token.plum950,
    min: 4.5,
  },
  {
    use: "Gold eyebrow on photo scrim",
    fg: token.gold400,
    bg: token.scrim,
    min: 4.5,
  },
  {
    use: "White heading on plum 900",
    fg: token.surface,
    bg: token.plum900,
    min: 4.5,
  },
  {
    use: "Inverse strong (84%) on plum 900",
    fg: white(0.84),
    bg: token.plum900,
    min: 4.5,
  },
  {
    use: "Inverse body (78%) on plum 950",
    fg: white(0.78),
    bg: token.plum950,
    min: 4.5,
  },
  {
    use: "Inverse body (78%) on photo scrim",
    fg: white(0.78),
    bg: token.scrim,
    min: 4.5,
  },
  {
    use: "Inverse muted (62%) legal on plum 950",
    fg: white(0.62),
    bg: token.plum950,
    min: 4.5,
  },
  {
    use: "Header links (ink) on scrolled header",
    fg: token.ink,
    bg: token.canvas,
    min: 4.5,
  },
  {
    use: "Field error text on surface",
    fg: token.danger,
    bg: token.surface,
    min: 4.5,
  },
  {
    use: "Form error summary on tint",
    fg: token.danger,
    bg: token.dangerTint,
    min: 4.5,
  },
  {
    use: "Input border on canvas (non-text)",
    fg: token.controlBorder,
    bg: token.canvas,
    min: 3,
  },
  {
    use: "Input border on surface (non-text)",
    fg: token.controlBorder,
    bg: token.surface,
    min: 3,
  },
  {
    use: "Focus ring on canvas (non-text)",
    fg: token.focus,
    bg: token.canvas,
    min: 3,
  },
  {
    use: "Gold focus ring on plum 900 (non-text)",
    fg: token.gold400,
    bg: token.plum900,
    min: 3,
  },
  {
    use: "Gold focus ring on plum 700 (non-text)",
    fg: token.gold400,
    bg: token.plum700,
    min: 3,
  },
];

function rgba(color: string): [number, number, number, number] {
  if (color.startsWith("#")) {
    const n = Number.parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!, a ?? 1];
}

function composite(fg: string, bg: string): [number, number, number] {
  const [r, g, b, a] = rgba(fg);
  const [br, bgG, bb] = rgba(bg);
  return [r * a + br * (1 - a), g * a + bgG * (1 - a), b * a + bb * (1 - a)];
}

function luminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(pair: Pair) {
  const fg = luminance(composite(pair.fg, pair.bg));
  const bg = luminance(composite(pair.bg, "#ffffff"));
  const [light, dark] = fg > bg ? [fg, bg] : [bg, fg];
  return (light + 0.05) / (dark + 0.05);
}

let failed = 0;
console.log("| Use | Foreground | Background | Ratio | Minimum | Result |");
console.log("| --- | --- | --- | ---: | ---: | --- |");
for (const pair of PAIRS) {
  const ratio = contrast(pair);
  const pass = ratio >= pair.min;
  if (!pass) failed += 1;
  console.log(
    `| ${pair.use} | \`${pair.fg}\` | \`${pair.bg}\` | ${ratio.toFixed(2)}:1 | ${pair.min}:1 | ${pass ? "Pass" : "**Fail**"} |`,
  );
}
if (failed > 0) {
  console.error(`${failed} pairing(s) below the minimum.`);
  process.exitCode = 1;
}
