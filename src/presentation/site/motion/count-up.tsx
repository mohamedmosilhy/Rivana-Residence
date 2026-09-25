"use client";

import { useEffect } from "react";

import { useReveal } from "@/presentation/site/motion/reveal";

const DURATION_MS = 1600;
// The site's soft ease-out curve, cubic-bezier(0.23, 1, 0.32, 1), approximated.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

// "120", "4.9", "1,500+", "£30": one number with optional text around it.
// Values such as "24/7" contain a second number and stay as written.
const NUMBER = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\D*)$/;

/**
 * A statistic that counts up the first time it scrolls into view. The
 * server renders the final value; screen readers only ever hear that value.
 */
export function CountUp({ value }: Readonly<{ value: string }>) {
  const match = NUMBER.exec(value.trim());
  if (!match) return value;
  const [, prefix = "", whole = "", fraction = "", suffix = ""] = match;
  return (
    <Counter
      value={value}
      prefix={prefix}
      target={Number(`${whole.replace(/,/g, "")}${fraction}`)}
      decimals={fraction ? fraction.length - 1 : 0}
      grouped={whole.includes(",")}
      suffix={suffix}
    />
  );
}

function Counter({
  value,
  prefix,
  target,
  decimals,
  grouped,
  suffix,
}: Readonly<{
  value: string;
  prefix: string;
  target: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}>) {
  const { ref, state, armed } = useReveal<HTMLSpanElement>();
  useEffect(() => {
    const node = ref.current;
    if (!node || !armed) return;
    const format = (current: number) =>
      `${prefix}${current.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouped,
      })}${suffix}`;
    if (state === "hidden") {
      node.textContent = format(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      node.textContent =
        progress < 1 ? format(target * easeOut(progress)) : value;
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      node.textContent = value;
    };
  }, [armed, state, prefix, target, decimals, grouped, suffix, value, ref]);

  return (
    <>
      <span className="sr-only">{value}</span>
      <span ref={ref} className="site-count" aria-hidden="true">
        {value}
      </span>
    </>
  );
}
