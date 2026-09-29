// The one event this MVP sells tickets for. Edit freely — changes are applied
// to the database on the next server start (capacity never drops below
// the number of tickets already reserved).
export const EVENT = {
  id: "deep-dive-demo",
  name: "Deep Dive Demo Night",
  tagline: "Free entry. One ticket per person. First come, first served.",
  venue: "Classroom, 3rd semester",
  startsAt: "2026-10-06T18:00:00+02:00",
  capacity: 50,
  ticketPrefix: "DD",
};

export function formatEventDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(iso));
}
