import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// jsdom lacks both; the viewer scrolls the current thumbnail into view and
// the menu checks the reduced-motion preference before animating closed.
Element.prototype.scrollIntoView ??= () => {};
window.matchMedia ??= (query: string) =>
  ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;

import { Gallery } from "@/presentation/site/gallery";
import { MobileMenu } from "@/presentation/site/mobile-menu";
import { CountUp } from "@/presentation/site/motion/count-up";
import { Reveal, RevealItem } from "@/presentation/site/motion/reveal";
import { SplitTitle } from "@/presentation/site/motion/split-title";

const photo = (name: string) => ({
  src: `/media/${name}.jpg`,
  alt: `${name} photo`,
  width: 1200,
  height: 800,
  position: "50% 50%",
});
const photos = [photo("bedroom"), photo("desk"), photo("bathroom")];

describe("SplitTitle", () => {
  it("keeps the plain title as the accessible name", () => {
    render(
      <h1>
        <SplitTitle text="Rivana Residence" />
      </h1>,
    );
    expect(
      screen.getByRole("heading", { name: "Rivana Residence" }),
    ).toBeInTheDocument();
    const letters = document.querySelectorAll(".site-split-title__char");
    expect(letters).toHaveLength(15);
    expect(letters[0]?.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("CountUp", () => {
  it("renders the final value for servers, no-JS, and screen readers", () => {
    const { container } = render(<CountUp value="1,500+" />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("1,500+");
    expect(container.querySelector(".site-count")).toHaveTextContent("1,500+");
  });

  it("leaves values with more than one number as written", () => {
    const { container } = render(<CountUp value="24/7" />);
    expect(container).toHaveTextContent("24/7");
    expect(container.querySelector(".site-count")).toBeNull();
  });
});

describe("Reveal", () => {
  it("never hides content when IntersectionObserver is unavailable", () => {
    render(
      <Reveal stagger={0.1}>
        <RevealItem>First</RevealItem>
      </Reveal>,
    );
    const item = screen.getByText("First");
    expect(item.closest("[data-reveal]")).toHaveAttribute(
      "data-reveal-state",
      "shown",
    );
    expect(item).not.toHaveStyle({ opacity: "0" });
  });
});

describe("Gallery", () => {
  it("keeps plain links to each full-size photo", () => {
    render(<Gallery images={photos} label="Photos of the studio" />);
    const list = screen.getByRole("list", { name: "Photos of the studio" });
    const links = list.querySelectorAll("a");
    expect([...links].map((link) => link.getAttribute("href"))).toEqual(
      photos.map((item) => item.src),
    );
  });

  it("opens a labelled viewer with bounded, announced navigation", () => {
    render(<Gallery images={photos} label="Photos of the studio" />);
    const opener = screen.getAllByRole("link")[0]!;
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Photos of the studio" });
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Photo 1 of 3: bedroom photo",
    );
    expect(
      screen.getByRole("button", { name: "Previous photo" }),
    ).toBeDisabled();

    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent("Photo 2 of 3");
    fireEvent.keyDown(dialog, { key: "End" });
    expect(screen.getByRole("status")).toHaveTextContent("Photo 3 of 3");
    expect(screen.getByRole("button", { name: "Next photo" })).toBeDisabled();
    // No wrap-around.
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent("Photo 3 of 3");

    fireEvent.click(screen.getByRole("button", { name: "Show photo 1" }));
    expect(screen.getByRole("status")).toHaveTextContent("Photo 1 of 3");

    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(opener).toHaveFocus();
  });

  it("lets modified clicks open the file as a normal link", () => {
    render(<Gallery images={photos} label="Photos" />);
    const opener = screen.getAllByRole("link")[0]!;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    opener.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });
});

describe("MobileMenu", () => {
  it("makes the rest of the page inert while open and restores it", () => {
    render(
      <div>
        <main>Page</main>
        <header>
          <MobileMenu>
            <button type="button">Rooms</button>
          </MobileMenu>
        </header>
      </div>,
    );
    const details = document.querySelector("details")!;
    const main = document.querySelector("main")!;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(main.inert).toBe(true);
    expect(screen.getByText("Close")).toBeInTheDocument();

    fireEvent.keyDown(details, { key: "Escape" });
    act(() => {
      details.dispatchEvent(new Event("toggle"));
    });
    expect(details.open).toBe(false);
    expect(main.inert).toBe(false);
    expect(document.querySelector("summary")).toHaveFocus();
  });
});
