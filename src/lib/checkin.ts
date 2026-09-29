import type { Ticket } from "./booking";
import { getDb } from "./db";
import { EVENT } from "./event";

export type Guest = Pick<
  Ticket,
  "code" | "ticket_id" | "name" | "email" | "status" | "checked_in_at" | "checked_in_by"
>;

export type CheckInResult =
  | { result: "OK"; guest: Guest }
  | { result: "ALREADY_IN"; guest: Guest }
  | { result: "INVALID"; reason: string };

const GUEST_COLUMNS = `code, ticket_id, name, email, status, checked_in_at, checked_in_by`;

/**
 * The QR code holds the full ticket link (https://…/ticket/ABCD-EFGH).
 * Accept that, or a bare code typed in by hand.
 */
export function parseTicketCode(input: string) {
  const match = input.trim().match(/([23456789A-Z]{4}-[23456789A-Z]{4})\/?$/i);
  return match ? match[1].toUpperCase() : null;
}

async function findGuest(code: string) {
  const db = await getDb();
  const [guest] = await db.query<Guest>(
    `SELECT ${GUEST_COLUMNS} FROM tickets WHERE code = $1 AND event_id = $2`,
    [code, EVENT.id],
  );
  return guest ?? null;
}

/**
 * Let a guest in. One conditional UPDATE: only a CONFIRMED ticket can become
 * CHECKED_IN, so if two doors scan the same ticket at the same moment,
 * exactly one succeeds and the other is told "already inside".
 */
export async function checkIn(input: string, admin: string): Promise<CheckInResult> {
  const code = parseTicketCode(input);
  if (!code) return { result: "INVALID", reason: "Not a ticket QR code." };

  const db = await getDb();
  const [guest] = await db.query<Guest>(
    `UPDATE tickets
        SET status = 'CHECKED_IN', checked_in_at = now(), checked_in_by = $3
      WHERE code = $1 AND event_id = $2 AND status = 'CONFIRMED'
     RETURNING ${GUEST_COLUMNS}`,
    [code, EVENT.id, admin],
  );
  if (guest) return { result: "OK", guest };

  // The update matched nothing: work out why.
  const existing = await findGuest(code);
  if (!existing) return { result: "INVALID", reason: "Ticket not found." };
  if (existing.status === "CHECKED_IN") return { result: "ALREADY_IN", guest: existing };
  return { result: "INVALID", reason: "Ticket was cancelled." };
}

/** Undo a check-in scanned by mistake. Same pattern, the other direction. */
export async function undoCheckIn(code: string) {
  const db = await getDb();
  const [guest] = await db.query<Guest>(
    `UPDATE tickets
        SET status = 'CONFIRMED', checked_in_at = NULL, checked_in_by = NULL
      WHERE code = $1 AND event_id = $2 AND status = 'CHECKED_IN'
     RETURNING ${GUEST_COLUMNS}`,
    [code, EVENT.id],
  );
  return guest ?? null;
}

export async function listGuests() {
  const db = await getDb();
  const guests = await db.query<Guest>(
    `SELECT ${GUEST_COLUMNS} FROM tickets
      WHERE event_id = $1 AND status <> 'CANCELLED'
      ORDER BY ticket_number`,
    [EVENT.id],
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
