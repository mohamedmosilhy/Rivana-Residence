import { button } from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

export const staySearchFields = [
  "checkIn",
  "checkOut",
  "adults",
  "children",
] as const;
export type StaySearchField = (typeof staySearchFields)[number];

const fields = {
  checkIn: { label: "Check-in", type: "date" },
  checkOut: { label: "Check-out", type: "date" },
  adults: { label: "Adults", type: "number" },
  children: { label: "Children", type: "number" },
} as const;

export const searchFeedbackId = "search-feedback";
const feedbackClass = "scroll-mt-[calc(var(--header-height-compact)+1.5rem)]";

export function SearchFeedback({
  title,
  message,
}: Readonly<{ title: string; message?: string }>) {
  return (
    <div
      className="border-l-2 border-danger bg-canvas px-4 py-3 text-neutral-950"
      role="alert"
    >
      <h2
        id={searchFeedbackId}
        tabIndex={-1}
        className={`m-0 font-medium text-danger ${feedbackClass}`}
      >
        {title}
      </h2>
      {message && <p className="mt-1 mb-0 text-small">{message}</p>}
    </div>
  );
}

export function StaySearchForm({
  action,
  values,
  room,
  errors,
  firstCheckIn,
  firstCheckOut,
  lastCheckIn,
  lastCheckOut,
}: Readonly<{
  action: string;
  values: Record<StaySearchField, string>;
  room: string | null;
  errors: Partial<Record<StaySearchField, string>>;
  firstCheckIn: string;
  firstCheckOut: string;
  lastCheckIn: string;
  lastCheckOut: string;
}>) {
  const invalid = Object.keys(errors).length > 0;

  return (
    <form
      method="get"
      action={`${action}#${searchFeedbackId}`}
      aria-label="Stay search"
    >
      {room && <input type="hidden" name="room" value={room} />}
      {invalid && <SearchFeedback title="Check your search details" />}
      <fieldset
        className={`m-0 grid min-w-0 gap-4 border-0 p-0 ${invalid ? "mt-4" : ""}`}
      >
        <legend className="sr-only">
          Stay dates and guests per room or apartment
        </legend>
        <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] lg:items-start">
          {staySearchFields.map((name) => {
            const { label, type } = fields[name];
            const error = errors[name];
            const id = `stay-${name}`;
            const min = {
              checkIn: firstCheckIn,
              checkOut: firstCheckOut,
              adults: 1,
              children: 0,
            }[name];
            const max =
              name === "checkIn"
                ? lastCheckIn
                : name === "checkOut"
                  ? lastCheckOut
                  : undefined;
            return (
              <div
                key={name}
                className={`grid min-w-0 content-start gap-2 ${type === "date" ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <label
                  htmlFor={id}
                  className="text-small leading-6 font-medium text-plum-900"
                >
                  {label}
                </label>
                <input
                  id={id}
                  name={name}
                  type={type}
                  inputMode={type === "number" ? "numeric" : undefined}
                  min={min}
                  max={max}
                  step={type === "number" ? 1 : undefined}
                  required
                  defaultValue={values[name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className="min-h-13 w-full min-w-0 rounded-none border border-control-border bg-surface px-3 text-left text-base text-neutral-950 tabular-nums aria-invalid:border-danger [&::-webkit-date-and-time-value]:text-left"
                />
                {error && (
                  <p id={`${id}-error`} className="m-0 text-small text-danger">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
          <button
            type="submit"
            className={button(
              "primary",
              "col-span-2 w-full max-[24rem]:px-4 lg:col-span-1 lg:mt-8 lg:w-auto",
            )}
          >
            Check availability
            <Icon name="arrow" className="size-5 shrink-0" />
          </button>
        </div>
        <p className="m-0 text-small text-neutral-600">
          Enter guests per room or apartment.
        </p>
      </fieldset>
    </form>
  );
}
