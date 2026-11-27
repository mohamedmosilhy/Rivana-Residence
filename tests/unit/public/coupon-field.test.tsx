import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { CouponField } from "@/presentation/features/booking/coupon-field";

const props = {
  value: "",
  applied: null,
  checking: false,
  error: null,
  inputRef: null,
  onChange: vi.fn(),
  onApply: vi.fn(),
  onRemove: vi.fn(),
};

it("is one labelled field that applies on submit without leaving the page", () => {
  render(<CouponField {...props} />);
  const input = screen.getByLabelText("Coupon code (optional)");
  fireEvent.change(input, { target: { value: "save10" } });
  expect(props.onChange).toHaveBeenCalledWith("save10");
  expect(fireEvent.submit(input.closest("form")!)).toBe(false);
  expect(props.onApply).toHaveBeenCalledTimes(1);
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("locks the field while the code is checked", () => {
  render(<CouponField {...props} value="save10" checking />);
  expect(screen.getByLabelText("Coupon code (optional)")).toHaveAttribute(
    "readonly",
  );
  expect(screen.getByRole("button", { name: "Checking…" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("announces the applied code in a region that was already there, with Remove", () => {
  const view = render(<CouponField {...props} />);
  const region = screen.getByRole("status");
  expect(region).toBeEmptyDOMElement();
  view.rerender(<CouponField {...props} applied="SAVE10" />);
  expect(region).toHaveTextContent("Code SAVE10 applied");
  fireEvent.click(screen.getByRole("button", { name: "Remove coupon SAVE10" }));
  expect(props.onRemove).toHaveBeenCalledTimes(1);
});

it("ties a refusal to the field and announces it", () => {
  render(<CouponField {...props} error="This code has expired." />);
  const input = screen.getByLabelText("Coupon code (optional)");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("This code has expired.");
  expect(screen.getByRole("alert")).toHaveTextContent("This code has expired.");
});
