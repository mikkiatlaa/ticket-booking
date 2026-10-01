// Events that exist from the start. Edit freely — changes are applied to the
// database on the next server start (capacity never drops below the number of
// tickets already reserved). Later, organizers will create events themselves.
//
// `slug` is the event's own web address (/events/<slug>): lowercase letters,
// numbers and dashes, and unique per event.
export type SeedEvent = {
  id: string;
  slug: string;
  name: string;
  organizer: string;
  genre: string | null;
  tagline: string | null;
  venue: string;
  area: string | null;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  ticketPrefix: string;
  lineup: string[];
};

export const SEED_EVENTS: SeedEvent[] = [
  {
    id: "stairway",
    slug: "urban-breakout-showcase-stairway",
    name: "Urban Breakout Showcase: Stairway",
    organizer: "Urban Breakout",
    genre: "HIP-HOP",
    tagline: "Free entry. Sign up to get in.",
    venue: "Stairway",
    area: "Vanløse",
    // Doors 20:00, ends 00:30.
    startsAt: "2026-10-03T20:00:00+02:00",
    endsAt: "2026-10-04T00:30:00+02:00",
    capacity: 320,
    ticketPrefix: "UB",
    lineup: ["Carl Knast", "Slalum", "Max Felix", "marius"],
  },
  {
    id: "deep-dive-demo",
    slug: "deep-dive-demo",
    name: "Deep Dive Demo Night",
    organizer: "Deep Dive",
    genre: null,
    tagline: "Free entry. One ticket per person. First come, first served.",
    venue: "Classroom, 3rd semester",
    area: null,
    startsAt: "2026-10-06T18:00:00+02:00",
    endsAt: null,
    capacity: 50,
    ticketPrefix: "DD",
    lineup: [],
  },
];
