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
const { EVENT } = await import("../src/lib/event");

const ATTEMPTS = 200;
const sharedKey = randomUUID(); // one "double-clicked" form
const students = Array.from({ length: ATTEMPTS }, (_, i) => ({
  name: `Student ${i}`,
  email: `student${i}@example.test`,
  idempotencyKey: randomUUID(),
}));
// The tricky cases go first so they race before the event sells out.
const requests = [
  students[0],
  // Same form submitted three times (double click / network retry).
  ...Array.from({ length: 3 }, () => ({ name: "Clicker", email: "clicker@example.test", idempotencyKey: sharedKey })),
  // Same person submitting again from a different page load.
  { name: "Double", email: "Student0@EXAMPLE.test", idempotencyKey: randomUUID() },
  ...students.slice(1),
];

const t0 = performance.now();
const results = await Promise.all(requests.map((r) => reserveTicket(r)));
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
const stats = await getStats();
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
const scans = await Promise.all(Array.from({ length: 10 }, (_, i) => checkIn(scanned, `Door ${i}`)));
const scanCount = (r: string) => scans.filter((s) => s.result === r).length;
const afterScan = await listGuests();
const undone = await undoCheckIn(target!.code);
const afterUndo = await listGuests();
const fake = await checkIn("https://example.test/ticket/ZZZZ-ZZZZ", "Door 0");
const junk = await checkIn("hello world", "Door 0");

console.log(`\n  10 simultaneous scans: ${scanCount("OK")} let in, ${scanCount("ALREADY_IN")} told "already inside"\n`);
checks.push(
  ["same ticket scanned 10x lets exactly 1 person in", scanCount("OK") === 1 && scanCount("ALREADY_IN") === 9],
  ["guest list shows them inside", afterScan.counts.inside === 1],
  ["undo puts them back to not arrived", !!undone && afterUndo.counts.inside === 0],
  ["unknown ticket is rejected", fake.result === "INVALID"],
  ["non-ticket QR is rejected", junk.result === "INVALID"],
);
for (const [label, pass] of checks.slice(-5)) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
rmSync(dir, { recursive: true, force: true });
process.exit(checks.every(([, pass]) => pass) ? 0 : 1);
