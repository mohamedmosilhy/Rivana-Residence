"use client";

import { AnimatePresence, m, type Variants } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import type { PublicImage } from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import {
  EASE_OUT_SOFT,
  Reveal,
  RevealItem,
} from "@/presentation/site/motion/reveal";
import { SiteImage } from "@/presentation/site/site-image";

// Without JavaScript each photo is a plain link to its full-size file. With
// JavaScript the link opens a modal viewer (a native <dialog>, so focus is
// contained, the page behind is inert, and Escape closes it) with labelled
// previous/next buttons, arrow keys, swipe, thumbnails, and a polite
// "Photo 2 of 5" announcement. There is no autoplay and no wrap-around.
//
// EDITORIAL leads with one large photo; GRID keeps every photo equal.
const SWIPE_DISTANCE = 50;

const SLIDE: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 72 }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.55, ease: EASE_OUT_SOFT },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -72,
    transition: { duration: 0.3, ease: "easeIn" },
  }),
};

const pad = (value: number) => String(value).padStart(2, "0");

export function Gallery({
  images,
  label,
  layout = "GRID",
}: Readonly<{
  images: readonly PublicImage[];
  label: string;
  layout?: string;
}>) {
  const [current, setCurrent] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const thumbsRef = useRef<HTMLUListElement>(null);
  const swipeStart = useRef<number | null>(null);
  const titleId = useId();
  const total = images.length;

  const go = (target: number) => {
    if (current === null || target < 0 || target >= total) return;
    if (target === current) return;
    setDirection(target > current ? 1 : -1);
    setCurrent(target);
  };

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (current === null || !dialog) return;
    if (!dialog.open) dialog.showModal();
    // A previous/next button that just became disabled would drop focus to
    // the page; hand it to its partner instead.
    const active = document.activeElement;
    if (active === previousRef.current && current === 0)
      nextRef.current?.focus();
    if (active === nextRef.current && current === total - 1)
      previousRef.current?.focus();
    thumbsRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current, total]);

  if (total === 0) return null;
  const editorial = layout === "EDITORIAL" && total >= 3;
  const image = current === null ? null : images[current];

  const open = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    // Let people open the file in a new tab or window as usual.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    openerRef.current = event.currentTarget;
    setDirection(1);
    setCurrent(index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (current === null) return;
    if (event.key === "Tab") {
      // A modal dialog still lets Tab leave for the browser's own controls;
      // keep it cycling through the viewer instead.
      const focusable = [
        ...event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    const target = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: total - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    go(target);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (swipeStart.current === null || current === null) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) < SWIPE_DISTANCE) return;
    go(distance < 0 ? current + 1 : current - 1);
  };

  return (
    <>
      <Reveal
        as="ul"
        stagger={0.08}
        className={`site-gallery site-gallery--${editorial ? "editorial" : "grid"}`}
        aria-label={label}
      >
        {images.map((photo, index) => (
          <RevealItem as="li" key={photo.src}>
            <figure>
              <a
                href={photo.src}
                className="site-gallery__link"
                onClick={(event) => open(event, index)}
              >
                <SiteImage
                  image={photo}
                  fill
                  sizes={
                    editorial && index === 0
                      ? "(min-width: 64rem) 60vw, 100vw"
                      : "(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
                  }
                />
                <span className="sr-only">Open full-size photo</span>
              </a>
            </figure>
          </RevealItem>
        ))}
      </Reveal>

      <dialog
        ref={dialogRef}
        className="site-lightbox"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClose={() => {
          setCurrent(null);
          openerRef.current?.focus();
        }}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
      >
        {image && current !== null ? (
          <div className="site-lightbox__inner">
            <header className="site-lightbox__bar">
              <h2 id={titleId} className="site-lightbox__title">
                {label}
              </h2>
              <p className="site-lightbox__count" aria-hidden="true">
                <span>{pad(current + 1)}</span> / {pad(total)}
              </p>
              <button
                type="button"
                className="site-lightbox__close"
                onClick={close}
                aria-label="Close photo viewer"
              >
                <Icon name="close" />
                Close
              </button>
            </header>

            <div
              className="site-lightbox__stage"
              onPointerDown={(event) => {
                swipeStart.current = event.clientX;
              }}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                swipeStart.current = null;
              }}
            >
              <AnimatePresence initial={false} custom={direction}>
                <m.figure
                  key={current}
                  className="site-lightbox__figure"
                  custom={direction}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <SiteImage
                    image={image}
                    sizes="(min-width: 64rem) 80vw, 100vw"
                    className="site-lightbox__image"
                  />
                  {image.alt ? <figcaption>{image.alt}</figcaption> : null}
                </m.figure>
              </AnimatePresence>
              <button
                ref={previousRef}
                type="button"
                className="site-lightbox__nav site-lightbox__nav--previous"
                onClick={() => go(current - 1)}
                disabled={current === 0}
              >
                <Icon name="arrow-left" />
                <span className="sr-only">Previous photo</span>
              </button>
              <button
                ref={nextRef}
                type="button"
                className="site-lightbox__nav site-lightbox__nav--next"
                onClick={() => go(current + 1)}
                disabled={current === total - 1}
              >
                <Icon name="arrow" />
                <span className="sr-only">Next photo</span>
              </button>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {`Photo ${current + 1} of ${total}${image.alt ? `: ${image.alt}` : ""}`}
            </p>

            {total > 1 ? (
              <ul
                ref={thumbsRef}
                className="site-lightbox__thumbs"
                aria-label="All photos"
              >
                {images.map((photo, index) => (
                  <li key={photo.src}>
                    <button
                      type="button"
                      aria-current={index === current ? "true" : undefined}
                      onClick={() => go(index)}
                    >
                      <SiteImage image={photo} fill decorative sizes="6rem" />
                      <span className="sr-only">{`Show photo ${index + 1}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
