import type { Metadata } from "next";

import { getPublishedRooms } from "@/composition/public";
import { CardGrid, RoomCard } from "@/presentation/site/cards";
import { PageHero } from "@/presentation/site/heroes";

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
    <>
      <PageHero
        eyebrow="Stay with us"
        title="Rooms"
        titleId="rooms-title"
        intro="Each room type, with its size, who it sleeps, and what it includes."
      />
      <section
        className="site-section site-container"
        aria-labelledby="rooms-title"
      >
        {rooms.length > 0 ? (
          <CardGrid>
            {rooms.map((room, index) => (
              <RoomCard
                key={room.slug}
                room={room}
                index={index}
                headingLevel={2}
              />
            ))}
          </CardGrid>
        ) : (
          <p className="site-empty">
            Room details are coming soon. Please contact us for information.
          </p>
        )}
      </section>
    </>
  );
}
