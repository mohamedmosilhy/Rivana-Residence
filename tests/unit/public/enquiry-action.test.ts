// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const submitEnquiry = vi.fn();
vi.mock("@/composition/public", () => ({ submitEnquiry }));

const { submitEnquiryAction } = await import("@/app/(marketing)/actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const TYPED = {
  name: "Mona Adel",
  email: "mona@example.test",
  phone: "+20 100 000 0000",
  subject: "Long stay",
  message: "Private details about my stay.",
};

describe("contact enquiry action under failure", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the visitor's message and claims nothing when the database is down", async () => {
    const error = Object.assign(
      new Error(`Invalid invocation: ${TYPED.message} ${TYPED.email}`),
      { name: "PrismaClientKnownRequestError", code: "P1001" },
    );
    submitEnquiry.mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await submitEnquiryAction(
      { status: "idle" },
      form({ ...TYPED, formToken: "signed", website: "" }),
    );

    expect(state).toEqual({
      status: "error",
      message: expect.stringMatching(/could not send your message/),
      values: TYPED,
    });
    // The log names the failure without echoing personal data.
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("PrismaClientKnownRequestError");
    expect(logged).toContain("P1001");
    expect(logged).not.toContain(TYPED.email);
    expect(logged).not.toContain(TYPED.message);
  });

  it("never returns hidden anti-abuse fields to the page", async () => {
    submitEnquiry.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION", message: "Check the fields." },
    });
    const state = await submitEnquiryAction(
      { status: "idle" },
      form({ ...TYPED, formToken: "signed", website: "bot" }),
    );
    expect(state.status === "error" && state.values).toEqual(TYPED);
  });

  it("reports success only after the use case accepts the enquiry", async () => {
    submitEnquiry.mockResolvedValueOnce({ ok: true, value: "accepted" });
    const state = await submitEnquiryAction({ status: "idle" }, form(TYPED));
    expect(state.status).toBe("success");
  });
});
