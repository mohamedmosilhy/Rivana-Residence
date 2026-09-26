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

const NAV =
  "absolute top-1/2 z-1 grid size-13 -translate-y-1/2 cursor-pointer place-items-center border border-[rgb(255_255_255/0.35)] bg-[rgb(20_9_16/0.55)] text-surface [transition:background-color_var(--motion-fast)_ease,border-color_var(--motion-fast)_ease,color_var(--motion-fast)_ease,opacity_var(--motion-fast)_ease,transform_var(--motion-fast)_ease] hover:not-disabled:border-gold-400 hover:not-disabled:bg-gold-400 hover:not-disabled:text-plum-950 active:not-disabled:[transform:scale(0.94)] disabled:cursor-default disabled:opacity-30";

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
        className={
          editorial
            ? "m-0 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[clamp(0.5rem,1.2vw,1rem)] p-0 max-md:grid-cols-[repeat(2,minmax(0,1fr))] [&>li:first-child]:[grid-column:span_2] [&>li:first-child]:[grid-row:span_2] max-md:[&>li:first-child]:[grid-row:auto] [&>li:first-child_a]:aspect-auto max-md:[&>li:first-child_a]:aspect-[4/3] [&>li:nth-child(4):last-child]:col-[1/-1] [&>li:nth-child(4):last-child_a]:aspect-[21/8] max-md:[&>li:nth-child(4):last-child_a]:aspect-[4/3]"
            : "m-0 grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-[clamp(0.5rem,1.2vw,1rem)] p-0"
        }
        aria-label={label}
      >
        {images.map((photo, index) => (
          <RevealItem as="li" key={photo.src}>
            <figure className="m-0 h-full">
              <a
                href={photo.src}
                data-gallery-link=""
                className="group/photo relative block aspect-[4/3] h-full overflow-hidden bg-plum-100 focus-visible:outline-offset-[-3px]"
                onClick={(event) => open(event, index)}
              >
                <SiteImage
                  image={photo}
                  fill
                  className="[transition:transform_var(--motion-image)_var(--ease-out-soft)] can-hover:group-hover/photo:[transform:scale(1.03)]"
                  sizes={
                    editorial && index === 0
                      ? "(min-width: 64rem) 60vw, 100vw"
                      : "(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
                  }
                />
                <span className="visually-hidden">Open full-size photo</span>
              </a>
            </figure>
          </RevealItem>
        ))}
      </Reveal>

      <dialog
        ref={dialogRef}
        data-lightbox=""
        className="m-0 size-full max-h-none max-w-none border-0 bg-plum-950 p-0 text-surface backdrop:bg-[rgb(20_9_16/0.6)] open:animate-[site-fade_360ms_ease-out_both] [&_:focus-visible]:[outline:2px_solid_var(--color-gold-400)] [&_:focus-visible]:[outline-offset:3px]"
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
          <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-(--gutter) pt-4 pb-5">
            <header className="flex items-center gap-4">
              <h2
                id={titleId}
                className="m-0 max-w-none min-w-0 flex-1 overflow-hidden font-display text-heading-md leading-[1.3] font-normal tracking-[-0.005em] text-ellipsis text-balance whitespace-nowrap text-surface"
              >
                {label}
              </h2>
              <p
                className="m-0 text-[0.8125rem] tracking-[0.2em] text-inverse-strong tabular-nums"
                aria-hidden="true"
              >
                <span className="text-gold-400">{pad(current + 1)}</span> /{" "}
                {pad(total)}
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[rgb(255_255_255/0.35)] bg-transparent px-4 py-2 text-[0.75rem] tracking-[0.18em] text-inherit uppercase [transition:border-color_var(--motion-fast)_ease] hover:border-gold-400"
                onClick={close}
                aria-label="Close photo viewer"
              >
                <Icon name="close" />
                Close
              </button>
            </header>

            <div
              data-lightbox-stage=""
              className="relative grid min-h-0 min-w-0 touch-pan-y place-items-stretch select-none"
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
                  className="m-0 grid min-h-0 min-w-0 [grid-area:1/1] grid-rows-[minmax(0,1fr)_auto] justify-items-center gap-3 md:px-[calc(3.25rem+1rem)]"
                  custom={direction}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <SiteImage
                    image={image}
                    sizes="(min-width: 64rem) 80vw, 100vw"
                    className="block size-full min-h-0 [-webkit-user-drag:none]"
                    fit="contain"
                  />
                  {image.alt ? (
                    <figcaption className="max-w-[60ch] text-center text-[0.875rem] text-inverse-strong [overflow-wrap:anywhere]">
                      {image.alt}
                    </figcaption>
                  ) : null}
                </m.figure>
              </AnimatePresence>
              <button
                ref={previousRef}
                type="button"
                className={`${NAV} left-0`}
                onClick={() => go(current - 1)}
                disabled={current === 0}
              >
                <Icon name="arrow-left" />
                <span className="visually-hidden">Previous photo</span>
              </button>
              <button
                ref={nextRef}
                type="button"
                className={`${NAV} right-0`}
                onClick={() => go(current + 1)}
                disabled={current === total - 1}
              >
                <Icon name="arrow" />
                <span className="visually-hidden">Next photo</span>
              </button>
            </div>

            <p className="visually-hidden" role="status" aria-live="polite">
              {`Photo ${current + 1} of ${total}${image.alt ? `: ${image.alt}` : ""}`}
            </p>

            {total > 1 ? (
              <ul
                ref={thumbsRef}
                data-lightbox-thumbs=""
                className="m-0 flex justify-center-safe gap-2 overflow-x-auto p-1 [scrollbar-width:none] short:hidden"
                aria-label="All photos"
              >
                {images.map((photo, index) => (
                  <li key={photo.src}>
                    <button
                      type="button"
                      className="relative block aspect-[4/3] w-18 flex-none cursor-pointer border-0 bg-plum-800 p-0 opacity-45 [transition:opacity_var(--motion-surface)_ease] after:absolute after:inset-0 after:border-2 after:border-transparent after:[transition:border-color_var(--motion-surface)_ease] after:content-[''] hover:opacity-80 aria-[current=true]:opacity-100 aria-[current=true]:after:border-gold-400"
                      aria-current={index === current ? "true" : undefined}
                      onClick={() => go(index)}
                    >
                      <SiteImage image={photo} fill decorative sizes="6rem" />
                      <span className="visually-hidden">{`Show photo ${index + 1}`}</span>
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
