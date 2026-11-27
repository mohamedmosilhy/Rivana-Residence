import type { Ref } from "react";

import {
  button,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldLabel,
  link,
} from "@/presentation/site/classes";

/**
 * One coupon code (CP-4). Apply asks the server; the field keeps a refused code
 * so it can be corrected.
 */
export function CouponField({
  value,
  applied,
  checking,
  error,
  inputRef,
  onChange,
  onApply,
  onRemove,
}: Readonly<{
  value: string;
  /** The code the server accepted. */
  applied: string | null;
  checking: boolean;
  error: string | null;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
}>) {
  return (
    <form
      noValidate
      className={fieldGroup}
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <label htmlFor="coupon-code" className={fieldLabel}>
        Coupon code (optional)
      </label>
      <div className="flex min-w-0 flex-wrap gap-3">
        <input
          ref={inputRef}
          id="coupon-code"
          name="coupon"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          value={value}
          readOnly={checking}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coupon-error" : undefined}
          className={`${fieldControl} flex-1 basis-48 uppercase`}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          type="submit"
          aria-disabled={checking ? true : undefined}
          className={button("ghost", "aria-disabled:opacity-70 max-sm:w-full")}
        >
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && (
        <p id="coupon-error" role="alert" className={fieldError}>
          {error}
        </p>
      )}
      <div role="status">
        {applied && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 border-l-2 border-success bg-canvas px-4 py-1">
            <p className="m-0 min-w-0 text-small wrap-anywhere text-success">
              Code {applied} applied
            </p>
            <button
              type="button"
              aria-label={`Remove coupon ${applied}`}
              className={`${link} min-w-11`}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
