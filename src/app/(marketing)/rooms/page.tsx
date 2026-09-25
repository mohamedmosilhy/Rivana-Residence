import type { Metadata } from "next";

import { getPublishedRooms } from "@/composition/public";
import { CardGrid, RoomCard } from "@/presentation/site/cards";

import { pageMetadata } from "../site-content";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Rooms",
    description: "Room types at Rivana Residence, New Cairo.",
    path: "/rooms",
  });
}

export default async function RoomsPage() {
  const rooms = await getPublishedRooms();
  return (
    <section
      className="site-section site-container"
      aria-labelledby="rooms-title"
    >
      <header className="site-page-header">
        <h1 id="rooms-title">Rooms</h1>
        <p>
          Each room type, with its size, who it sleeps, and what it includes.
        </p>
      </header>
      {rooms.length > 0 ? (
        <CardGrid>
          {rooms.map((room) => (
            <RoomCard key={room.slug} room={room} headingLevel={2} />
          ))}
        </CardGrid>
      ) : (
        <p>Room details are coming soon. Please contact us for information.</p>
      )}
    </section>
  );
}
