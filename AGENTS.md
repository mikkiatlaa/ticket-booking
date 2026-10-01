# Ticket booking (Astro)

Free event tickets: pick an event, RSVP with name, email and a Danish phone number, get a QR ticket by email,
door staff scan guests in. Astro (server output) on Vercel, Postgres on Neon.

## Read before writing Astro code
Astro 7 is newer than most training data. Check https://docs.astro.build before using an API from memory.

## Rules
- Entry points (pages, endpoints) stay thin. Business rules live in `src/lib`. Only `src/lib/db.ts` talks to the database.
- Every statement in `SCHEMA` (db.ts) must be safe to run again: it runs on every server start. Add migrations there.
- Slow work (sending email) happens after the database transaction commits, never inside it.
- Money does not exist yet. Tickets are free. Paid tickets (MobilePay) are a later phase.
- Never put secrets in the repo. Environment variables are set in Vercel by the owner.

## Design
Brand tokens and components: `src/styles/global.css`. Source of truth: the screenshots and docs in
`../ticket-platform/docs/DESIGN-SYSTEM.md`. Pure black background, pink text, green actions, blue selected state.
Copy voice: short, plain, no exclamation marks. Admin pages must always show the ADMIN MODE bar.
