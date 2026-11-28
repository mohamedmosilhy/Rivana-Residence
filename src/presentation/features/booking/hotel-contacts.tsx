import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import type { StayTimes } from "./stay-dates";

/** What a page that belongs to no branch knows about each active one. */
export type GuestHotel = HotelContactDetails &
  Readonly<{ name: string; times: StayTimes }>;

/** Every hotel's contacts, for a guest whose booking the page does not know. */
export function HotelContacts({
  hotels,
}: Readonly<{ hotels: readonly GuestHotel[] }>) {
  if (hotels.length === 0)
    return <p className="m-0">Please contact the hotel for help.</p>;
  return (
    <ul className="m-0 grid min-w-0 list-none gap-3 p-0">
      {hotels.map((hotel) => (
        <li key={hotel.slug} className="grid min-w-0">
          <p className="m-0 font-medium wrap-anywhere text-plum-900">
            {hotel.name}
          </p>
          <HotelContact contact={hotel} />
        </li>
      ))}
    </ul>
  );
}
