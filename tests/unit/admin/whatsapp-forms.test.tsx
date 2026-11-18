import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildWhatsAppCatalog } from "@/presentation/admin/whatsapp/catalog";
import { WhatsAppSetupForm } from "@/presentation/admin/whatsapp/setup-form";
import { WhatsAppSetupStatus } from "@/presentation/admin/whatsapp/status";
import { WhatsAppTemplateForm } from "@/presentation/admin/whatsapp/template-form";
import { WhatsAppTestMessageForm } from "@/presentation/admin/whatsapp/test-message-form";
import {
  idleFormState,
  type FormState,
} from "@/presentation/admin/ui/form-state";
import { ToastProvider } from "@/presentation/admin/ui/toast";

// M8-T4b: the Admin WhatsApp screen's forms (T-WA-4…7, UI part).

const catalog = buildWhatsAppCatalog();

function renderTemplateForm(
  action: (state: FormState, data: FormData) => Promise<FormState> = async () =>
    idleFormState,
) {
  const view = render(
    <ToastProvider>
      <WhatsAppTemplateForm
        action={action}
        catalog={catalog}
        template={null}
        cancelHref="/admin/settings/whatsapp"
      />
    </ToastProvider>,
  );
  const variables = () =>
    Array.from(
      view.container.querySelectorAll<HTMLInputElement>(
        'input[name="variables"]',
      ),
    ).map((input) => input.value);
  return { ...view, variables };
}

const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("WhatsAppTemplateForm", () => {
  it("offers only the variables the purpose can fill", () => {
    renderTemplateForm();
    choose("Message purpose", "MARKETING");
    const options = Array.from(
      (screen.getByLabelText("Add a variable") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(options).toEqual(["", "guestFirstName", "branchName"]);
  });

  it("adds, orders, and removes variables, announcing each change", () => {
    const { variables } = renderTemplateForm();
    choose("Add a variable", "reference");
    choose("Add a variable", "guestFirstName");
    expect(variables()).toEqual(["reference", "guestFirstName"]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move down: Reference" }),
    );
    expect(variables()).toEqual(["guestFirstName", "reference"]);
    expect(
      screen.getByText("Reference moved to position 2 of 2."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove: Guest first name" }),
    );
    expect(variables()).toEqual(["reference"]);
  });

  it("does not offer a variable twice", () => {
    renderTemplateForm();
    choose("Add a variable", "reference");
    const options = Array.from(
      (screen.getByLabelText("Add a variable") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(options).not.toContain("reference");
  });

  it("follows the rules for a verification code template", () => {
    const { variables } = renderTemplateForm();
    choose("Message purpose", "VERIFICATION_CODE");
    expect(variables()).toEqual(["code"]);
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "AUTHENTICATION",
    );
    choose("Message purpose", "BOOKING_CONFIRMED");
    expect(variables()).toEqual([]);
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "UTILITY",
    );
  });

  it("submits the ordered variables and shows server errors with a linked summary", async () => {
    let received: FormData | null = null;
    renderTemplateForm(async (_state, data) => {
      received = data;
      return {
        status: "error",
        message: "The template needs attention.",
        fieldErrors: {
          providerName: ["Enter the template name approved in Meta."],
        },
        values: { providerName: "", previewText: "Hello {{1}}" },
      };
    });
    choose("Add a variable", "reference");
    fireEvent.submit(
      screen.getByRole("button", { name: "Add template" }).closest("form")!,
    );

    const summary = await screen.findByRole("alert");
    await waitFor(() =>
      expect(summary).toHaveTextContent(
        "Template name in Meta: Enter the template name approved in Meta.",
      ),
    );
    expect(received).not.toBeNull();
    expect((received as unknown as FormData).getAll("variables")).toEqual([
      "reference",
    ]);
    expect(
      (screen.getByLabelText("Preview text") as HTMLTextAreaElement).value,
    ).toBe("Hello {{1}}");
  });
});

describe("WhatsAppTemplateForm after a result", () => {
  const failure: FormState = {
    status: "error",
    message: "The template needs attention.",
    fieldErrors: { active: ["A template is already active for this purpose."] },
    values: { providerName: "stay_v1", previewText: "Hello {{1}}" },
  };

  it("posts what you picked on the next submit, not the first values", async () => {
    const posts: FormData[] = [];
    renderTemplateForm(async (_state, data) => {
      posts.push(data);
      return posts.length === 1 ? failure : idleFormState;
    });
    choose("Message purpose", "RESERVATION_MODIFIED");
    choose("Category", "MARKETING");
    fireEvent.click(screen.getByLabelText("Active"));
    const submit = () =>
      fireEvent.submit(
        screen.getByRole("button", { name: "Add template" }).closest("form")!,
      );

    submit();
    await screen.findByText("The template needs attention.");
    // The screen still shows the choices, and the inline error is announced.
    expect(
      (screen.getByLabelText("Message purpose") as HTMLSelectElement).value,
    ).toBe("RESERVATION_MODIFIED");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe(
      "MARKETING",
    );
    expect((screen.getByLabelText("Active") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByLabelText("Active")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    submit();
    await waitFor(() => expect(posts).toHaveLength(2));
    const second = posts[1]!;
    expect(second.get("purpose")).toBe("RESERVATION_MODIFIED");
    expect(second.get("category")).toBe("MARKETING");
    expect(second.get("active")).toBeNull();
  });

  it("clears every field after a successful add", async () => {
    renderTemplateForm(async () => ({ status: "success", message: "Added." }));
    choose("Message purpose", "RESERVATION_MODIFIED");
    choose("Add a variable", "reference");
    fireEvent.submit(
      screen.getByRole("button", { name: "Add template" }).closest("form")!,
    );
    await screen.findByText("Added.");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Message purpose") as HTMLSelectElement).value,
      ).toBe("BOOKING_CONFIRMED"),
    );
    expect(document.querySelectorAll('input[name="variables"]')).toHaveLength(
      0,
    );
  });
});

describe("WhatsAppTestMessageForm after a failed send", () => {
  it("keeps the chosen template and the number you typed", async () => {
    render(
      <ToastProvider>
        <WhatsAppTestMessageForm
          action={async () => ({
            status: "error",
            message:
              "Too many test messages. Wait a few minutes, then try again.",
            values: { templateId: "t2" },
          })}
          templates={[
            { id: "t1", label: "One" },
            { id: "t2", label: "Two" },
          ]}
        />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText("Send to"), {
      target: { value: "+201001234567" },
    });
    fireEvent.change(screen.getByLabelText(/Template/), {
      target: { value: "t2" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Send test message" })
        .closest("form")!,
    );
    await screen.findByText(/Too many test messages/);
    expect((screen.getByLabelText(/Template/) as HTMLSelectElement).value).toBe(
      "t2",
    );
    expect((screen.getByLabelText("Send to") as HTMLInputElement).value).toBe(
      "+201001234567",
    );
  });
});

describe("WhatsAppSetupForm", () => {
  it("shows the saved values, with no access token field", () => {
    render(
      <ToastProvider>
        <WhatsAppSetupForm
          action={async () => idleFormState}
          values={{
            businessPhoneNumber: "+201001234567",
            providerPhoneNumberId: "109876",
          }}
        />
      </ToastProvider>,
    );
    expect(
      (screen.getByLabelText(/Business WhatsApp number/) as HTMLInputElement)
        .value,
    ).toBe("+201001234567");
    expect(screen.queryByLabelText(/token/i)).toBeNull();
  });
});

describe("WhatsAppTestMessageForm", () => {
  it("lists the active templates and defaults to the test template", () => {
    render(
      <ToastProvider>
        <WhatsAppTestMessageForm
          action={async () => idleFormState}
          templates={[{ id: "t1", label: "Booking confirmed: booking_v1" }]}
        />
      </ToastProvider>,
    );
    const select = screen.getByLabelText(/Template/) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      "Default test template",
      "Booking confirmed: booking_v1",
    ]);
  });
});

describe("WhatsAppSetupStatus", () => {
  const base = {
    configured: false,
    accessTokenConfigured: false,
    numberSet: false,
    phoneNumberIdSet: false,
    setupGaps: [
      { purpose: "VERIFICATION_CODE", language: "en", blocking: true },
      { purpose: "MANAGE_LINK", language: "en", blocking: false },
    ],
    lastTest: null,
  };

  it("says what is missing and never renders a token", () => {
    const { container } = render(<WhatsAppSetupStatus {...base} />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(
      screen.getByText("Not configured on the server"),
    ).toBeInTheDocument();
    expect(screen.getByText("Verification code (English)")).toBeInTheDocument();
    expect(screen.getByText("Manage link (English)")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/EAAG|Bearer/);
  });

  it("reports a configured setup and the last test", () => {
    render(
      <WhatsAppSetupStatus
        {...base}
        configured
        accessTokenConfigured
        numberSet
        phoneNumberIdSet
        setupGaps={[]}
        lastTest={{
          at: "18 Nov 2026, 10:00 EET",
          ok: false,
          error: "Rejected",
        }}
      />,
    );
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("Configured on the server")).toBeInTheDocument();
    expect(
      screen.getByText("Failed on 18 Nov 2026, 10:00 EET: Rejected"),
    ).toBeInTheDocument();
  });
});
