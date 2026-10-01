import { getDb } from "./db";

export type Event = {
  id: string;
  slug: string;
  name: string;
  organizer: string | null;
  genre: string | null;
  tagline: string | null;
  venue: string;
  area: string | null;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  reserved: number;
  ticketPrefix: string;
  lineup: string[];
  status: "draft" | "live";
};

const EVENT_SQL = `SELECT id, slug, name, organizer, genre, tagline, venue, area, starts_at, ends_at,
                          capacity, reserved, ticket_prefix, lineup, status
                     FROM events`;

type Row = Omit<Event, "startsAt" | "endsAt" | "ticketPrefix"> & {
  starts_at: string | Date;
  ends_at: string | Date | null;
  ticket_prefix: string;
};

function toEvent({ starts_at, ends_at, ticket_prefix, ...rest }: Row): Event {
  return {
    ...rest,
    startsAt: new Date(starts_at).toISOString(),
    endsAt: ends_at ? new Date(ends_at).toISOString() : null,
    ticketPrefix: ticket_prefix,
  };
}

/** Public lookup: only live events can be opened or booked by slug. */
export async function getLiveEventBySlug(slug: string) {
  const db = await getDb();
  const [row] = await db.query<Row>(`${EVENT_SQL} WHERE slug = $1 AND status = 'live'`, [slug]);
  return row ? toEvent(row) : null;
}

/** Any status. For tickets and admin pages, which already know the event exists. */
export async function getEventById(id: string) {
  const db = await getDb();
  const [row] = await db.query<Row>(`${EVENT_SQL} WHERE id = $1`, [id]);
  return row ? toEvent(row) : null;
}

export async function getEventBySlug(slug: string) {
  const db = await getDb();
  const [row] = await db.query<Row>(`${EVENT_SQL} WHERE slug = $1`, [slug]);
  return row ? toEvent(row) : null;
}

/** Soonest first. Past events are only listed when asked for. */
export async function listEvents({ liveOnly, includePast = false }: { liveOnly: boolean; includePast?: boolean }) {
  const db = await getDb();
  const where = [liveOnly ? "status = 'live'" : "", includePast ? "" : "coalesce(ends_at, starts_at + interval '6 hours') > now()"]
    .filter(Boolean)
    .join(" AND ");
  const rows = await db.query<Row>(`${EVENT_SQL} ${where ? `WHERE ${where}` : ""} ORDER BY starts_at`);
  return rows.map(toEvent);
}

const TIME_ZONE = "Europe/Copenhagen";

/** "Saturday 3 October at 20:00" */
export function formatEventDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** "Saturday 3 October" (no time: the doors time is shown separately) */
export function formatEventDay(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(new Date(iso));
}

/** "20:00" */
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));
}

/** { day: "03", month: "OCT", short: "03/10" } for the big date on cards and heroes. */
export function dateParts(iso: string) {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: TIME_ZONE }).format(d);
  const day = part({ day: "2-digit" });
  return { day, month: part({ month: "short" }).toUpperCase(), short: `${day}/${part({ month: "2-digit" })}` };
}

/** "TONIGHT", "THIS WEEKEND", "THIS MONTH" or "LATER": the word on a poster card. */
export function whenWord(iso: string, now = new Date()) {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // YYYY-MM-DD
  const target = new Date(iso);
  if (key(target) === key(now)) return "TONIGHT";
  const days = Math.round((new Date(key(target)).getTime() - new Date(key(now)).getTime()) / 86_400_000);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TIME_ZONE }).format(target);
  if (days > 0 && days <= 7 && ["Fri", "Sat", "Sun"].includes(weekday)) return "THIS WEEKEND";
  if (key(target).slice(0, 7) === key(now).slice(0, 7)) return "THIS MONTH";
  return "LATER";
}
