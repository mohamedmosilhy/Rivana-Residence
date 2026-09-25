import localFont from "next/font/local";

export const jost = localFont({
  src: [
    {
      path: "../../design/assets/fonts/jost-400.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../design/assets/fonts/jost-500.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-rivana-body",
  display: "swap",
});

export const marcellus = localFont({
  src: "../../design/assets/fonts/marcellus-400.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-rivana-display",
  display: "swap",
});
