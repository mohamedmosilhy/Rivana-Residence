/** The adults or children of one unit, as a native list. */
export function GuestCount({
  label,
  min,
  max,
  value,
  onChange,
  id,
}: Readonly<{
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  id?: string;
}>) {
  return (
    <label className="grid min-w-0 gap-1 text-small font-medium text-plum-900">
      {label}
      <span className="relative min-w-0">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-11 w-full min-w-0 appearance-none rounded-none border border-control-border bg-surface pr-8 pl-2 text-base text-neutral-950"
        >
          {Array.from(
            { length: max - min + 1 },
            (_, offset) => min + offset,
          ).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-2 -translate-y-3/4 rotate-45 border-r border-b border-current"
        />
      </span>
    </label>
  );
}
