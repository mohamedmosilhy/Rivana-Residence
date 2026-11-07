import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookNowButton } from "@/presentation/site/book-now-button";
import { BranchSwitcher } from "@/presentation/site/branch-switcher";
import { AccommodationBadge, roomFactList } from "@/presentation/site/cards";
import { LocationMap } from "@/presentation/site/location-map";
import { isCurrentLink, siteLinks } from "@/presentation/site/site-links";
import { ContactForm } from "@/presentation/site/contact-form";
import { idleFormState } from "@/presentation/admin/ui/form-state";

const pathname = vi.hoisted(() => ({ value: "/new-cairo/stay/deluxe-double" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("BookNowButton", () => {
  it("is an inert, focusable button that explains how to book", () => {
    render(<BookNowButton message="Online booking is not available yet." />);
    const button = screen.getByRole("button", { name: "Book now" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(
      "Online booking is not available yet.",
    );
    expect(button.closest("a, form")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("status")).not.toHaveClass("visually-hidden");
  });
});

// AC-3: the switcher keeps the page type where the other branch has it, and
// is a native disclosure with plain links (no JavaScript needed).
describe("BranchSwitcher", () => {
  const branches = [
    {
      slug: "new-cairo",
      name: "New Cairo",
      hasListings: true,
      hasFacilities: true,
    },
    {
      slug: "demo-giza",
      name: "Giza",
      hasListings: true,
      hasFacilities: false,
    },
  ];

  it("links each branch to the matching page type", () => {
    pathname.value = "/new-cairo/stay/deluxe-double";
    const { container } = render(
      <BranchSwitcher current="new-cairo" branches={branches} />,
    );
    expect(container.querySelector("details summary")).toHaveTextContent(
      "Current branch: New Cairo",
    );
    expect(screen.getByRole("link", { name: "Giza" })).toHaveAttribute(
      "href",
      "/demo-giza/stay",
    );
    expect(screen.getByRole("link", { name: "New Cairo" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("falls back to the branch home when the page type is missing there", () => {
    pathname.value = "/new-cairo/facilities/swimming-pool";
    render(<BranchSwitcher current="new-cairo" branches={branches} />);
    expect(screen.getByRole("link", { name: "Giza" })).toHaveAttribute(
      "href",
      "/demo-giza",
    );
  });
});

describe("site links (spec 0002)", () => {
  it("keeps every link in the branch and labels the stay link", () => {
    expect(siteLinks("demo-giza", "Apartments")).toEqual([
      { href: "/demo-giza", label: "Home" },
      { href: "/demo-giza/stay", label: "Apartments" },
      { href: "/demo-giza/facilities", label: "Facilities" },
      { href: "/demo-giza/about", label: "About" },
      { href: "/demo-giza/contact", label: "Contact" },
    ]);
  });

  // AC-5: no listings, no stay link.
  it("hides the stay link when the branch has no listings", () => {
    expect(siteLinks("new-cairo", null).map((link) => link.label)).toEqual([
      "Home",
      "Facilities",
      "About",
      "Contact",
    ]);
  });

  it("hides the Facilities link when the branch has none published", () => {
    expect(
      siteLinks("demo-giza", "Rooms", false).map((link) => link.label),
    ).toEqual(["Home", "Rooms", "About", "Contact"]);
  });

  it("marks Home current only at the branch root", () => {
    expect(isCurrentLink("/new-cairo", "/new-cairo", "/new-cairo")).toBe(true);
    expect(isCurrentLink("/new-cairo", "/new-cairo/stay", "/new-cairo")).toBe(
      false,
    );
    expect(
      isCurrentLink("/new-cairo/stay", "/new-cairo/stay/x", "/new-cairo"),
    ).toBe(true);
  });
});

// AC-5: the badge and apartment facts.
describe("accommodation badge and facts", () => {
  it("labels rooms and apartments", () => {
    render(<AccommodationBadge type="APARTMENT" />);
    expect(screen.getByText("Apartment")).toHaveAttribute(
      "data-accommodation",
      "APARTMENT",
    );
  });

  it("adds bedrooms and bathrooms for apartments only", () => {
    const facts = {
      sizeSqm: 80,
      maxAdults: 4,
      maxChildren: 0,
      bedSummary: null,
      viewSummary: null,
      bedroomCount: 2,
      bathroomCount: 1,
    };
    expect(roomFactList(facts, "APARTMENT").map((fact) => fact.value)).toEqual([
      "80 m²",
      "4 adults",
      "2 bedrooms",
      "1 bathroom",
    ]);
    expect(roomFactList(facts, "ROOM").map((fact) => fact.label)).toEqual([
      "Size",
      "Sleeps",
    ]);
  });
});

// AC-6: the map is lazy and sandboxed; without it the address and the
// directions link still work.
describe("LocationMap", () => {
  const place = {
    name: "Giza",
    addressLines: ["Demo Street 1", "Giza, Egypt"],
    latitude: 30.0444,
    longitude: 30.98,
    mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
  };

  it("embeds a titled, lazy, sandboxed map", () => {
    render(<LocationMap place={place} />);
    const frame = screen.getByTitle("Map showing Giza");
    expect(frame).toHaveAttribute("loading", "lazy");
    expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-popups",
    );
    expect(
      screen.getByRole("link", { name: /Open directions/ }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=30.0444,30.98",
    );
  });

  it("falls back to the address and directions link", () => {
    render(<LocationMap place={{ ...place, mapEmbedUrl: null }} />);
    expect(screen.queryByTitle("Map showing Giza")).not.toBeInTheDocument();
    expect(screen.getByText("Demo Street 1, Giza, Egypt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open directions/ })).toBeVisible();
  });
});

describe("ContactForm", () => {
  it("labels every field and hides the bot trap from people", () => {
    const { container } = render(
      <ContactForm
        action={async () => idleFormState}
        formToken="token"
        branchSlug="demo-giza"
      />,
    );
    for (const label of ["Your name", "Email", /Phone/, /Subject/, "Message"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const trap = container.querySelector("[data-form-trap]");
    expect(trap).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('input[name="website"]')).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(container.querySelector('input[name="formToken"]')).toHaveValue(
      "token",
    );
    // AC-14: the form says which branch's Contact page it is on.
    expect(container.querySelector('input[name="branch"]')).toHaveValue(
      "demo-giza",
    );
  });

  it("replaces the form with a focused confirmation on success", async () => {
    render(
      <ContactForm
        action={async () => ({
          status: "success",
          message: "Your message has been sent.",
        })}
        formToken="token"
        branchSlug="new-cairo"
      />,
    );
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Send message" }).closest("form")!,
      );
    });
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });
});
