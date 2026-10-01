# Ticket booking

Free event tickets. Pick an event, RSVP with name, email and a Danish phone number, get a QR ticket by email.
Door staff scan guests in with a phone. Built with Astro (server rendering) on Vercel, with Postgres on Neon.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:4321
```

With no `DATABASE_URL` it uses a small embedded database in `./.pglite`, so nothing else is needed.
`npm run reset` wipes it. To try the door pages, copy `.env.example` to `.env` and set `ADMIN_PIN`
(6 or more characters), then open `/admin/login`.

## Pages

| URL | What |
|---|---|
| `/` | Home: next event and what's on |
| `/events` | All upcoming events |
| `/events/<slug>` | One event: details, lineup and the RSVP form |
| `/ticket/<code>` | The guest's ticket with its QR code |
| `/ticket/<code>/email` | Browser preview of the confirmation email |
| `/admin/login` | Door staff log in with the shared PIN and their name |
| `/admin/scan` | Camera scanner: full-screen IN, ALREADY USED or NOT VALID |
| `/admin/guests` | Who is inside, who has not arrived, search and manual check-in |
| `/api/stats?event=<slug>` | `{ capacity, reserved, remaining }` |

Admin pages always show a blue **ADMIN MODE** bar and a blue frame, and the bar also appears on the public
site while you are logged in.

## Events

Events live in the database. The starting events are in `src/lib/seed-events.ts`: edit them there and
restart. Each event's `slug` is its own web address and must be unique.

## Rules the code enforces

- **Never oversold.** One conditional update claims a seat: `reserved < capacity`. The database also
  refuses `reserved > capacity` as a last line of defence.
- **One ticket per email per event.** A repeat sign-up is refused and gives the seat back.
- **Phone is required, Danish only.** Eight digits starting 2-9, with or without +45. Stored as `+45XXXXXXXX`.
- **Double clicks are safe.** Each form load has a key; the same key returns the same ticket.
- **A ticket only opens its own event's door.** Another event's QR code shows NOT VALID.
- **Email is sent after the booking is saved.** A failed email never cancels a ticket; it can be re-sent
  from the ticket page.

Prove it: `npm run stress` fires 200 simultaneous requests at a 50-seat event on a throwaway database and
checks all of the rules above.

## Deploy (Vercel + Neon)

Environment variables (Vercel, Settings, Environment Variables): `DATABASE_URL` (from Neon), `PUBLIC_URL`,
`SMTP_USER`, `SMTP_PASS` (a Gmail App Password), `ADMIN_PIN`. Pushing to `main` deploys.
The project's framework preset must be **Astro**.
