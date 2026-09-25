import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionPopup } from "@/presentation/features/promotions/promotion-popup";
import { BookNowButton } from "@/presentation/site/book-now-button";
import { ContactForm } from "@/presentation/site/contact-form";
import { idleFormState } from "@/presentation/admin/ui/form-state";

const promotion = {
  id: "p1",
  version: 2,
  headline: "Autumn by the pool",
  body: "Stay three nights.",
  code: "AUTUMN26",
  terms: null,
};

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
    expect(screen.getByRole("status")).toHaveClass("book-now__status");
  });
});

describe("PromotionPopup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("opens after the page has loaded, not immediately", () => {
    render(<PromotionPopup promotion={promotion} />);
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).not.toHaveAttribute("open");
    act(() => vi.advanceTimersByTime(1500));
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleName("Autumn by the pool");
  });

  it("remembers dismissal for this version only", () => {
    const { unmount } = render(<PromotionPopup promotion={promotion} />);
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const stored = JSON.parse(
      localStorage.getItem("rivana.promotion.dismissed")!,
    );
    expect(stored).toMatchObject({ promotionId: "p1", version: 2 });
    expect(stored.dismissedUntil).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    );
    unmount();

    const again = render(<PromotionPopup promotion={promotion} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
    again.unmount();

    render(<PromotionPopup promotion={{ ...promotion, version: 3 }} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
      "open",
    );
  });

  it("announces when copying fails and keeps the code on screen", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    render(<PromotionPopup promotion={promotion} />);
    act(() => vi.advanceTimersByTime(1500));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Select the code above and copy it",
    );
    expect(screen.getByText("AUTUMN26")).toBeInTheDocument();
  });
});

describe("ContactForm", () => {
  it("labels every field and hides the bot trap from people", () => {
    const { container } = render(
      <ContactForm action={async () => idleFormState} formToken="token" />,
    );
    for (const label of ["Your name", "Email", /Phone/, /Subject/, "Message"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const trap = container.querySelector(".site-form__trap");
    expect(trap).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('input[name="website"]')).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(container.querySelector('input[name="formToken"]')).toHaveValue(
      "token",
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
