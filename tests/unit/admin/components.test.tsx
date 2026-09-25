import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/presentation/admin/shell/account-menu";
import { MobileNav } from "@/presentation/admin/shell/mobile-nav";
import { ConfirmDialog } from "@/presentation/admin/ui/confirm-dialog";
import { ErrorSummary, SubmitButton } from "@/presentation/admin/ui/form";
import { ToastProvider, useToast } from "@/presentation/admin/ui/toast";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  navigation.pathname = "/admin";
});

describe("MobileNav", () => {
  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/rooms", label: "Rooms" },
  ] as const;

  it("opens a labelled sheet and returns focus to the trigger on close", () => {
    render(<MobileNav items={items} />);
    const trigger = screen.getByRole("button", { name: "Menu" });
    trigger.focus();

    fireEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Admin menu" });
    expect(sheet).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(sheet).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("closes after navigating to another destination", () => {
    const { rerender } = render(<MobileNav items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    navigation.pathname = "/admin/rooms";
    rerender(<MobileNav items={items} />);

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });
});

describe("AccountMenu", () => {
  function renderMenu() {
    return render(
      <AccountMenu
        name="Amira Admin"
        roleLabel="Administrator"
        signOutAction={async () => undefined}
      />,
    );
  }

  it("is a disclosure that Escape closes, returning focus", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Amira Admin/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("link", { name: "Account and security" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes when the pointer goes down outside it", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Amira Admin/ });
    fireEvent.click(trigger);

    fireEvent.pointerDown(document.body);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("ConfirmDialog", () => {
  it("names the target, starts on Cancel, and returns focus when cancelled", () => {
    const action = vi.fn(async () => undefined);
    render(
      <ConfirmDialog
        triggerLabel="Sign out other sessions (2)"
        title="Sign out 2 other sessions?"
        confirmLabel="Sign out other sessions"
        pendingLabel="Signing out…"
        action={action}
      >
        <p>Other browsers are signed out immediately.</p>
      </ConfirmDialog>,
    );
    const trigger = screen.getByRole("button", {
      name: "Sign out other sessions (2)",
    });

    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog", {
      name: "Sign out 2 other sessions?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Other browsers are signed out immediately.",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("runs the action on confirm, then closes", async () => {
    const action = vi.fn(async () => undefined);
    render(
      <ConfirmDialog
        triggerLabel="Remove"
        title="Remove this?"
        confirmLabel="Remove it"
        pendingLabel="Removing…"
        action={action}
      >
        <p>Gone for good.</p>
      </ConfirmDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("alertdialog", { hidden: true }),
    ).not.toHaveAttribute("open");
  });
});

describe("form feedback", () => {
  it("focuses the error summary and links each error to its field", () => {
    render(
      <>
        <ErrorSummary
          title="Some settings need attention."
          errors={[
            { fieldId: "email", message: "Email: Enter a valid email." },
          ]}
          submission={{}}
        />
        <input id="email" aria-label="Email" />
      </>,
    );

    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    fireEvent.click(
      screen.getByRole("link", { name: "Email: Enter a valid email." }),
    );
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("refocuses the summary after a repeated failure", () => {
    const { rerender } = render(
      <ErrorSummary title="Fix this." errors={[]} submission={{ n: 1 }} />,
    );
    screen.getByRole("alert").blur();

    rerender(
      <ErrorSummary title="Fix this." errors={[]} submission={{ n: 2 }} />,
    );

    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("disables the submit button while pending to block duplicates", () => {
    const { rerender } = render(
      <SubmitButton pendingLabel="Saving…" pending={false}>
        Save
      </SubmitButton>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    rerender(
      <SubmitButton pendingLabel="Saving…" pending>
        Save
      </SubmitButton>,
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("toasts", () => {
  afterEach(() => vi.useRealTimers());

  function Trigger() {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast("Site details saved.")}>
        Save
      </button>
    );
  }

  it("announces through one polite live region and auto-dismisses", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(region).toHaveTextContent("Site details saved.");

    act(() => vi.advanceTimersByTime(6000));
    expect(region).toBeEmptyDOMElement();
  });

  it("can be dismissed by hand", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
