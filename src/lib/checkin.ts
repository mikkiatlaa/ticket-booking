import type { Ticket } from "./booking";
import { getDb } from "./db";

export type Guest = Pick<
  Ticket,
  "code" | "ticket_id" | "name" | "email" | "phone" | "status" | "checked_in_at" | "checked_in_by"
>;

/** Numbers for the door screen: how many are inside right now, out of how many seats. */
export type Headcount = { inside: number; capacity: number };

export type CheckInResult =
  | ({ result: "OK"; guest: Guest } & Headcount)
  | ({ result: "ALREADY_IN"; guest: Guest } & Headcount)
  | { result: "INVALID"; reason: string };

const GUEST_COLUMNS = `code, ticket_id, name, email, phone, status, checked_in_at, checked_in_by`;

/**
 * The QR code holds the full ticket link (https://…/ticket/ABCD-EFGH).
 * Accept that, or a bare code typed in by hand.
 */
export function parseTicketCode(input: string) {
  const match = input.trim().match(/([23456789A-Z]{4}-[23456789A-Z]{4})\/?$/i);
  return match ? match[1].toUpperCase() : null;
}

async function headcount(eventId: string): Promise<Headcount> {
  const db = await getDb();
  const [row] = await db.query<Headcount>(
    `SELECT (SELECT count(*)::int FROM tickets WHERE event_id = $1 AND status = 'CHECKED_IN') AS inside,
            (SELECT capacity FROM events WHERE id = $1) AS capacity`,
    [eventId],
  );
  return row;
}

/**
 * Let a guest in at THIS event's door. One conditional UPDATE: only a CONFIRMED
 * ticket for this event can become CHECKED_IN, so if two doors scan the same
 * ticket at the same moment, exactly one succeeds and the other is told
 * "already inside". A ticket for a different event is refused.
 */
export async function checkIn(input: string, admin: string, eventId: string): Promise<CheckInResult> {
  const code = parseTicketCode(input);
  if (!code) return { result: "INVALID", reason: "Not a ticket QR code." };

  const db = await getDb();
  const [guest] = await db.query<Guest>(
    `UPDATE tickets
        SET status = 'CHECKED_IN', checked_in_at = now(), checked_in_by = $2
      WHERE code = $1 AND event_id = $3 AND status = 'CONFIRMED'
     RETURNING ${GUEST_COLUMNS}`,
    [code, admin, eventId],
  );
  if (guest) return { result: "OK", guest, ...(await headcount(eventId)) };

  // The update matched nothing: work out why.
  const [existing] = await db.query<Guest & { event_id: string; event_name: string }>(
    `SELECT ${GUEST_COLUMNS.split(", ").map((c) => `t.${c}`).join(", ")}, t.event_id, e.name AS event_name
       FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.code = $1`,
    [code],
  );
  if (!existing) return { result: "INVALID", reason: "Ticket not found." };
  if (existing.event_id !== eventId) return { result: "INVALID", reason: `This ticket is for ${existing.event_name}.` };
  if (existing.status === "CHECKED_IN") return { result: "ALREADY_IN", guest: existing, ...(await headcount(eventId)) };
  return { result: "INVALID", reason: "Ticket was cancelled." };
}

/** Undo a check-in scanned by mistake. Same pattern, the other direction. */
export async function undoCheckIn(code: string) {
  const db = await getDb();
  const [guest] = await db.query<Guest>(
    `UPDATE tickets
        SET status = 'CONFIRMED', checked_in_at = NULL, checked_in_by = NULL
      WHERE code = $1 AND status = 'CHECKED_IN'
     RETURNING ${GUEST_COLUMNS}`,
    [code],
  );
  return guest ?? null;
}

export async function listGuests(eventId: string) {
  const db = await getDb();
  const guests = await db.query<Guest>(
    `SELECT ${GUEST_COLUMNS} FROM tickets
      WHERE event_id = $1 AND status <> 'CANCELLED'
      ORDER BY ticket_number`,
    [eventId],
  );
  const inside = guests
    .filter((g) => g.status === "CHECKED_IN")
    .sort((a, b) => new Date(b.checked_in_at!).getTime() - new Date(a.checked_in_at!).getTime());
  const notArrived = guests.filter((g) => g.status === "CONFIRMED");
  return {
    counts: { total: guests.length, inside: inside.length, notArrived: notArrived.length },
    inside,
    notArrived,
  };
}
