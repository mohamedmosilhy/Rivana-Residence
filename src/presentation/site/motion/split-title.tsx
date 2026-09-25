import type { CSSProperties } from "react";

// The whole reveal finishes within about a second, however long the title.
const MAX_STEP = 0.035;
const MAX_TOTAL = 0.7;

/**
 * The one per-character reveal on the site (the home hero). It is pure CSS,
 * so it plays on first paint without waiting for JavaScript, and it always
 * ends fully visible. Assistive technology reads the plain title; the split
 * letters are hidden from it. Words never break mid-word.
 */
export function SplitTitle({ text }: Readonly<{ text: string }>) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const letters = words.reduce((total, word) => total + [...word].length, 0);
  const step = letters > 1 ? Math.min(MAX_STEP, MAX_TOTAL / (letters - 1)) : 0;
  let index = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="site-split-title" aria-hidden="true">
        {words.map((word, wordIndex) => (
          <span key={wordIndex}>
            {wordIndex > 0 ? " " : null}
            <span className="site-split-title__word">
              {[...word].map((letter, letterIndex) => (
                <span
                  key={letterIndex}
                  className="site-split-title__char"
                  style={
                    {
                      "--char-delay": `${(index++ * step).toFixed(3)}s`,
                    } as CSSProperties
                  }
                >
                  {letter}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
