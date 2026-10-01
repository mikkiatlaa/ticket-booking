import type { Sql, TransactionSql } from "postgres";
import { SEED_EVENTS } from "./seed-events";

// A tiny database interface so the same SQL runs on two drivers:
//  - DATABASE_URL set   -> real Postgres (e.g. Neon) via postgres.js
//  - DATABASE_URL unset -> embedded Postgres (PGlite) stored in ./.pglite
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

// Each entry runs on startup, so every statement must be safe to repeat.
const SCHEMA = [
  `
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  capacity    INT NOT NULL CHECK (capacity >= 0),
  reserved    INT NOT NULL DEFAULT 0,
  -- Last line of defence: the database itself refuses to oversell.
  CONSTRAINT not_oversold CHECK (reserved <= capacity)
)`,
  `
CREATE TABLE IF NOT EXISTS tickets (
  code             TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL REFERENCES events(id),
  ticket_number    INT NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'CONFIRMED',
  -- Same form submission twice (double click, retry) -> same ticket.
  idempotency_key  TEXT NOT NULL UNIQUE,
  email_status     TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (email_status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  email_error      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, ticket_number)
)`,
  // One active ticket per email address per event.
  `CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_per_email
     ON tickets (event_id, lower(email)) WHERE status <> 'CANCELLED'`,
  // Several events: each has its own web address (slug), unique per event,
  // and its own ticket prefix (DD-001, UB-001, ...).
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS slug TEXT
     CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`,
  `UPDATE events SET slug = id WHERE slug IS NULL`,
  `ALTER TABLE events ALTER COLUMN slug SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS events_slug_key ON events (slug)`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_prefix TEXT NOT NULL DEFAULT 'TK'`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS tagline TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS area TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`,
  // Only live events show up in public lists and can be booked.
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live'
     CHECK (status IN ('draft', 'live'))`,
  // What the public event cards and pages show. `organizer` is plain text until
  // organizer accounts exist.
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS genre TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS lineup TEXT[] NOT NULL DEFAULT '{}'`,
  // Human-readable ID (DD-001): public-facing only, the random "code" stays the
  // secret in links and QR codes. It used to be computed by Postgres with one
  // fixed prefix; now the app writes it, so drop that formula but keep old values.
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_id TEXT`,
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_attribute
        WHERE attrelid = 'tickets'::regclass AND attname = 'ticket_id' AND attgenerated <> ''
     ) THEN
       ALTER TABLE tickets ALTER COLUMN ticket_id DROP EXPRESSION;
     END IF;
   END $$`,
  `ALTER TABLE tickets ALTER COLUMN ticket_id SET NOT NULL`,
  // Every RSVP has a phone number: stored as +45XXXXXXXX (Danish numbers only).
  // Tickets made before this rule (older than the cutoff) have none, so the
  // database only demands one from newer tickets.
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone TEXT`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_phone_check') THEN
       ALTER TABLE tickets ADD CONSTRAINT tickets_phone_check CHECK (
         coalesce(phone ~ '^\\+45[2-9][0-9]{7}$', false)
         OR created_at < '2026-10-02T00:00:00+02:00'
       );
     END IF;
   END $$`,
  // Door check-in: who scanned the ticket, and when.
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checked_in_by TEXT`,
  // Allowed ticket states. Replaced only when the list changes, so older
  // databases (created before CHECKED_IN existed) get upgraded in place.
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'tickets_status_check'
          AND pg_get_constraintdef(oid) LIKE '%CHECKED_IN%'
     ) THEN
       ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
       ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
         CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CANCELLED'));
     END IF;
   END $$`,
];

async function createDb(): Promise<Db> {
  // Vercel's Neon integration may name it either way.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!url && process.env.VERCEL) {
    throw new Error(
      "No database configured: connect Neon in Vercel → Storage (sets DATABASE_URL), then redeploy.",
    );
  }

  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { max: 5, prepare: false });
    const wrap = (s: Sql | TransactionSql): Db => ({
      query: async (text, params = []) => (await s.unsafe(text, params as never[])) as never,
      transaction: async (fn) => {
        if (!("begin" in s)) throw new Error("Nested transactions are not supported");
        return (await s.begin((tx: TransactionSql) => fn(wrap(tx)))) as never;
      },
    });
    return wrap(sql);
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(process.env.PGLITE_DIR ?? "./.pglite");
  type Q = Pick<typeof pg, "query">;
  const wrap = (q: Q, root: boolean): Db => ({
    query: async <T,>(text: string, params: unknown[] = []) =>
      (await q.query<T>(text, params)).rows,
    transaction: async (fn) => {
      if (!root) throw new Error("Nested transactions are not supported");
      return pg.transaction((tx) => fn(wrap(tx, false)));
    },
  });
  return wrap(pg, true);
}

async function init(): Promise<Db> {
  const db = await createDb();
  for (const statement of SCHEMA) await db.query(statement);
  for (const e of SEED_EVENTS) {
    await db.query(
      `INSERT INTO events (id, slug, name, organizer, genre, tagline, venue, area, starts_at, ends_at,
                           capacity, ticket_prefix, lineup)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               ARRAY(SELECT jsonb_array_elements_text($13::jsonb)))
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         name = EXCLUDED.name,
         organizer = EXCLUDED.organizer,
         genre = EXCLUDED.genre,
         tagline = EXCLUDED.tagline,
         venue = EXCLUDED.venue,
         area = EXCLUDED.area,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         ticket_prefix = EXCLUDED.ticket_prefix,
         lineup = EXCLUDED.lineup,
         capacity = GREATEST(EXCLUDED.capacity, events.reserved)`,
      [
        e.id, e.slug, e.name, e.organizer, e.genre, e.tagline, e.venue, e.area, e.startsAt, e.endsAt,
        e.capacity, e.ticketPrefix, JSON.stringify(e.lineup),
      ],
    );
  }
  return db;
}

// One connection per server process (survives dev hot-reloads).
const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__db ??= init().catch((err) => {
    globalForDb.__db = undefined;
    throw err;
  });
  return globalForDb.__db;
}
