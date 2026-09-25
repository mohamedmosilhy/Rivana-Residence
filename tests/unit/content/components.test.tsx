import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CatalogForm } from "@/presentation/admin/content/catalog-form";
import { SectionEditor } from "@/presentation/admin/pages/section-editor";
import { PromotionForm } from "@/presentation/admin/promotions/promotion-form";
import { ConfirmAction } from "@/presentation/admin/ui/confirm-action";
import {
  idleFormState,
  type FormState,
} from "@/presentation/admin/ui/form-state";
import { RepeatableFields } from "@/presentation/admin/ui/repeatable-fields";
import { ToastProvider } from "@/presentation/admin/ui/toast";
import { RichTextView } from "@/presentation/design/rich-text-view";

const idle = async () => idleFormState;
const withToasts = (ui: ReactNode) =>
  render(<ToastProvider>{ui}</ToastProvider>);

describe("RepeatableFields", () => {
  function renderList(onChange = vi.fn()) {
    const view = render(
      <RepeatableFields
        idPrefix="items"
        legend="Items"
        itemNoun="figure"
        fields={[
          { key: "value", label: "Figure", maxLength: 30 },
          { key: "label", label: "Label", maxLength: 80 },
        ]}
        initialRows={[
          { value: "12", label: "Suites" },
          { value: "3", label: "Pools" },
        ]}
        min={1}
        max={3}
        name="items"
        onChange={onChange}
      />,
    );
    const payload = () =>
      JSON.parse(
        (
          view.container.querySelector(
            'input[name="items"]',
          ) as HTMLInputElement
        ).value,
      );
    return { ...view, payload, onChange };
  }

  it("moves rows, keeps focus, announces, and reports changes", () => {
    const { payload, onChange } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Move down: 12" }));
    expect(payload().map((row: { label: string }) => row.label)).toEqual([
      "Pools",
      "Suites",
    ]);
    expect(document.activeElement?.id).toBe("items-1-value");
    expect(
      screen.getByText("12 moved to position 2 of 2."),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([
      { value: "3", label: "Pools" },
      { value: "12", label: "Suites" },
    ]);
  });

  it("enforces the minimum and maximum", () => {
    renderList();
    const add = screen.getByRole("button", { name: "Add figure" });
    fireEvent.click(add);
    expect(document.activeElement?.id).toBe("items-2-value");
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove: 12" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove: 3" }));
    expect(screen.getByRole("button", { name: /^Remove/ })).toBeDisabled();
  });

  it("labels fields per row for screen readers", () => {
    renderList();
    expect(screen.getByLabelText("Figure 2")).toHaveValue("3");
    fireEvent.change(screen.getByLabelText("Label 2"), {
      target: { value: "Gardens" },
    });
    expect(screen.getByLabelText("Label 2")).toHaveValue("Gardens");
  });
});

describe("CatalogForm", () => {
  const values = {
    name: "",
    slug: "",
    shortDescription: "",
    description: "",
    featured: false,
    seoTitle: "",
    seoDescription: "",
    features: [],
  };

  it("suggests the web address from the name until it is edited", () => {
    withToasts(
      <CatalogForm
        variant="room"
        action={idle}
        values={values}
        isNew
        submitLabel="Create draft"
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Nile Suite" },
    });
    expect(screen.getByLabelText("Web address")).toHaveValue("nile-suite");

    fireEvent.change(screen.getByLabelText("Web address"), {
      target: { value: "river" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Nile Suite 2" },
    });
    expect(screen.getByLabelText("Web address")).toHaveValue("river");
  });

  it("never follows the name when editing an existing record", () => {
    withToasts(
      <CatalogForm
        variant="facility"
        action={idle}
        values={{ ...values, name: "Pool", slug: "pool" }}
        isNew={false}
        submitLabel="Save changes"
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Pool Terrace" },
    });
    expect(screen.getByLabelText("Web address")).toHaveValue("pool");
    expect(screen.queryByText("Room facts")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Opening hours/)).toBeInTheDocument();
  });

  it("has no price or availability fields", () => {
    const { container } = withToasts(
      <CatalogForm
        variant="room"
        action={idle}
        values={values}
        isNew
        submitLabel="Create draft"
      />,
    );
    const names = [...container.querySelectorAll("[name]")].map((element) =>
      element.getAttribute("name"),
    );
    expect(
      names.filter((name) => /price|rate|avail|reserv|book/i.test(name ?? "")),
    ).toEqual([]);
  });
});

describe("SectionEditor", () => {
  it("submits a locked section as visible and explains why", () => {
    const { container } = withToasts(
      <SectionEditor
        sectionId="s1"
        type="HERO"
        heading={null}
        eyebrow={null}
        isVisible
        locked
        payload={{
          schemaVersion: 1,
          title: "Rivana",
          summary: "By the river.",
        }}
        action={idle}
      />,
    );
    const checkbox = screen.getByLabelText("Show this section on the page");
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAccessibleDescription(
      "Required on this page, so it is always shown.",
    );
    expect(
      container.querySelector('input[type="hidden"][name="isVisible"]'),
    ).toHaveValue("on");
  });

  it("edits the payload through typed fields, not raw JSON", () => {
    const { container } = withToasts(
      <SectionEditor
        sectionId="s2"
        type="RICH_TEXT"
        heading="Welcome"
        eyebrow={null}
        isVisible={false}
        locked={false}
        payload={{
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
            ],
          },
        }}
        action={idle}
      />,
    );
    const text = screen.getByLabelText("Text");
    expect(text).toHaveValue("Hello");
    fireEvent.change(text, { target: { value: "Hello\n\n- One" } });
    const payload = container.querySelector(
      'input[name="payload"]',
    ) as HTMLInputElement;
    expect(JSON.parse(payload.value)).toEqual({
      documentText: "Hello\n\n- One",
    });
    expect(
      screen.getByLabelText("Show this section on the page"),
    ).not.toBeChecked();
  });
});

describe("PromotionForm", () => {
  it("updates the preview as staff type and labels the time zone", () => {
    withToasts(
      <PromotionForm
        action={idle}
        timeZone="Africa/Cairo"
        submitLabel="Create draft"
        values={{
          internalName: "",
          headline: "",
          body: "",
          code: "",
          terms: "",
          startsAt: "",
          endsAt: "",
          priority: "0",
          showAsPopup: true,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Headline"), {
      target: { value: "Autumn by the river" },
    });
    fireEvent.change(screen.getByLabelText("Code"), {
      target: { value: "AUTUMN26" },
    });
    const preview = screen.getByRole("complementary", { name: "Preview" });
    expect(
      within(preview).getByRole("heading", { name: "Autumn by the river" }),
    ).toBeInTheDocument();
    expect(within(preview).getByText("AUTUMN26")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Starts \(Africa\/Cairo time\)/),
    ).toHaveAttribute("type", "datetime-local");
  });
});

describe("ConfirmAction", () => {
  it("keeps the dialog open with the reason when the action fails", async () => {
    const action = vi.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "Room is not ready to publish.",
        fieldErrors: {
          media: ["A published room requires exactly one ready hero image."],
        },
      }),
    );
    withToasts(
      <ConfirmAction
        triggerLabel="Publish"
        title="Publish Nile Suite?"
        confirmLabel="Publish now"
        pendingLabel="Publishing…"
        action={action}
      >
        <p>It becomes public.</p>
      </ConfirmAction>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    });
    const dialog = screen.getByRole("alertdialog", {
      name: "Publish Nile Suite?",
    });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "A published room requires exactly one ready hero image.",
    );
  });

  it("closes and announces on success", async () => {
    withToasts(
      <ConfirmAction
        triggerLabel="Archive"
        title="Archive Nile Suite?"
        confirmLabel="Archive now"
        pendingLabel="Archiving…"
        tone="danger"
        action={async () => ({ status: "success", message: "Archived." })}
      >
        <p>Hidden.</p>
      </ConfirmAction>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive now" }));
    });
    expect(
      screen.getByRole("alertdialog", { hidden: true }),
    ).not.toHaveAttribute("open");
    expect(screen.getByText("Archived.")).toBeInTheDocument();
  });
});

describe("RichTextView", () => {
  it("renders the node map semantically and text literally", () => {
    const { container } = render(
      <RichTextView
        document={{
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Dining" }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "<img src=x onerror=alert(1)>" },
                { type: "hardBreak" },
                { type: "text", text: "line two" },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Tea" }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Dining" }),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("br")).not.toBeNull();
    expect(screen.getByRole("listitem")).toHaveTextContent("Tea");
  });

  it("renders nothing for an invalid document", () => {
    const { container } = render(
      <RichTextView
        document={{
          type: "doc",
          content: [{ type: "html", value: "<b>x</b>" }],
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
