import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SocialLinksForm } from "@/presentation/admin/settings/social-links-form";
import { idleFormState } from "@/presentation/admin/ui/form-state";
import { ToastProvider } from "@/presentation/admin/ui/toast";

const links = [
  {
    platform: "instagram" as const,
    label: "Instagram",
    url: "https://instagram.com/rivana",
    isVisible: true,
  },
  {
    platform: "facebook" as const,
    label: "Facebook",
    url: "https://facebook.com/rivana",
    isVisible: false,
  },
];

function renderForm(initial = links) {
  const view = render(
    <ToastProvider>
      <SocialLinksForm
        action={async () => idleFormState}
        links={initial}
        version="2026-09-25T10:00:00.000Z"
      />
    </ToastProvider>,
  );
  const payload = () =>
    JSON.parse(
      (view.container.querySelector('input[name="links"]') as HTMLInputElement)
        .value,
    ) as { platform: string; isVisible: boolean }[];
  return { ...view, payload };
}

describe("SocialLinksForm", () => {
  it("serializes rows in display order", () => {
    const { payload } = renderForm();
    expect(payload()).toEqual(links);
  });

  it("moves a row, keeps focus on the control, and announces the move", () => {
    const { payload } = renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: "Move down: Instagram" }),
    );

    expect(payload().map((link) => link.platform)).toEqual([
      "facebook",
      "instagram",
    ]);
    expect(
      screen.getByText("Instagram moved to position 2 of 2."),
    ).toBeInTheDocument();
    // Instagram is now last, so its Move down is disabled; focus goes to
    // the row's first field instead of being lost.
    expect(document.activeElement?.id).toBe("social-1-platform");
  });

  it("adds a row with the next unused platform and focuses it", () => {
    const { payload } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Add social link" }));

    expect(payload()[2]).toMatchObject({ platform: "tiktok", isVisible: true });
    expect(document.activeElement?.id).toBe("social-2-platform");
    expect(screen.getByText("Link 3 added.")).toBeInTheDocument();
  });

  it("removes a row and announces that saving applies it", () => {
    const { payload } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Remove: Instagram" }));

    expect(payload().map((link) => link.platform)).toEqual(["facebook"]);
    expect(
      screen.getByText("Instagram removed. Save social links to apply."),
    ).toBeInTheDocument();
    expect(document.activeElement?.id).toBe("social-0-platform");
  });

  it("toggles visibility and follows the default label on platform change", () => {
    const { payload } = renderForm();
    const firstRow = screen.getAllByRole("listitem")[0]!;

    fireEvent.click(within(firstRow).getByLabelText("Show on website"));
    fireEvent.change(within(firstRow).getByLabelText("Platform"), {
      target: { value: "youtube" },
    });

    expect(payload()[0]).toMatchObject({
      platform: "youtube",
      isVisible: false,
    });
    expect(within(firstRow).getByLabelText(/^Label/)).toHaveValue("YouTube");
  });

  it("shows an empty state and disables adding past the limit", () => {
    renderForm([]);
    expect(screen.getByText(/No social links yet/)).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Add social link" });
    for (let index = 0; index < 8; index += 1) fireEvent.click(add);
    expect(add).toBeDisabled();
  });
});
