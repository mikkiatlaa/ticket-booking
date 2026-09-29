import type { Sql, TransactionSql } from "postgres";
import { EVENT } from "./event";

// A tiny database interface so the same SQL runs on two drivers:
//  - DATABASE_URL set   -> real Postgres (e.g. Neon) via postgres.js
//  - DATABASE_URL unset -> embedded Postgres (PGlite) stored in ./.pglite
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  capacity    INT NOT NULL CHECK (capacity >= 0),
  reserved    INT NOT NULL DEFAULT 0,
  -- Last line of defence: the database itself refuses to oversell.
  CONSTRAINT not_oversold CHECK (reserved <= capacity)
);

CREATE TABLE IF NOT EXISTS tickets (
  code             TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL REFERENCES events(id),
  ticket_number    INT NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'CONFIRMED'
                   CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  -- Same form submission twice (double click, retry) -> same ticket.
  idempotency_key  TEXT NOT NULL UNIQUE,
  email_status     TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (email_status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  email_error      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, ticket_number)
);

-- One active ticket per email address per event.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_per_email
  ON tickets (event_id, lower(email)) WHERE status <> 'CANCELLED';
`;

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
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(statement);
  }
  await db.query(
    `INSERT INTO events (id, name, venue, starts_at, capacity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       venue = EXCLUDED.venue,
       starts_at = EXCLUDED.starts_at,
       capacity = GREATEST(EXCLUDED.capacity, events.reserved)`,
    [EVENT.id, EVENT.name, EVENT.venue, EVENT.startsAt, EVENT.capacity],
  );
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
