// Proves the booking rules under pressure, against a throwaway database.
//   npm run stress
//
// Fires 200 simultaneous reservations at a 50-ticket event, plus duplicate
// emails and double-submits, then checks nobody got a ticket that doesn't exist.
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ticket-stress-"));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL; // never touch a real database

const { reserveTicket, getStats } = await import("../src/lib/booking");
const { getDb } = await import("../src/lib/db");
const { SEED_EVENTS } = await import("../src/lib/seed-events");
// A small throwaway event takes the load (50 seats, so 200 requests sell it out).
// A real seeded event proves the two don't affect each other.
const EVENT = { id: "stress", slug: "stress", capacity: 50 };
const OTHER = SEED_EVENTS[0];
await (await getDb()).query(
  `INSERT INTO events (id, slug, name, venue, starts_at, capacity, ticket_prefix)
   VALUES ($1, $2, 'Stress test', 'Lab', now() + interval '1 day', $3, 'ST')`,
  [EVENT.id, EVENT.slug, EVENT.capacity],
);
// A second throwaway event, only for the "wrong door" checks.
await (await getDb()).query(
  `INSERT INTO events (id, slug, name, venue, starts_at, capacity, ticket_prefix)
   VALUES ('stress-b', 'stress-b', 'Stress B', 'Lab', now() + interval '1 day', 5, 'SB')`,
);

const ATTEMPTS = 200;
const sharedKey = randomUUID(); // one "double-clicked" form
const students = Array.from({ length: ATTEMPTS }, (_, i) => ({
  name: `Student ${i}`,
  email: `student${i}@example.test`,
  phone: "42 12 34 56",
  idempotencyKey: randomUUID(),
}));
// The tricky cases go first so they race before the event sells out.
const requests = [
  students[0],
  // Same form submitted three times (double click / network retry).
  ...Array.from({ length: 3 }, () => ({ name: "Clicker", email: "clicker@example.test", phone: "42123456", idempotencyKey: sharedKey })),
  // Same person submitting again from a different page load.
  { name: "Double", email: "Student0@EXAMPLE.test", phone: "42123456", idempotencyKey: randomUUID() },
  ...students.slice(1),
];

const t0 = performance.now();
const results = await Promise.all(requests.map((r) => reserveTicket({ ...r, eventId: EVENT.id })));
const ms = Math.round(performance.now() - t0);

const created = results.filter((r) => r.ok && !r.replayed);
const replayed = results.filter((r) => r.ok && r.replayed);
const count = (reason: string) => results.filter((r) => !r.ok && r.reason === reason).length;

const db = await getDb();
const [{ n: rows }] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM tickets`);
const [{ n: distinctNumbers }] = await db.query<{ n: number }>(
  `SELECT count(DISTINCT ticket_number)::int AS n FROM tickets`,
);
const [{ n: maxPerEmail }] = await db.query<{ n: number }>(
  `SELECT coalesce(max(c), 0)::int AS n FROM (SELECT count(*) AS c FROM tickets GROUP BY lower(email)) t`,
);
const stats = await getStats(EVENT.id);
const clickerTickets = new Set(
  results.filter((r) => r.ok && r.ticket.email === "clicker@example.test").map((r) => r.ok && r.ticket.code),
);

console.log(`\n${requests.length} requests for ${EVENT.capacity} tickets in ${ms} ms\n`);
console.log(`  tickets issued        ${created.length}`);
console.log(`  replayed (same key)   ${replayed.length}`);
console.log(`  sold out              ${count("SOLD_OUT")}`);
console.log(`  already registered    ${count("ALREADY_REGISTERED")}`);
console.log(`  counter               ${stats.reserved} / ${stats.capacity}\n`);

const checks: [string, boolean][] = [];
checks.push(
  ["never more tickets than capacity", rows <= EVENT.capacity],
  ["event sells out exactly", rows === EVENT.capacity],
  ["counter matches tickets in database", stats.reserved === rows],
  ["every ticket number is unique", distinctNumbers === rows],
  ["double-click returns the same ticket", clickerTickets.size === 1 && replayed.length === 2],
  ["second signup with same email is refused", count("ALREADY_REGISTERED") === 1],
  ["one ticket per email", maxPerEmail <= 1],
);
for (const [label, pass] of checks) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);

// --- Door check-in: ten admins scan the same ticket at the same moment. ---
const { checkIn, undoCheckIn, listGuests } = await import("../src/lib/checkin");
const target = created[0].ok ? created[0].ticket : null;
const scanned = `https://example.test/ticket/${target!.code}`; // what the QR contains
const scans = await Promise.all(Array.from({ length: 10 }, (_, i) => checkIn(scanned, `Door ${i}`, EVENT.id)));
const scanCount = (r: string) => scans.filter((s) => s.result === r).length;
const afterScan = await listGuests(EVENT.id);
const undone = await undoCheckIn(target!.code);
const afterUndo = await listGuests(EVENT.id);
const fake = await checkIn("https://example.test/ticket/ZZZZ-ZZZZ", "Door 0", EVENT.id);
const junk = await checkIn("hello world", "Door 0", EVENT.id);

console.log(`\n  10 simultaneous scans: ${scanCount("OK")} let in, ${scanCount("ALREADY_IN")} told "already inside"\n`);
checks.push(
  ["same ticket scanned 10x lets exactly 1 person in", scanCount("OK") === 1 && scanCount("ALREADY_IN") === 9],
  ["guest list shows them inside", afterScan.counts.inside === 1],
  ["undo puts them back to not arrived", !!undone && afterUndo.counts.inside === 0],
  ["unknown ticket is rejected", fake.result === "INVALID"],
  ["non-ticket QR is rejected", junk.result === "INVALID"],
);
for (const [label, pass] of checks.slice(-5)) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);

// --- Door rules per event. ---
const otherTicket = await reserveTicket({
  eventId: "stress-b", name: "Wrong Door", email: "wrongdoor@example.test", phone: "42123456", idempotencyKey: randomUUID(),
});
const wrongDoor = otherTicket.ok ? await checkIn(otherTicket.ticket.code, "Door 0", EVENT.id) : null;
const rightDoor = otherTicket.ok ? await checkIn(otherTicket.ticket.code, "Door 0", "stress-b") : null;
const insideCount = created[1].ok ? await checkIn(created[1].ticket.code, "Door 0", EVENT.id) : null;
console.log("");
checks.push(
  ["a ticket for another event is refused at this door", wrongDoor?.result === "INVALID" && /different|for /.test(wrongDoor.reason)],
  ["the same ticket is accepted at its own event's door", rightDoor?.result === "OK"],
  ["the door screen gets the inside-now count", insideCount?.result === "OK" && insideCount.inside === 1 && insideCount.capacity === EVENT.capacity],
);
for (const [label, pass] of checks.slice(-3)) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);

// --- Several events: the sold-out event must not touch the other one. ---
const full = await reserveTicket({
  eventId: EVENT.id,
  name: "Late",
  email: "late@example.test",
  phone: "42123456",
  idempotencyKey: randomUUID(),
});
const other = await reserveTicket({
  eventId: OTHER.id,
  name: "Other",
  email: "student0@example.test", // same email as a ticket for the first event
  phone: "+45 52 12 34 56",
  idempotencyKey: randomUUID(),
});
const otherStats = await getStats(OTHER.id);
const duplicateSlug = await db
  .query(
    `INSERT INTO events (id, slug, name, venue, starts_at, capacity) VALUES ('clash', $1, 'x', 'x', now(), 1)`,
    [OTHER.slug],
  )
  .then(() => false)
  .catch(() => true);

console.log("");
checks.push(
  ["a sold-out event is still sold out", !full.ok && full.reason === "SOLD_OUT"],
  ["another event still sells while the first is full", other.ok && other.ticket.ticket_number === 1],
  ["each event has its own ticket prefix", other.ok && other.ticket.ticket_id === `${OTHER.ticketPrefix}-001`],
  ["the same email can book a different event", other.ok],
  ["counters are kept per event", otherStats.reserved === 1],
  ["two events cannot share a slug", duplicateSlug],
);
for (const [label, pass] of checks.slice(-6)) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);

// --- Phone numbers: Danish only, always stored the same way. ---
const bad = async (phone: string) =>
  reserveTicket({ eventId: OTHER.id, name: "P", email: `p${Math.random()}@example.test`, phone, idempotencyKey: randomUUID() });
const rejected = await Promise.all(["", "12345678", "4212345", "+46 70 123 45 67", "abcdefgh", "042123456"].map(bad));
const accepted = await Promise.all(
  ["42123456", "+4542123456", "0045 42 12 34 56", "42-12-34-56", "(42) 12.34.56"].map((phone) =>
    reserveTicket({ eventId: OTHER.id, name: "P", email: `ok${Math.random()}@example.test`, phone, idempotencyKey: randomUUID() }),
  ),
);
const storedPhones = new Set(accepted.map((r) => (r.ok ? r.ticket.phone : null)));
// The rule applies to tickets created from 2 October 2026; older ones may have no phone.
const rawInsert = (createdAt: string, n: number) =>
  db
    .query(
      `INSERT INTO tickets (code, event_id, ticket_number, ticket_id, name, email, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, 'x', $5, $6, $7)`,
      [`AAAA-BBB${n}`, OTHER.id, 900 + n, `X-90${n}`, `raw${n}@example.test`, `raw-key-1234567890abcdef${n}`, createdAt],
    )
    .then(() => true)
    .catch(() => false);
const newWithoutPhone = await rawInsert("2026-10-05T12:00:00+02:00", 1);
const legacyWithoutPhone = await rawInsert("2026-09-30T12:00:00+02:00", 2);

console.log("");
checks.push(
  ["numbers that are not Danish are refused", rejected.every((r) => !r.ok && r.reason === "INVALID" && r.field === "phone")],
  ["Danish numbers are accepted in any common spelling", accepted.every((r) => r.ok)],
  ["every accepted number is stored as +45XXXXXXXX", storedPhones.size === 1 && storedPhones.has("+4542123456")],
  ["the database itself refuses a new ticket without a phone", !newWithoutPhone],
  ["tickets from before the phone rule are still allowed", legacyWithoutPhone],
);
for (const [label, pass] of checks.slice(-5)) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
rmSync(dir, { recursive: true, force: true });
process.exit(checks.every(([, pass]) => pass) ? 0 : 1);
