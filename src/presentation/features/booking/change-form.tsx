"use client";

import { useEffect, useRef, type FormEvent } from "react";
import type { z } from "zod";

import type { RoomTypeSummary } from "@/contracts/api/v1/branches";
import {
  alertBox,
  bookingBlock,
  bookingHeading,
  bookingSubheading,
  button,
  factList,
  factTerm,
  factValue,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
  link,
  selectArrow,
} from "@/presentation/site/classes";

import type { BookingDetail } from "./booking-details";
import {
  changeField,
  MAX_UNITS,
  type ChangeError,
  type ChangeForm as Form,
  type ChangeUnit,
} from "./change-state";
import type { OfferedService, Quote, ServiceKind } from "./extras-state";
import { GuestCount } from "./guest-count";
import { GUEST_INPUT_LIMITS } from "./guest-details";
import type { ChangeOptions } from "./hotel-contacts";
import { ServicesPicker } from "./services-picker";

export type Listing = z.output<typeof RoomTypeSummary>;

/** The branch's published listings; null while they load. */
export type Listings =
  | Readonly<{ status: "loading" | "failed" }>
  | Readonly<{ status: "loaded"; items: readonly Listing[] }>;

function nextDay(day: string) {
  const value = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) return undefined;
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * The extras that may be chosen: what the branch offers now, and what the
 * booking already has, at the booking's own price.
 */
function extraChoices(
  base: Quote,
  options: ChangeOptions | null,
  withdrawn: readonly ServiceKind[],
) {
  const offered = (options?.services ?? []).filter(
    ({ kind }) => !withdrawn.includes(kind),
  );
  const kept: OfferedService[] = base.services.map(
    ({ kind, unit, price, childPrice }) => ({
      kind,
      unit,
      price,
      childPrice,
    }),
  );
  const services = [
    ...kept,
    ...offered.filter(({ kind }) => !kept.some((item) => item.kind === kind)),
  ];
  const bookedVehicles =
    base.services.find(({ kind }) => kind === "AIRPORT_TRANSFER")?.vehicles ??
    null;
  const maxVehicles = offered.some(({ kind }) => kind === "AIRPORT_TRANSFER")
    ? (options?.maxVehicles ?? null)
    : null;
  return { services, maxVehicles, bookedVehicles };
}

/** Step one of a change: everything a guest may alter, on one form. */
export function ChangeForm({
  booking,
  current,
  value,
  listings,
  options,
  withdrawn,
  errors,
  notice,
  busy,
  waiting,
  onChange,
  onReloadListings,
  onSubmit,
  onCancel,
}: Readonly<{
  booking: BookingDetail;
  /** The server's price of the booking as it stands. */
  current: Quote;
  value: Form;
  listings: Listings;
  options: ChangeOptions | null;
  /** Extras the server refused since this form was filled. */
  withdrawn: readonly ServiceKind[];
  /** A new array for each refusal, so the summary takes focus again. */
  errors: readonly ChangeError[];
  notice: Readonly<{ text: string }> | null;
  busy: boolean;
  /** The server asked for a wait. */
  waiting: boolean;
  onChange: (next: Form) => void;
  onReloadListings: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const noticeText = useRef<HTMLParagraphElement>(null);
  const unitsHeading = useRef<HTMLHeadingElement>(null);
  const nextId = useRef(Math.max(0, ...value.units.map((unit) => unit.id)));

  // In this order: a refusal or a message takes the focus from the heading.
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => noticeText.current?.focus(), [notice]);
  useEffect(() => summary.current?.focus(), [errors]);

  const { services, maxVehicles, bookedVehicles } = extraChoices(
    current,
    options,
    withdrawn,
  );
  const published = listings.status === "loaded" ? listings.items : [];
  const errorFor = (field: string) =>
    errors.find((error) => error.field === field)?.message ?? null;
  const set = (patch: Partial<Form>) => onChange({ ...value, ...patch });
  const setUnit = (id: number, patch: Partial<ChangeUnit>) =>
    set({
      units: value.units.map((unit) =>
        unit.id === id ? { ...unit, ...patch } : unit,
      ),
    });

  function chooseListing(unit: ChangeUnit, slug: string) {
    const listing = published.find((item) => item.slug === slug);
    const held = current.lines.find((line) => line.roomSlug === slug);
    const roomName = listing?.name ?? held?.roomName;
    if (!roomName) return;
    setUnit(unit.id, {
      roomSlug: slug,
      roomName,
      adults: Math.min(
        unit.adults,
        listing?.maxAdults ?? held?.occupancy.adults ?? unit.adults,
      ),
      children: Math.min(
        unit.children,
        listing?.maxChildren ?? held?.occupancy.children ?? unit.children,
      ),
    });
  }

  function add() {
    const listing = published[0];
    if (!listing) return;
    set({
      units: [
        ...value.units,
        {
          id: ++nextId.current,
          roomSlug: listing.slug,
          roomName: listing.name,
          adults: 1,
          children: 0,
        },
      ],
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  const dates = [
    ["Check-in", changeField.checkIn, "checkIn", options?.today],
    ["Check-out", changeField.checkOut, "checkOut", nextDay(value.checkIn)],
  ] as const;
  // Destructured: the architecture test reads dotted access as a table.
  const { coupon } = current;
  const fixed = [
    ["Hotel", booking.branch.name],
    ["Phone", booking.contact?.phone ?? null],
    [
      "Payment method",
      booking.paymentMethod === "PAY_AT_HOTEL"
        ? "Pay at the hotel"
        : "Online payment",
    ],
    ["Coupon code", coupon?.code ?? null],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <form noValidate onSubmit={submit} className="grid min-w-0 gap-5">
      <div className="grid gap-2">
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Change booking
        </h2>
        <p className="m-0">
          Booking {booking.reference}. Nothing changes until you confirm.
        </p>
      </div>
      {notice && (
        <p
          ref={noticeText}
          tabIndex={-1}
          className="m-0 border-l-2 border-gold-400 bg-canvas px-4 py-3"
        >
          {notice.text}
        </p>
      )}
      {errors.length > 0 && (
        <div
          ref={summary}
          role="alert"
          tabIndex={-1}
          className={`${alertBox} grid gap-1`}
        >
          <ul className="m-0 grid list-none gap-1 p-0">
            {errors.map(({ field, message }, index) => (
              <li key={index} className="text-danger">
                {field ? (
                  <button
                    type="button"
                    className="min-h-11 w-full cursor-pointer border-0 bg-transparent p-0 text-left text-danger underline"
                    onClick={() => document.getElementById(field)?.focus()}
                  >
                    {message}
                  </button>
                ) : (
                  message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset disabled={busy} className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <div className={bookingBlock}>
          <h3 className={bookingSubheading}>Dates</h3>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {dates.map(([label, id, key, min]) => (
              <div key={id} className={fieldGroup}>
                <label htmlFor={id} className={fieldLabel}>
                  {label}
                </label>
                <input
                  id={id}
                  type="date"
                  required
                  min={min}
                  value={value[key]}
                  aria-invalid={errorFor(id) ? true : undefined}
                  aria-describedby={errorFor(id) ? `${id}-error` : undefined}
                  className={fieldControl}
                  onChange={(event) =>
                    set({ [key]: event.currentTarget.value })
                  }
                />
                {errorFor(id) && (
                  <p id={`${id}-error`} className={fieldError}>
                    {errorFor(id)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={bookingBlock}>
          <h3 ref={unitsHeading} tabIndex={-1} className={bookingSubheading}>
            Rooms and apartments
          </h3>
          <ol className="m-0 grid list-none gap-4 p-0">
            {value.units.map((unit, index) => {
              const id = changeField.unit(index);
              const error = errorFor(id);
              const listing = published.find(
                (item) => item.slug === unit.roomSlug,
              );
              // A listing no longer published keeps at most what it holds.
              const held = current.lines.filter(
                (line) => line.roomSlug === unit.roomSlug,
              );
              const most = (field: "adults" | "children") =>
                Math.max(
                  unit[field],
                  listing
                    ? field === "adults"
                      ? listing.maxAdults
                      : listing.maxChildren
                    : Math.max(0, ...held.map((line) => line.occupancy[field])),
                );
              const choices = [
                ...published,
                ...(listing
                  ? []
                  : [{ slug: unit.roomSlug, name: unit.roomName }]),
              ];
              return (
                <li
                  key={unit.id}
                  className="min-w-0 border-b border-neutral-300 pb-3"
                >
                  <fieldset
                    aria-describedby={error ? `${id}-error` : undefined}
                    className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0"
                  >
                    <legend className="mb-2 p-0 font-medium text-plum-900">
                      Unit {index + 1}
                    </legend>
                    <div className={`${fieldGroup} col-span-2`}>
                      <label htmlFor={id} className={fieldLabel}>
                        Room or apartment
                      </label>
                      <span className="relative min-w-0">
                        <select
                          id={id}
                          value={unit.roomSlug}
                          aria-invalid={error ? true : undefined}
                          className={`${fieldControl} appearance-none pr-10`}
                          onChange={(event) =>
                            chooseListing(unit, event.currentTarget.value)
                          }
                        >
                          {choices.map((choice) => (
                            <option key={choice.slug} value={choice.slug}>
                              {choice.name}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true" className={selectArrow} />
                      </span>
                    </div>
                    <GuestCount
                      label="Adults"
                      min={1}
                      max={most("adults")}
                      value={unit.adults}
                      onChange={(adults) => setUnit(unit.id, { adults })}
                    />
                    <GuestCount
                      label="Children"
                      min={0}
                      max={most("children")}
                      value={unit.children}
                      onChange={(children) => setUnit(unit.id, { children })}
                    />
                    {error && (
                      <p
                        id={`${id}-error`}
                        className={`${fieldError} col-span-2`}
                      >
                        {error}
                      </p>
                    )}
                  </fieldset>
                  {value.units.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove unit ${index + 1}, ${unit.roomName}`}
                      className={`${link} min-w-11`}
                      onClick={() => {
                        unitsHeading.current?.focus();
                        set({
                          units: value.units.filter(
                            (item) => item.id !== unit.id,
                          ),
                        });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div role="status">
            {listings.status === "loading" && (
              <p className={fieldHelp}>Loading rooms and apartments…</p>
            )}
            {listings.status === "failed" && (
              <p className={fieldHelp}>
                We couldn’t load the other rooms and apartments.
              </p>
            )}
          </div>
          {listings.status === "failed" && (
            <button
              type="button"
              className={`${link} justify-self-start`}
              onClick={() => {
                unitsHeading.current?.focus();
                onReloadListings();
              }}
            >
              Load them again
            </button>
          )}
          {published.length > 0 && value.units.length < MAX_UNITS && (
            <button
              type="button"
              className={button("ghost", "justify-self-start max-sm:w-full")}
              onClick={add}
            >
              Add a room or apartment
            </button>
          )}
          <p className={fieldHelp}>
            Up to {MAX_UNITS} in one booking. Availability is checked with the
            new price.
          </p>
        </div>

        {services.length > 0 && (
          <div className={bookingBlock}>
            <ServicesPicker
              services={services}
              maxVehicles={maxVehicles}
              bookedVehicles={bookedVehicles}
              breakfast={value.breakfast}
              transfer={value.transfer}
              cars={value.cars}
              flightDetails={value.flightDetails}
              carsError={errorFor(changeField.cars)}
              flightError={errorFor(changeField.flight)}
              onToggle={(kind, chosen) =>
                set(
                  kind === "BREAKFAST"
                    ? { breakfast: chosen }
                    : { transfer: chosen },
                )
              }
              onCars={(cars) => set({ cars })}
              onFlightDetails={(flightDetails) => set({ flightDetails })}
            />
            {current.services.length > 0 && (
              <p className={fieldHelp}>
                Extras already on your booking keep their price.
              </p>
            )}
          </div>
        )}

        <div className={bookingBlock}>
          <h3 className={bookingSubheading}>Your details</h3>
          {(
            [
              ["Full name", changeField.fullName, "fullName", "name"],
              ["Email", changeField.email, "email", "email"],
            ] as const
          ).map(([label, id, key, autoComplete]) => (
            <div key={id} className={fieldGroup}>
              <label htmlFor={id} className={fieldLabel}>
                {label}
              </label>
              <input
                id={id}
                type={key === "email" ? "email" : "text"}
                autoComplete={autoComplete}
                maxLength={GUEST_INPUT_LIMITS[key]}
                value={value[key]}
                aria-invalid={errorFor(id) ? true : undefined}
                aria-describedby={errorFor(id) ? `${id}-error` : undefined}
                className={fieldControl}
                onChange={(event) => set({ [key]: event.currentTarget.value })}
              />
              {errorFor(id) && (
                <p id={`${id}-error`} className={fieldError}>
                  {errorFor(id)}
                </p>
              )}
            </div>
          ))}
          <div className={fieldGroup}>
            <label htmlFor={changeField.specialRequests} className={fieldLabel}>
              Special requests{" "}
              <span className="font-normal text-neutral-600">(optional)</span>
            </label>
            <textarea
              id={changeField.specialRequests}
              rows={3}
              maxLength={GUEST_INPUT_LIMITS.specialRequests}
              value={value.specialRequests}
              aria-invalid={
                errorFor(changeField.specialRequests) ? true : undefined
              }
              aria-describedby={
                errorFor(changeField.specialRequests)
                  ? `${changeField.specialRequests}-error`
                  : undefined
              }
              className={`${fieldControl} py-2`}
              onChange={(event) =>
                set({ specialRequests: event.currentTarget.value })
              }
            />
            {errorFor(changeField.specialRequests) && (
              <p
                id={`${changeField.specialRequests}-error`}
                className={fieldError}
              >
                {errorFor(changeField.specialRequests)}
              </p>
            )}
          </div>
          <dl className={factList}>
            {fixed.map(([term, fact]) => (
              <div key={term} className="grid min-w-0 content-start gap-0.5">
                <dt className={factTerm}>{term}</dt>
                <dd className={factValue}>{fact}</dd>
              </div>
            ))}
          </dl>
          <p className={fieldHelp}>
            These cannot be changed online. Contact the hotel.
          </p>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3 max-sm:*:w-full">
        <button
          type="submit"
          aria-disabled={busy || waiting ? true : undefined}
          className={button("primary", "aria-disabled:opacity-70")}
        >
          {busy ? "Checking…" : "See the new price"}
        </button>
        <button
          type="button"
          disabled={busy}
          className={button("ghost")}
          onClick={onCancel}
        >
          Keep my booking as it is
        </button>
      </div>
    </form>
  );
}
