import { randomInt } from "node:crypto";
import { getDb } from "./db";
import { normalizeDanishPhone } from "./phone";

export type Ticket = {
  code: string;
  ticket_id: string;
  event_id: string;
  ticket_number: number;
  name: string;
  email: string;
  phone: string | null;
  status: "CONFIRMED" | "CHECKED_IN" | "CANCELLED";
  email_status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  email_error: string | null;
  created_at: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
};

export type Stats = { capacity: number; reserved: number; remaining: number };

export type ReserveField = "name" | "email" | "phone";

export type ReserveResult =
  | { ok: true; ticket: Ticket; replayed: boolean }
  | {
      ok: false;
      reason: "SOLD_OUT" | "ALREADY_REGISTERED" | "INVALID";
      message: string;
      /** For INVALID: which input to point at. */
      field?: ReserveField;
    };

const UNIQUE_VIOLATION = "23505";
// No 0/O/1/I/L so codes are easy to read out loud at the door.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function newTicketCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getStats(eventId: string): Promise<Stats> {
  const db = await getDb();
  const [row] = await db.query<{ capacity: number; reserved: number }>(
    `SELECT capacity, reserved FROM events WHERE id = $1`,
    [eventId],
  );
  return { ...row, remaining: row.capacity - row.reserved };
}

export async function getTicket(code: string): Promise<Ticket | null> {
  const db = await getDb();
  const [ticket] = await db.query<Ticket>(`SELECT * FROM tickets WHERE code = $1`, [code]);
  return ticket ?? null;
}

async function findByIdempotencyKey(key: string) {
  const db = await getDb();
  const [ticket] = await db.query<Ticket>(
    `SELECT * FROM tickets WHERE idempotency_key = $1`,
    [key],
  );
  return ticket ?? null;
}

/**
 * Reserve one free ticket.
 *
 * Everything happens in ONE short transaction:
 *   1. Replay check  — same idempotency key? return the ticket we already made.
 *   2. Claim a spot  — conditional UPDATE: only succeeds while reserved < capacity.
 *                      Postgres locks the event row, so concurrent requests queue
 *                      up and each one re-checks the condition. No overselling.
 *   3. Issue ticket  — INSERT. If this email already has a ticket, the unique
 *                      index fails the insert and the whole transaction (including
 *                      step 2) rolls back, so the spot is given back automatically.
 *
 * Slow side effects (sending email) happen AFTER commit, never inside the lock.
 */
export async function reserveTicket(input: {
  eventId: string;
  name: string;
  email: string;
  phone: string;
  idempotencyKey: string;
}): Promise<ReserveResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizeDanishPhone(input.phone);
  const key = input.idempotencyKey.trim();

  if (!name || name.length > 80) {
    return { ok: false, reason: "INVALID", field: "name", message: "Enter your name." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, reason: "INVALID", field: "email", message: "Enter a valid email address." };
  }
  if (!phone) {
    return {
      ok: false,
      reason: "INVALID",
      field: "phone",
      message: "Enter a Danish phone number: 8 digits, for example 42 12 34 56.",
    };
  }
  if (!/^[\w-]{16,64}$/.test(key)) {
    return { ok: false, reason: "INVALID", message: "Reload the page and try again." };
  }

  const db = await getDb();

  try {
    return await db.transaction(async (tx): Promise<ReserveResult> => {
      const [existing] = await tx.query<Ticket>(
        `SELECT * FROM tickets WHERE idempotency_key = $1`,
        [key],
      );
      if (existing) return { ok: true, ticket: existing, replayed: true };

      const [claimed] = await tx.query<{ reserved: number; ticket_prefix: string }>(
        `UPDATE events
            SET reserved = reserved + 1
          WHERE id = $1 AND reserved < capacity AND status = 'live'
         RETURNING reserved, ticket_prefix`,
        [input.eventId],
      );
      if (!claimed) {
        return { ok: false, reason: "SOLD_OUT", message: "All tickets are gone." };
      }

      const ticketId = `${claimed.ticket_prefix}-${String(claimed.reserved).padStart(3, "0")}`;
      const [ticket] = await tx.query<Ticket>(
        `INSERT INTO tickets (code, event_id, ticket_number, ticket_id, name, email, phone, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [newTicketCode(), input.eventId, claimed.reserved, ticketId, name, email, phone, key],
      );
      return { ok: true, ticket, replayed: false };
    });
  } catch (err) {
    if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;

    // A concurrent request with the same key won the race: hand back its ticket.
    const replay = await findByIdempotencyKey(key);
    if (replay) return { ok: true, ticket: replay, replayed: true };

    return {
      ok: false,
      reason: "ALREADY_REGISTERED",
      field: "email",
      message: "This email already has a ticket. Check your inbox and spam folder.",
    };
  }
}

export async function setEmailStatus(
  code: string,
  status: Ticket["email_status"],
  error: string | null = null,
) {
  const db = await getDb();
  await db.query(`UPDATE tickets SET email_status = $2, email_error = $3 WHERE code = $1`, [
    code,
    status,
    error,
  ]);
}
